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
const WASM_KEY = Symbol.for("wj.wasm");
const ENGINE_KEY = Symbol.for("wj.engine");
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

export async function start({ wisp, cache = true, fast = false, onrestart = () => {} }) {
  const page = pageId();
  const prefix = `/~/wj/${page}/`;
  let worker = null;
  let fastOn = !!fast;
  let n = 0;
  const waiting = new Map(); // request id -> resolve, for stats/clear
  let lastPong = Date.now();
  const restarts = [];

  function spawn() {
    const w = new Worker("/wj/worker.mjs", { type: "module", name: "WillieJet" });
    const booted = new Promise((resolve, reject) => {
      w.addEventListener("message", ({ data }) => {
        if (data?.t === "ready") resolve();
        else if (data?.t === "error") reject(new Error(data.error));
        else if (data?.t === "pong") lastPong = Date.now();
        else if (waiting.has(data?.id)) { waiting.get(data.id)(data); waiting.delete(data.id); }
      });
      w.addEventListener("error", (e) => reject(new Error(e.message || "WillieJet worker failed to start")), { once: true });
    });
    w.postMessage({ t: "init", page, wisp, cache, fast: fastOn });
    worker = w;
    lastPong = Date.now();
    register();
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

  // the rewriter, for proxied pages to borrow (the worker loads its own)
  const wasm = fetch("/scramjet/scramjet.wasm").then((r) => r.arrayBuffer()).then((b) => { window[WASM_KEY] = new Uint8Array(b); });
  await Promise.all([spawn(), wasm]);

  let restarting = false;
  setInterval(async () => {
    if (restarting) return;
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
    setFast(on) { fastOn = !!on; worker.postMessage({ t: "fast", on: fastOn }); },
    warm(url) { worker.postMessage({ t: "warm", url }); },
    async stats() { return (await ask({ t: "stats" }))?.stats ?? null; },
    async clear() { await ask({ t: "clear" }); },
  };
}
