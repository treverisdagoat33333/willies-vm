/*!
 * william's vm — WillieJet (page side)
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 *
 * Starts the engine worker (wj/worker.mjs), shares the rewriter with every
 * proxied page (wj/inject.js), and connects the service worker (wj/sw.js)
 * straight to the worker. The page itself only drives iframes.
 *
 * Prefix: /~/wj/<page>/<encoded url>. <page> is fixed per desktop tab
 * (sessionStorage), so a proxied page's history survives reloading the
 * desktop.
 *
 * Crash recovery: the worker is pinged every 4 s. If it hasn't answered for
 * 20 s (crashed, or stuck), a new one takes its place and `onrestart` runs
 * so the desktop can reload its tabs. At most 3 restarts in 5 minutes, so a
 * site that kills it every time can't loop forever.
 */
import { HIDE_CSS } from "/wj/adblock.mjs";

const WASM_KEY = Symbol.for("wj.wasm");
const ENGINE_KEY = Symbol.for("wj.engine");
const DEBUG_KEY = Symbol.for("wj.debug");
const ADS_KEY = Symbol.for("wj.ads");
const PING_EVERY = 4000;
const DEAD_AFTER = 20000;

function pageId() {
  try {
    let id = sessionStorage.getItem("wj.page");
    if (!id) sessionStorage.setItem("wj.page", (id = Math.random().toString(36).slice(2, 10)));
    return id;
  } catch (_) {
    return Math.random().toString(36).slice(2, 10);
  }
}

export async function start({ wisp, cache = true, fast = false, fastSkip = [], ads = false, adsSkip = [], preload = true, onrestart = () => {}, onfastblocked = () => {} }) {
  const page = pageId();
  const prefix = `/~/wj/${page}/`;
  let worker = null;
  let fastOn = !!fast;
  let skip = [...fastSkip];
  let adsOn = !!ads;
  let adsOff = new Set(adsSkip); // sites the ad blocker is off for
  let preloadOn = !!preload;
  let n = 0;
  const waiting = new Map(); // request id -> resolve, for stats/clear
  let lastPong = Date.now();
  const restarts = [];
  /* helpers rewrite scripts and stylesheets in parallel with the main worker, one per
     spare core (at most 3, and 1 on a device short of memory) */
  const cores = navigator.hardwareConcurrency || 2;
  const HELPERS = (navigator.deviceMemory || 4) <= 2 ? Math.min(1, cores - 1) : Math.max(0, Math.min(3, cores - 1));
  let helpers = [];
  const toAll = (msg) => { worker?.postMessage(msg); for (const h of helpers) h.postMessage(msg); };
  function spawnHelpers() {
    for (const h of helpers) { try { h.terminate(); } catch (_) {} }
    helpers = [];
    worker.postMessage({ t: "helpers-reset" }); // anything sent to the old ones is done by the main worker instead
    for (let i = 0; i < HELPERS; i++) {
      const h = new Worker("/wj/worker.mjs", { type: "module", name: `WillieJet helper ${i + 1}` });
      h.lastPong = Date.now();
      h.addEventListener("message", ({ data }) => { if (data?.t === "pong") h.lastPong = Date.now(); });
      h.postMessage({ t: "init", page, wisp, cache, fast: fastOn, fastSkip: skip, ads: adsOn, adsSkip: [...adsOff], preload: false, helper: true });
      const ch = new MessageChannel();
      h.postMessage({ t: "serve" }, [ch.port2]);
      worker.postMessage({ t: "helper" }, [ch.port1]);
      helpers.push(h);
    }
  }

  function spawn() {
    const w = new Worker("/wj/worker.mjs", { type: "module", name: "WillieJet" });
    const booted = new Promise((resolve, reject) => {
      w.addEventListener("message", ({ data }) => {
        if (data?.t === "ready") resolve();
        else if (data?.t === "error") reject(new Error(data.error));
        else if (data?.t === "pong") lastPong = Date.now();
        else if (data?.t === "fastBlocked") onfastblocked(data.origin);
        else if (waiting.has(data?.id)) { waiting.get(data.id)(data); waiting.delete(data.id); }
      });
      w.addEventListener("error", (e) => reject(new Error(e.message || "WillieJet worker failed to start")), { once: true });
    });
    w.postMessage({ t: "init", page, wisp, cache, fast: fastOn, fastSkip: skip, ads: adsOn, adsSkip: [...adsOff], preload: preloadOn, restarted: !!worker });
    worker = w;
    lastPong = Date.now();
    register();
    // the helpers start once the main worker is up, so they never slow its start
    booted.then(spawnHelpers, () => {});
    return booted;
  }

  // the service worker gets its own line to the worker; again whenever either restarts
  function register() {
    const sw = navigator.serviceWorker.controller;
    if (!sw || !worker) return;
    const ch = new MessageChannel();
    worker.postMessage({ t: "sw" }, [ch.port1]);
    sw.postMessage({ $wj$register: { page } }, [ch.port2]);
  }
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.$wj$revive) register(); });
  navigator.serviceWorker.addEventListener("controllerchange", register);

  const ask = (msg) => new Promise((resolve) => {
    const id = ++n;
    waiting.set(id, resolve);
    worker.postMessage({ ...msg, id });
    setTimeout(() => { if (waiting.delete(id)) resolve(null); }, 5000);
  });

  window[ENGINE_KEY] = { page, connect: (port) => worker.postMessage({ t: "transport" }, [port]) };
  // proxied pages ask this for the rules that hide empty ad boxes (wj/inject.js)
  window[ADS_KEY] = (host) => (adsOn && !adsOff.has(host) ? HIDE_CSS : "");

  // what proxied pages did lately, for "Copy debug info" (wj/inject.js fills it)
  const debug = [];
  window[DEBUG_KEY] = (entry) => {
    debug.push({ at: Date.now(), ...entry });
    if (debug.length > 300) debug.shift();
  };

  // the rewriter, for proxied pages to borrow (the worker loads its own)
  const wasm = fetch("/scramjet/scramjet.wasm").then((r) => r.arrayBuffer()).then((b) => { window[WASM_KEY] = new Uint8Array(b); });
  await Promise.all([spawn(), wasm]);

  let restarting = false;
  setInterval(async () => {
    if (restarting) return;
    // a helper stuck on some script: start a fresh set (the main worker covers meanwhile)
    if (helpers.some((h) => Date.now() - h.lastPong > DEAD_AFTER)) { console.warn("A WillieJet helper stopped answering; replacing the helpers"); spawnHelpers(); }
    for (const h of helpers) h.postMessage({ t: "ping", n: Date.now() });
    if (Date.now() - lastPong < DEAD_AFTER) return worker.postMessage({ t: "ping", n: Date.now() });
    const now = Date.now();
    while (restarts.length && now - restarts[0] > 300000) restarts.shift();
    if (restarts.length >= 3) return; // it keeps dying; leave it to a manual reload
    restarts.push(now);
    restarting = true;
    console.warn("WillieJet stopped answering; restarting it");
    try { worker.terminate(); } catch (_) {}
    try {
      await spawn();
      onrestart();
    } catch (e) {
      console.error("WillieJet restart failed:", e);
    } finally {
      restarting = false;
    }
  }, PING_EVERY);

  return {
    page,
    prefix,
    frame(el) {
      const win = () => el.contentWindow;
      return {
        go(url) { el.src = prefix + encodeURIComponent(url); },
        back() { win()?.history.back(); },
        forward() { win()?.history.forward(); },
        reload() { win()?.location.reload(); },
      };
    },
    /* fast mode on or off; `hosts` are sites it stays off for */
    setFast(on, hosts = skip) { fastOn = !!on; skip = [...hosts]; toAll({ t: "fast", on: fastOn, skip }); },
    /* the ad blocker on or off; `hosts` are sites it stays off for */
    setAds(on, hosts = [...adsOff]) { adsOn = !!on; adsOff = new Set(hosts); toAll({ t: "ads", on: adsOn, skip: [...adsOff] }); },
    helpers: () => helpers.length,
    /* preloading pages' files on or off (on unless you're comparing) */
    setPreload(on) { preloadOn = !!on; worker.postMessage({ t: "preload", on: preloadOn }); },
    warm(url) { worker.postMessage({ t: "warm", url }); },
    /* where each request's time goes: trace(true) starts, trace(false) returns the rows */
    async trace(on) { if (on) { worker.postMessage({ t: "trace", on: true }); return null; } return (await ask({ t: "trace", on: false }))?.rows ?? null; },
    async stats() { return (await ask({ t: "stats" }))?.stats ?? null; },
    async clear() { await ask({ t: "clear" }); },
    debugLog(sinceMs = 10 * 60 * 1000) { return debug.filter((e) => Date.now() - e.at < sinceMs); },
    /* a site's file fetched the way the engine would (no cookies): as the site sent it, or rewritten as the page ran it */
    async source(url, { rewrite = false, module = false } = {}) { return (await ask({ t: "raw", url, rewrite, module }))?.text ?? null; },
  };
}
