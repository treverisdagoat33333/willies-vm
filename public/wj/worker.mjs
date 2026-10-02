/*!
 * william's vm — WillieJet engine worker
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 *
 * WillieJet is our own proxy engine built on the Scramjet v2 core, which is
 * used as-is (AGPL-3.0, MercuryWorkshop). This file is ours.
 *
 * Everything heavy happens here, off the page's main thread: the network
 * (libcurl over /wisp/, TLS included), the smart cache, and rewriting every
 * HTML, JS and CSS file. The service worker hands requests straight to this
 * worker over a MessagePort, so the page and the sites in it never block on
 * any of it.
 *
 * Messages in (from the page): {t:'init'}, and ports tagged {t:'sw'} (the
 * service worker's line to us) and {t:'transport'} (a proxied window's
 * line, for WebSockets and cookie writes).
 */
import * as SJ from "/scramjet/scramjet.mjs";
import { CachingTransport, RewriteCache } from "/wj/cache.mjs";
import { FastTransport } from "/wj/fast.mjs";
import { isAdHost, blockedResponse } from "/wj/adblock.mjs";

const CORE = "/scramjet/scramjet.js";
const INJECT = "/wj/inject.js";
const WASM = "/scramjet/scramjet.wasm";
const COOKIE_CHANNEL = "wj-cookies";

const me = Math.random().toString(36).slice(2, 10);
let page = "";
let prefix = "";
let handler = null;
let transport = null;
let jar = null;
let sjconfig = null;
let context = null;
let fast = null; // FastTransport: /wj-net when fast mode is on, libcurl otherwise
let httpCache = null; // CachingTransport, unless caching is off (incognito)
let rewrites = null; // RewriteCache
const ads = { on: false, skip: new Set(), blocked: 0, byHost: {} }; // the ad blocker; skip: sites it's off for
let ready = null;
const REWRITABLE = new Set(["script", "style", "worker", "sharedworker"]);
const rewriteKey = (url) => url.replace(`/~/wj/${page}/`, "/~/wj/_/"); // the same in every desktop tab and session

const codecEncode = (u) => (u ? encodeURIComponent(u) : u);
const codecDecode = (u) => (u ? decodeURIComponent(u) : u);

/* ---------- cookies: one jar per worker, saved to IndexedDB, shared live ---------- */

const channel = new BroadcastChannel(COOKIE_CHANNEL);
const acks = new Map(); // id -> resolve

function idb() {
  return (idb.p ||= new Promise((resolve, reject) => {
    const r = indexedDB.open("williejet", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
/* A read that never answers (a worker that froze mid-write still holds the store
   until the browser tears it down) must not stop the engine starting: give up after 3 s. */
async function kvGet(key) {
  const read = idb().then((db) => new Promise((resolve) => {
    const q = db.transaction("kv").objectStore("kv").get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => resolve(undefined);
  }));
  return Promise.race([read, new Promise((resolve) => setTimeout(() => resolve(undefined), 3000))]);
}
let saveT = null;
function saveCookies() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try {
      const db = await idb();
      db.transaction("kv", "readwrite").objectStore("kv").put(jar.dump(), "cookies");
    } catch (_) {}
  }, 150);
}

/* Tell every proxied window (and the other tabs' workers) about new cookies.
   For subresources, wait until one window has them, so a script that reads
   document.cookie right after its fetch resolves sees them. Navigations don't
   wait: the new page gets the jar inside its inject script. */
const COOKIE_READERS = new Set(["script", "worker", "sharedworker", "serviceworker", "empty", ""]);
const COOKIE_WAIT = 50;
async function shareCookies(cookies, options = {}) {
  saveCookies();
  const id = me + ":" + Math.random().toString(36).slice(2);
  const list = cookies.map(({ url, cookie }) => ({ url: String(url), cookie }));
  // Only something that runs and could read document.cookie straight away (a script, a
  // worker, a fetch or XHR) waits for the page to take the cookie, and only briefly: the
  // message gets there in a few ms. Waiting up to a second here cost every file with a
  // cookie a full second while a page was still loading and nothing was listening yet.
  const waits = COOKIE_READERS.has(options.destination ?? "empty");
  const acked = waits ? new Promise((resolve) => { acks.set(id, resolve); setTimeout(resolve, COOKIE_WAIT); }) : null;
  channel.postMessage({ wj: "cookie", src: me, id, cookies: list, options });
  if (acked) await acked;
  acks.delete(id);
}

let jarWanted = null;
channel.onmessage = ({ data }) => {
  if (!data || typeof data !== "object") return;
  if (data.wj === "jar?" && data.src !== me && jar) return channel.postMessage({ wj: "jar", to: data.src, dump: jar.dump() });
  if (data.wj === "jar" && data.to === me) return jarWanted?.(data.dump);
  if (data.wj === "ack") return acks.get(data.id)?.();
  if (data.wj === "cookie" && data.src !== me && jar) {
    if (data.options?.clear) jar.clear();
    for (const c of data.cookies || []) {
      try { jar.setCookies(c.cookie, new URL(c.url)); } catch (_) {}
    }
  }
};

/* ---------- what every proxied page gets injected ---------- */

/* Runs here and, serialized, inside proxied pages (for document.write and
   about:blank frames), so it must not use anything outside its arguments. */
function makeInjector(core, inject, page, prefix, sjconfig, jar) {
  return (meta, handler, htmlcontext, script) => {
    const b64 = (text) => {
      const bytes = new TextEncoder().encode(text);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const init = `$wj.load({page:${JSON.stringify(page)},prefix:${JSON.stringify(prefix)},core:${JSON.stringify(core)},inject:${JSON.stringify(inject)},sjconfig:${JSON.stringify(sjconfig)},cookies:${JSON.stringify(jar.dump())},initHeaders:${JSON.stringify(htmlcontext.headers ?? [])},history:${JSON.stringify(htmlcontext.history ?? [])},makeInjector:${makeInjector.toString()}})`;
    return [script(core), script(inject), script("data:text/javascript;charset=utf-8;base64," + b64(init))];
  };
}

/* Workers a site starts get the core and the rewriter, from plain cached files. */
function workerInjector(meta, isModule, script) {
  const setup = `(()=>{const S=self.$scramjet;S.setWasm(Uint8Array.from(atob(self.WASM),c=>c.charCodeAt(0)));delete self.WASM;
const client=new S.ScramjetClient(globalThis,{context:{config:${JSON.stringify(sjconfig)},prefix:new URL(${JSON.stringify(prefix)},location.origin),interface:{codecEncode:${codecEncode.toString()},codecDecode:${codecDecode.toString()}}},transport:null});client.hook()})();`;
  return script(CORE) + script("/wj/wasm.js") + script("data:text/javascript;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(setup))));
}

/* ---------- start up ---------- */

/* libcurl is 2 MB to download and compile. With fast mode on, a page's GETs go
   to /wj-net and don't need it, so it loads in the background instead of
   holding up the first page; anything that does need it (a form, a WebSocket,
   a fallback) waits for it. With fast mode off it's awaited at start. */
class LazyCurl {
  constructor(wisp) {
    this.wisp = wisp;
    this.ready = true;
    this.client = null;
    this.loading = null;
  }
  load() {
    return (this.loading ||= import("/libcurl/index.mjs").then(async ({ default: Curl }) => {
      const c = new Curl({ wisp: this.wisp });
      await c.init();
      return (this.client = c);
    }).catch((e) => { this.loading = null; throw e; }));
  }
  init() { return this.load(); }
  meta() {}
  async request(...args) { return (this.client || (await this.load())).request(...args); }
  connect(url, protocols, headers, onopen, onmessage, onclose, onerror) {
    if (this.client) return this.client.connect(url, protocols, headers, onopen, onmessage, onclose, onerror);
    let real = null;
    let closed = null;
    const queue = [];
    this.load().then((c) => {
      if (closed) return onclose(closed[0] ?? 1000, closed[1] ?? "");
      real = c.connect(url, protocols, headers, onopen, onmessage, onclose, onerror);
      for (const d of queue.splice(0)) real[0](d);
    }, (e) => onerror(String(e?.message || e)));
    return [(d) => (real ? real[0](d) : queue.push(d)), (code, reason) => (real ? real[1](code, reason) : (closed = [code, reason]))];
  }
}

/* Helpers: extra copies of this worker that rewrite scripts and stylesheets in
   parallel, one per spare CPU core (engine.mjs starts them). The main worker
   stays the only way in: it owns the preload lists and the rewrite cache, and
   hands a file to the least busy helper, or does it itself if none answers. */
let isHelper = false;
const helpers = []; // {port, busy, waiting: Map(id -> resolve)}
let helperN = 0;
async function init({ page: p, wisp, cache, fast: fastOn, fastSkip, ads: adsOn, adsSkip, preload: preloadAtStart = true, helper = false, restarted = false }) {
  page = p;
  isHelper = !!helper;
  preloadOn = !!preloadAtStart && !isHelper;
  ads.on = !!adsOn;
  ads.skip = new Set(adsSkip || []);
  prefix = `/~/wj/${page}/`;
  // the rewriter, the cookies and the preload lists, all at once
  const [wasmBytes, saved, learned] = await Promise.all([
    fetch(WASM).then((r) => r.arrayBuffer()),
    kvGet("cookies").catch(() => null),
    cache && !helper ? kvGet("preload").catch(() => null) : null,
  ]);
  SJ.setWasm(wasmBytes);

  jar = new SJ.CookieJar();
  if (typeof saved === "string") jar.load(saved);
  // a restarted worker, or a helper: the running ones hold the live jar, newer than the saved
  // copy (the very first start has nobody to ask, so it doesn't wait)
  const live = !helper && !restarted ? null : await new Promise((resolve) => {
    jarWanted = resolve;
    channel.postMessage({ wj: "jar?", src: me });
    setTimeout(() => resolve(null), 250);
  });
  jarWanted = null;
  if (typeof live === "string") jar.load(live);
  if (Array.isArray(learned)) manifests = new Map(learned);

  const curl = new LazyCurl(wisp);
  if (fastOn && !helper) curl.load().catch(() => {}); // a helper only needs libcurl if fast mode turns a request down
  else await curl.load();
  fast = new FastTransport(curl, !!fastOn, fastSkip || [], (origin) => self.postMessage({ t: "fastBlocked", origin }));
  traceNet(fast);
  httpCache = cache ? new CachingTransport(fast) : null;
  transport = httpCache || fast;
  if (!transport.ready) await transport.init();

  sjconfig = {
    ...SJ.defaultConfig,
    flags: { ...SJ.defaultConfig.flags, allowFailedIntercepts: true, captureErrors: true, allowInvalidJs: true },
    maskedfiles: ["inject.js", "scramjet.js", "wasm.js"],
  };
  if (httpCache) rewrites = new RewriteCache(`${SJ.versionInfo?.version || "?"}:${SJ.versionInfo?.build || ""}:wj1`);
  context = {
    config: sjconfig,
    prefix: new URL(prefix, location.origin),
    cookieJar: jar,
    interface: {
      getInjectScripts: makeInjector(CORE, INJECT, page, prefix, sjconfig, jar),
      getWorkerInjectScripts: workerInjector,
      codecEncode,
      codecDecode,
    },
  };
  handler = new SJ.ScramjetFetchHandler({
    crossOriginIsolated: self.crossOriginIsolated,
    context,
    transport,
    sendSetCookie: shareCookies,
    fetchBlobUrl: async (url) => SJ.BareResponse.fromNativeResponse(await fetch(url)),
    fetchDataUrl: async (url) => SJ.BareResponse.fromNativeResponse(await fetch(url)),
  });
}

/* ---------- requests from the service worker ---------- */

const NULL_BODY = new Set([101, 103, 204, 205, 304]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* libcurl's own failures (DNS, connect, TLS, timeouts): another engine won't do better */
const isNetworkError = (msg) => /error code \d+|resolve|timed? ?out|connect|refused|certificate|network/i.test(msg);

function errorPage(url, err) {
  const msg = String(err?.message || err || "Unknown error");
  const network = isNetworkError(msg);
  const html = `<!doctype html><meta charset="utf-8"><title>Couldn't load</title><style>body{font:15px system-ui,sans-serif;background:#0d1017;color:#e8ebf1;display:grid;place-items:center;min-height:90vh;margin:0}main{max-width:520px;padding:24px}h1{font-size:20px;margin:0 0 8px}p{color:#9aa3b2;line-height:1.5}code{display:block;background:#161b25;padding:10px;border-radius:8px;color:#f5a3a3;white-space:pre-wrap;word-break:break-word;font-size:12px}button{margin-top:14px;padding:9px 16px;border-radius:9px;border:0;background:#4f8cff;color:#fff;font-weight:600;cursor:pointer}button.alt{background:#232a38}</style>
<main><h1>WillieJet couldn't load this page</h1><p>${esc(url)}</p><code>${esc(msg)}</code><p>${network ? "The site didn't answer. It may be down or blocking proxies." : "Another engine may handle this site better."}</p><button onclick="location.reload()">Try again</button> <button class="alt" data-e="uv">Open with Ultraviolet</button> <button class="alt" data-e="sj2">Open with Scramjet v2</button></main>
<script>const u=${JSON.stringify(String(url))};const tell=m=>{try{parent.postMessage(Object.assign({url:u},m),location.origin)}catch(e){}};
document.querySelectorAll("button.alt").forEach(b=>b.onclick=()=>tell({wj:"switch",engine:b.dataset.e}));
tell({wj:"failed",error:${JSON.stringify(msg)},network:${network}});</script>`;
  return {
    body: html,
    status: 502,
    statusText: "Bad Gateway",
    headers: [["content-type", "text/html; charset=utf-8"], ["cross-origin-embedder-policy", "require-corp"], ["cache-control", "no-store"]],
  };
}

/* ---------- the ad blocker ---------- */

/* the site whose page made this request */
function pageHostOf(req) {
  for (const u of [req.clientUrl, req.referrer]) {
    if (!u || !String(u).includes(prefix)) continue;
    try { return new URL(SJ.unrewriteUrl(u, context)).hostname; } catch (_) {}
  }
  return "";
}

/* Pages you open yourself are never blocked: a document (a popup you opened), or a
   frame with no page behind it (your own tab, when you type an address). Returns
   the real address and the page's site when a request is to be blocked. */
function adTarget(req) {
  if (!ads.on || req.destination === "document") return null;
  let target;
  try { target = new URL(SJ.unrewriteUrl(req.url, context)); } catch (_) { return null; }
  if (!isAdHost(target.hostname)) return null;
  const host = pageHostOf(req);
  if (!host && (req.destination === "iframe" || req.destination === "frame")) return null;
  if (host && (ads.skip.has(host) || isAdHost(host))) return null; // switched off there, or you're on that site
  return { target, host };
}
function adBlock(req) {
  const hit = adTarget(req);
  if (!hit) return null;
  const { target, host } = hit;
  ads.blocked++;
  if (host) ads.byHost[host] = (ads.byHost[host] || 0) + 1;
  return blockedResponse(req.destination, target.href);
}

/* ---------- preloading: a page's scripts and styles, before the browser asks ---------- */

/* A page's own scripts load more scripts, which load more (the HTML, then the main
   bundle, then the chunks it adds, then theirs), and each level waits for the
   last. WillieJet cuts that short two ways:
   - It remembers which scripts and styles each page used (the first 15 s after
     it loads) and, next visit, starts them all at once, as soon as the page's
     own response starts coming in.
   - As a page's HTML and module scripts come through, it starts the files they
     name right away.
   The browser's own requests then take what's already fetched and rewritten. */
const PRELOAD_KEEP = 10000; // an unclaimed preload is dropped after this
const LEARN_FOR = 15000; // how long after a page loads its files are remembered
const LEARN_MAX = 80; // files remembered per page
let preloadOn = true;
const preloads = new Map(); // `${url}|${destination}|${mode}` -> { promise }
const preloadStats = { started: 0, used: 0, wasted: 0 };
const learning = new Map(); // a loading page, by client id and by address -> { keys, list, seen }
const noHash = (u) => String(u || "").split("#")[0];
let manifests = new Map(); // page address -> [{ u, d, m }], most recently used last
const MANIFEST_MAX = 200;
const headerTemplates = {}; // destination -> the headers of the last real request of that kind
const asked = new Set(); // requests the browser has made and are still going: no preloading those
const isDoc = (req) => req.method === "GET" && (req.destination === "document" || req.destination === "iframe" || req.destination === "frame");
const toKey = (url) => { const u = new URL(url); return (u.pathname + u.search).replace(prefix, "/~/wj/_/"); };
const fromKey = (key) => new URL(key.replace("/~/wj/_/", prefix), self.location.origin).href;

/* A page's remembered list is kept under its address (no query or fragment) and
   under its site plus the first part of its path, for pages of the same app not
   visited yet (discord.com/channels/… all share one set of files). */
function pageKeys(url) {
  try {
    const u = new URL(SJ.unrewriteUrl(url, context));
    return [u.origin + u.pathname, u.origin + "/" + (u.pathname.split("/")[1] || "") + "/*"];
  } catch (_) { return []; }
}
const manifestFor = (url) => { const [exact, app] = pageKeys(url); return manifests.get(exact) || manifests.get(app) || null; };

let saveManifestsT = null;
function remember(keys, list) {
  for (const k of keys) { manifests.delete(k); manifests.set(k, list); }
  while (manifests.size > MANIFEST_MAX) manifests.delete(manifests.keys().next().value);
  if (!httpCache) return; // incognito: nothing kept on disk
  clearTimeout(saveManifestsT);
  saveManifestsT = setTimeout(async () => {
    try { (await idb()).transaction("kv", "readwrite").objectStore("kv").put([...manifests], "preload"); } catch (_) {}
  }, 2000);
}

/* the scripts and styles a page asks for while it loads */
function learn(req) {
  if (req.preload || req.method !== "GET" || (req.destination !== "script" && req.destination !== "style")) return;
  // Chrome doesn't always give a page's requests the client id its navigation had,
  // so a page is found by its address too
  const l = learning.get("id:" + req.clientId) || learning.get("url:" + noHash(req.clientUrl));
  if (!l || l.list.length >= LEARN_MAX) return;
  const u = toKey(req.url);
  if (l.seen.has(u)) return;
  l.seen.add(u);
  l.list.push({ u, d: req.destination, m: req.mode });
}
function startLearning(req) {
  const keys = pageKeys(req.url);
  if (!keys.length) return;
  const l = { keys, list: [], seen: new Set() };
  const ids = [req.clientId && "id:" + req.clientId, "url:" + noHash(req.url)].filter(Boolean);
  for (const id of ids) learning.set(id, l);
  setTimeout(() => {
    for (const id of ids) if (learning.get(id) === l) learning.delete(id);
    if (l.list.length) remember(l.keys, l.list);
  }, LEARN_FOR);
}

/* How many preloads run at once. Over HTTP/1.1 (fast mode without HTTP/2) the
   browser allows only 6 connections to our server, and preloads mustn't take
   them all from the page; HTTP/2 and libcurl's one wisp connection have no
   such limit. */
let h2 = null;
function preloadLimit() {
  if (!fast?.on) return 16;
  if (h2 === null) {
    const e = performance.getEntriesByType("resource").find((r) => r.name.endsWith("/wj-net") && r.nextHopProtocol);
    if (e) h2 = /^h[23]/.test(e.nextHopProtocol);
  }
  return (h2 ?? self.location.protocol === "https:") ? 16 : 4;
}
let running = 0;
const queued = []; // preloads waiting for a slot, in the order the page used them
function pump() {
  while (running < preloadLimit() && queued.length) queued.shift()();
}

/* Fetches (and rewrites) one file the way the browser is about to ask for it. */
function preload(url, destination, mode, from) {
  const key = `${url}|${destination}|${mode}`;
  if (!preloadOn || preloads.has(key) || asked.has(key) || preloads.size >= 300) return;
  const headers = headerTemplates[destination] || [
    ...(from.headers || []).filter(([k]) => /^(user-agent|accept-language|sec-ch-ua.*)$/i.test(k)),
    ["accept", destination === "style" ? "text/css,*/*;q=0.1" : "*/*"],
  ];
  const req = { url, method: "GET", headers, body: null, destination, mode, referrer: from.url, cache: "default", clientUrl: from.clientUrl || from.url, clientId: from.clientId, preload: true };
  if (adTarget(req)) return; // the ad blocker would stop the page's own request: don't contact it either
  let go;
  const entry = { waiting: true, dropped: false };
  entry.begin = () => {
    if (!entry.waiting || entry.dropped) return;
    entry.waiting = false;
    running++;
    go();
  };
  entry.promise = new Promise((resolve) => (go = resolve))
    .then(() => fetchOne(req))
    .then(async (out) => ({ ...out, body: out.body == null ? null : await new Response(out.body).arrayBuffer() }))
    .finally(() => { running--; pump(); });
  entry.promise.catch(() => {});
  preloads.set(key, entry);
  preloadStats.started++;
  queued.push(entry.begin);
  pump();
  setTimeout(() => {
    if (preloads.get(key) !== entry) return;
    preloads.delete(key);
    entry.dropped = true;
    preloadStats.wasted++;
  }, PRELOAD_KEEP);
}

/* The browser asking for something already preloaded (or on its way) takes it. */
async function takePreload(req) {
  if (req.preload || req.method !== "GET" || (req.cache && req.cache !== "default")) return null;
  const key = `${req.url}|${req.destination}|${req.mode}`;
  const entry = preloads.get(key);
  if (!entry) return null;
  preloads.delete(key);
  entry.begin(); // still queued: the page needs it now
  const out = await entry.promise.catch(() => null);
  if (!out) return null;
  preloadStats.used++;
  return { ...out, body: out.body ? out.body.slice(0) : null };
}

const TAG = /<(script|link)\b[^>]*>/gi;
const ATTR = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
const JS_TYPE = /^(|module|(text|application)\/(x-)?(java|ecma)script)$/i;
const unescapeAttr = (v) => v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0*39;|&#x0*27;/gi, "'");

/* a <script> or <link> worth preloading: [url, destination, mode] */
function candidate(tag) {
  const name = tag.slice(1, 7).toLowerCase().startsWith("script") ? "script" : "link";
  const a = {};
  for (const m of tag.replace(/^<\w+/, "").replace(/\/?>$/, "").matchAll(ATTR)) a[m[1].toLowerCase()] = unescapeAttr(m[2] ?? m[3] ?? m[4] ?? "");
  let url, destination, mode = "crossorigin" in a ? "cors" : "no-cors";
  if (name === "script") {
    if (!a.src || "nomodule" in a || !JS_TYPE.test((a.type || "").trim())) return null;
    url = a.src;
    destination = "script";
    if ((a.type || "").trim().toLowerCase() === "module") mode = "cors";
  } else {
    const rel = (a.rel || "").toLowerCase().split(/\s+/);
    if (!a.href || rel.includes("alternate")) return null;
    url = a.href;
    if (rel.includes("stylesheet")) destination = "style";
    else if (rel.includes("modulepreload")) { destination = "script"; mode = "cors"; }
    else if (rel.includes("preload") && (a.as === "script" || a.as === "style")) destination = a.as;
    else return null;
  }
  try { url = new URL(url, self.location.origin); } catch (_) { return null; }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(prefix)) return null; // only the site's files, not ours
  return [url.href, destination, mode];
}

/* Reads a copy of a response as text, a chunk at a time, leaving `out.body` for the page. */
async function eachText(out, limit, onText) {
  const b = out.body;
  if (b == null) return;
  if (!(b instanceof ReadableStream)) {
    const text = typeof b === "string" ? b : new TextDecoder().decode(b);
    return void onText(text.slice(0, limit));
  }
  const [a, copy] = b.tee();
  out.body = a;
  const reader = copy.getReader(), dec = new TextDecoder();
  let seen = 0;
  try {
    while (seen < limit) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += value.byteLength ?? value.length;
      onText(typeof value === "string" ? value : dec.decode(value, { stream: true }));
    }
  } catch (_) {} finally {
    reader.cancel().catch(() => {});
  }
}

const headerOf = (out, name) => out.headers.find(([k]) => k.toLowerCase() === name)?.[1] || "";
const MODULE_IMPORT = /(?:\bfrom|\bimport)\s*["']((?:https?:\/\/[^/"']+)?\/~\/wj\/[^"']+)["']/g;

/* After a response: a page starts its remembered files and has its HTML scanned;
   a module script has its static imports started. */
function preloadFrom(req, out) {
  try { startPreloads(req, out); } catch (e) { console.warn("WillieJet preload:", e); } // never at the page's expense
}
function startPreloads(req, out) {
  if (!preloadOn || out.status !== 200) return;
  if (isDoc(req)) {
    if (!req.preload) startLearning(req);
    for (const f of manifestFor(req.url) || []) preload(fromKey(f.u), f.d, f.m, req);
    if (!/text\/html/i.test(headerOf(out, "content-type"))) return;
    let rest = "";
    eachText(out, 1024 * 1024, (text) => {
      rest += text;
      const end = rest.lastIndexOf(">");
      if (end < 0) { if (rest.length > 65536) rest = ""; return; }
      const whole = rest.slice(0, end + 1);
      rest = rest.slice(end + 1);
      for (const [tag] of whole.matchAll(TAG)) {
        const c = candidate(tag);
        if (c) preload(c[0], c[1], c[2], req);
      }
    });
  } else if (req.destination === "script" && req.url.includes("%24module=module")) {
    let text = "";
    eachText(out, 8 * 1024 * 1024, (t) => { text += t; }).then(() => {
      for (const m of text.matchAll(MODULE_IMPORT)) {
        try {
          const url = new URL(m[1], self.location.origin);
          if (url.origin === self.location.origin && url.pathname.startsWith(prefix)) preload(url.href, "script", "cors", { ...req, url: req.url });
        } catch (_) {}
      }
    });
  }
}

async function handleRequest(req) {
  await ready;
  const blocked = adBlock(req);
  if (blocked) return blocked;
  if (req.headers && req.destination) headerTemplates[req.destination] = req.headers.filter(([k]) => /^(accept|accept-language|user-agent|sec-ch-ua.*)$/i.test(k));
  learn(req);
  const pre = await takePreload(req);
  if (pre) return pre;
  const key = `${req.url}|${req.destination}|${req.mode}`;
  asked.add(key);
  try {
    return await fetchOne(req);
  } finally {
    asked.delete(key);
  }
}

/* One request through the rewrite cache, or the network and the rewriter. */
async function fetchOne(req) {
  const rawUrl = new URL(req.url);
  // a script or stylesheet whose download is still fresh: reuse the rewritten copy
  let real = null;
  if (rewrites && req.method === "GET" && REWRITABLE.has(req.destination)) {
    try { real = SJ.unrewriteUrl(req.url, context); } catch (_) {}
    if (real) {
      const hit = await rewrites.get(rewriteKey(req.url), await httpCache.freshVersion(real, req.headers), page);
      if (hit) { preloadFrom(req, hit); return hit; }
    }
  }
  const t0 = tracing ? performance.now() : 0;
  // the rewrite itself is the slow part of a big script: a helper does it, in parallel with the rest
  let helped = real;
  if (!helped && helpers.length && req.method === "GET" && REWRITABLE.has(req.destination)) { try { helped = SJ.unrewriteUrl(req.url, context); } catch (_) {} }
  if (helped && helpers.length && !req.body) {
    const got = await onHelper(req);
    if (got) {
      const out = got.out;
      if (tracing && tracing.rows.length < 2000) tracing.rows.push({ url: String(helped).slice(0, 160), d: req.destination, at: Math.round(t0 - tracing.start), total: Math.round(performance.now() - t0), net: got.net ?? null, size: null, status: out.status, helper: got.h });
      if (got.version && rewrites) out.body = rewrites.keep(rewriteKey(req.url), got.version, out, page);
      preloadFrom(req, out);
      return out;
    }
  }
  try {
    const res = await handler.handleFetch({
      initialHeaders: SJ.ScramjetHeaders.fromRawHeaders(req.headers),
      rawClientUrl: req.clientUrl ? new URL(req.clientUrl) : undefined,
      rawUrl,
      rawReferrer: req.referrer,
      rawDestination: req.destination,
      method: req.method,
      mode: req.mode,
      referrer: req.referrer,
      body: req.body,
      cache: req.cache,
      clientId: req.clientId,
    });
    const out = {
      body: NULL_BODY.has(res.status) ? null : res.body,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers.toRawHeaders(),
    };
    if (tracing && tracing.rows.length < 2000) {
      let r2 = null; try { r2 = SJ.unrewriteUrl(req.url, context); } catch (_) {}
      tracing.rows.push({ url: String(r2 || req.url).slice(0, 160), d: req.destination, at: Math.round(t0 - tracing.start), total: Math.round(performance.now() - t0), net: tracing.net.get(String(r2)) ?? null, size: Number(headerOf(out, "content-length")) || null, status: res.status });
    }
    const version = real && res.status === 200 ? httpCache.versionOf(real) : null;
    if (version) out.body = rewrites.keep(rewriteKey(req.url), version, out, page);
    preloadFrom(req, out);
    return out;
  } catch (e) {
    console.error("WillieJet request failed:", e);
    if (req.destination === "document" || req.destination === "iframe") {
      let real = rawUrl.href;
      try { real = codecDecode(rawUrl.pathname.slice(prefix.length)) + rawUrl.search; } catch (_) {}
      return errorPage(real, e);
    }
    throw e;
  }
}

/* an opt-in trace of where each request's time goes ({t:'trace'}), for tuning: network
   wait (until headers), the whole request with the rewrite, and size */
let tracing = null;
function traceNet(transport) {
  const real = transport.request.bind(transport);
  transport.request = async (remote, method, ...rest) => {
    const t0 = performance.now();
    const r = await real(remote, method, ...rest);
    if (tracing) tracing.net.set(remote.href, Math.round(performance.now() - t0));
    return r;
  };
}

/* main worker: a file to the least busy helper; null if it fails or takes too long (then we do it) */
function onHelper(req) {
  const h = helpers.reduce((a, b) => (b.busy < a.busy ? b : a));
  const id = ++helperN;
  h.busy++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { h.waiting.delete(id); h.busy--; resolve(null); }, 30000);
    h.waiting.set(id, (data) => { clearTimeout(timer); h.busy--; resolve(data.error ? null : { out: data.out, version: data.version, net: data.net, h: helpers.indexOf(h) }); });
    h.port.postMessage({ t: "rw", id, req });
  });
}
function attachHelper(port) {
  const h = { port, busy: 0, waiting: new Map() };
  port.onmessage = ({ data }) => { const done = h.waiting.get(data?.id); h.waiting.delete(data?.id); done?.(data); };
  helpers.push(h);
}
/* helper worker: rewrite what the main worker sends */
function serveMain(port) {
  port.onmessage = async ({ data }) => {
    if (data?.t !== "rw") return;
    await ready;
    const t0 = performance.now();
    try {
      const res = await handler.handleFetch({
        initialHeaders: SJ.ScramjetHeaders.fromRawHeaders(data.req.headers),
        rawClientUrl: data.req.clientUrl ? new URL(data.req.clientUrl) : undefined,
        rawUrl: new URL(data.req.url), rawReferrer: data.req.referrer, rawDestination: data.req.destination,
        method: data.req.method, mode: data.req.mode, referrer: data.req.referrer, body: null, cache: data.req.cache, clientId: data.req.clientId,
      });
      const out = { body: NULL_BODY.has(res.status) ? null : res.body, status: res.status, statusText: res.statusText, headers: res.headers.toRawHeaders() };
      let real = null; try { real = SJ.unrewriteUrl(data.req.url, context); } catch (_) {}
      const version = real && res.status === 200 && httpCache ? httpCache.versionOf(real) : null;
      port.postMessage({ t: "rw", id: data.id, out, version, net: Math.round(performance.now() - t0) }, transferOf(out.body));
    } catch (e) {
      port.postMessage({ t: "rw", id: data.id, error: String(e?.message || e) });
    }
  };
}

const transferOf = (body) => (body instanceof ReadableStream || body instanceof ArrayBuffer ? [body] : []);

function attachServiceWorker(port) {
  port.onmessage = async ({ data, ports }) => {
    if (data?.t === "transport") return attachWindow(ports[0]);
    if (data?.t !== "fetch") return;
    try {
      const res = await handleRequest(data.req);
      port.postMessage({ t: "fetch", id: data.id, res }, transferOf(res.body));
    } catch (e) {
      port.postMessage({ t: "fetch", id: data.id, error: String(e?.message || e) });
    }
  };
}

/* ---------- a proxied window's line: WebSockets, raw requests, cookie writes ---------- */

function attachWindow(port) {
  port.onmessage = async ({ data, ports }) => {
    await ready;
    const reply = (msg, transfer = []) => port.postMessage(msg, transfer);
    switch (data?.t) {
      case "request": {
        try {
          const r = await transport.request(new URL(data.remote), data.method, data.body, data.headers, undefined);
          reply({ t: "request", id: data.id, res: r }, transferOf(r.body));
        } catch (e) {
          reply({ t: "request", id: data.id, error: String(e?.message || e) });
        }
        break;
      }
      case "cookie": {
        if (data.options?.clear) jar.clear();
        for (const c of data.cookies || []) {
          try { jar.setCookies(c.cookie, new URL(c.url)); } catch (_) {}
        }
        saveCookies();
        channel.postMessage({ wj: "cookie", src: me, id: data.id, cookies: data.cookies, options: data.options || {} });
        reply({ t: "cookie", id: data.id });
        break;
      }
      case "ws": {
        const ws = ports[0];
        let opened = false;
        try {
          const [send, close] = transport.connect(
            new URL(data.url), data.protocols || [], data.headers || [],
            (protocol, extensions) => { opened = true; reply({ t: "ws", id: data.id, ok: true, protocol, extensions }); },
            (msg) => ws.postMessage({ type: "data", data: msg }, msg instanceof ArrayBuffer ? [msg] : []),
            (code, reason) => ws.postMessage({ type: "close", code, reason }),
            (error) => { if (!opened) reply({ t: "ws", id: data.id, ok: false, error: String(error) }); else ws.postMessage({ type: "error", error: String(error) }); }
          );
          ws.onmessage = ({ data: m }) => {
            if (m?.type === "data") send(m.data);
            else if (m?.type === "close") close(m.code, m.reason);
          };
        } catch (e) {
          reply({ t: "ws", id: data.id, ok: false, error: String(e?.message || e) });
        }
        break;
      }
    }
  };
}

/* ---------- the page ---------- */

/* Opens a connection to a site before it's visited (a HEAD with no cookies),
   so the real request skips the TCP and TLS handshakes. Once a minute per site. */
const warmed = new Map();
async function warm(url) {
  let origin;
  try { origin = new URL(url).origin; } catch (_) { return; }
  if (!/^https?:/.test(origin) || Date.now() - (warmed.get(origin) || 0) < 60000) return;
  warmed.set(origin, Date.now());
  try {
    const r = await fast.request(new URL(origin + "/"), "HEAD", null, [["User-Agent", navigator.userAgent]], undefined);
    if (r.body instanceof ReadableStream) r.body.cancel().catch(() => {});
  } catch (_) {}
}

self.onmessage = ({ data, ports }) => {
  if (data?.t === "ping") return self.postMessage({ t: "pong", n: data.n });
  if (data?.t === "fast") {
    if (fast) {
      fast.on = !!data.on;
      if (Array.isArray(data.skip)) fast.skip = new Set(data.skip);
    }
    return;
  }
  if (data?.t === "preload") { preloadOn = !!data.on; return; }
  if (data?.t === "trace") {
    if (data.on) { tracing = { start: performance.now(), rows: [], net: new Map() }; return; }
    const rows = tracing?.rows || []; tracing = null;
    return self.postMessage({ t: "trace", id: data.id, rows });
  }
  if (data?.t === "ads") {
    ads.on = !!data.on;
    if (Array.isArray(data.skip)) ads.skip = new Set(data.skip);
    return;
  }
  if (data?.t === "warm") return void ready?.then(() => warm(data.url)).catch(() => {});
  if (data?.t === "stats") {
    return void Promise.resolve(ready).then(() => self.postMessage({
      t: "stats", id: data.id,
      stats: { cache: !!httpCache, http: httpCache?.stats || null, rewrites: rewrites?.stats || null, fast: fast ? { on: fast.on, ...fast.stats } : null, ads: { on: ads.on, blocked: ads.blocked, byHost: ads.byHost }, preload: { on: preloadOn, ...preloadStats, pages: manifests.size } },
    }));
  }
  if (data?.t === "raw") {
    // a site's script as the page ran it (rewritten), so a stack trace's line:column lands on the right code
    return void Promise.resolve(ready).then(async () => {
      let text = null;
      try {
        const r = await fast.request(new URL(data.url), "GET", null, [["User-Agent", navigator.userAgent]], undefined);
        const bytes = new Uint8Array(await new Response(r.body).arrayBuffer());
        if (data.rewrite) {
          const base = new URL(data.url);
          const out = SJ.rewriteJs(bytes, data.url, context, { origin: base, base }, !!data.module);
          text = typeof out === "string" ? out : new TextDecoder().decode(out);
        } else text = new TextDecoder().decode(bytes);
        text = text.slice(0, 8 * 1024 * 1024);
      } catch (_) {}
      self.postMessage({ t: "raw", id: data.id, text });
    });
  }
  if (data?.t === "clear") {
    manifests.clear();
    preloads.clear();
    idb().then((db) => db.transaction("kv", "readwrite").objectStore("kv").delete("preload")).catch(() => {});
    return void Promise.all([httpCache?.clear(), rewrites?.clear()]).then(() => self.postMessage({ t: "cleared", id: data.id }));
  }
  if (data?.t === "init") {
    ready = init(data).then(
      () => self.postMessage({ t: "ready" }),
      (e) => { self.postMessage({ t: "error", error: String(e?.message || e) }); throw e; }
    );
  } else if (data?.t === "sw") attachServiceWorker(ports[0]);
  else if (data?.t === "helper") attachHelper(ports[0]);
  else if (data?.t === "helpers-reset") {
    for (const h of helpers.splice(0)) for (const done of h.waiting.values()) done({ error: "replaced" });
  }
  else if (data?.t === "serve") serveMain(ports[0]);
  else if (data?.t === "transport") attachWindow(ports[0]);
};
