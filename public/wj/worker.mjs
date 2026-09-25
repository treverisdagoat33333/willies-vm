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
import LibcurlClient from "/libcurl/index.mjs";
import { CachingTransport, RewriteCache } from "/wj/cache.mjs";
import { FastTransport } from "/wj/fast.mjs";

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
async function kvGet(key) {
  const db = await idb();
  return new Promise((resolve) => {
    const q = db.transaction("kv").objectStore("kv").get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => resolve(undefined);
  });
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
async function shareCookies(cookies, options = {}) {
  saveCookies();
  const id = me + ":" + Math.random().toString(36).slice(2);
  const list = cookies.map(({ url, cookie }) => ({ url: String(url), cookie }));
  const nav = options.destination === "document" || options.destination === "iframe";
  const acked = nav ? null : new Promise((resolve) => { acks.set(id, resolve); setTimeout(resolve, 1000); });
  channel.postMessage({ wj: "cookie", src: me, id, cookies: list, options });
  if (acked) await acked;
  acks.delete(id);
}

channel.onmessage = ({ data }) => {
  if (!data || typeof data !== "object") return;
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

async function init({ page: p, wisp, cache, fast: fastOn, fastSkip }) {
  page = p;
  prefix = `/~/wj/${page}/`;
  SJ.setWasm(await (await fetch(WASM)).arrayBuffer());

  jar = new SJ.CookieJar();
  const saved = await kvGet("cookies").catch(() => null);
  if (typeof saved === "string") jar.load(saved);

  fast = new FastTransport(new LibcurlClient({ wisp }), !!fastOn, fastSkip || [], (origin) => self.postMessage({ t: "fastBlocked", origin }));
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

async function handleRequest(req) {
  await ready;
  const rawUrl = new URL(req.url);
  // a script or stylesheet whose download is still fresh: reuse the rewritten copy
  let real = null;
  if (rewrites && req.method === "GET" && REWRITABLE.has(req.destination)) {
    try { real = SJ.unrewriteUrl(req.url, context); } catch (_) {}
    if (real) {
      const hit = await rewrites.get(rewriteKey(req.url), await httpCache.freshVersion(real, req.headers), page);
      if (hit) return hit;
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
    const version = real && res.status === 200 ? httpCache.versionOf(real) : null;
    if (version) out.body = rewrites.keep(rewriteKey(req.url), version, out, page);
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
  if (data?.t === "warm") return void ready?.then(() => warm(data.url)).catch(() => {});
  if (data?.t === "stats") {
    return void Promise.resolve(ready).then(() => self.postMessage({
      t: "stats", id: data.id,
      stats: { cache: !!httpCache, http: httpCache?.stats || null, rewrites: rewrites?.stats || null, fast: fast ? { on: fast.on, ...fast.stats } : null },
    }));
  }
  if (data?.t === "clear") {
    return void Promise.all([httpCache?.clear(), rewrites?.clear()]).then(() => self.postMessage({ t: "cleared", id: data.id }));
  }
  if (data?.t === "init") {
    ready = init(data).then(
      () => self.postMessage({ t: "ready" }),
      (e) => { self.postMessage({ t: "error", error: String(e?.message || e) }); throw e; }
    );
  } else if (data?.t === "sw") attachServiceWorker(ports[0]);
  else if (data?.t === "transport") attachWindow(ports[0]);
};
