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
 */
const WASM_KEY = Symbol.for("wj.wasm");
const ENGINE_KEY = Symbol.for("wj.engine");

function pageId() {
  try {
    let id = sessionStorage.getItem("wj.page");
    if (!id) sessionStorage.setItem("wj.page", (id = Math.random().toString(36).slice(2, 10)));
    return id;
  } catch (_) {
    return Math.random().toString(36).slice(2, 10);
  }
}

export async function start({ wisp, cache = true }) {
  const page = pageId();
  const prefix = `/~/wj/${page}/`;
  const worker = new Worker("/wj/worker.mjs", { type: "module", name: "WillieJet" });

  const booted = new Promise((resolve, reject) => {
    worker.addEventListener("message", function once({ data }) {
      if (data?.t === "ready") resolve();
      else if (data?.t === "error") reject(new Error(data.error));
      else return;
      worker.removeEventListener("message", once);
    });
    worker.addEventListener("error", (e) => reject(new Error(e.message || "WillieJet worker failed to start")), { once: true });
  });
  worker.postMessage({ t: "init", page, wisp, cache });

  // the rewriter, for proxied pages to borrow (the worker loads its own)
  const wasm = fetch("/scramjet/scramjet.wasm").then((r) => r.arrayBuffer()).then((b) => { window[WASM_KEY] = new Uint8Array(b); });

  const connect = (port) => worker.postMessage({ t: "transport" }, [port]);
  window[ENGINE_KEY] = { page, connect };

  // the service worker gets its own line to the worker; again whenever it restarts
  const register = () => {
    const sw = navigator.serviceWorker.controller;
    if (!sw) return;
    const ch = new MessageChannel();
    worker.postMessage({ t: "sw" }, [ch.port1]);
    sw.postMessage({ $wj$register: { page } }, [ch.port2]);
  };
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.$wj$revive) register(); });
  navigator.serviceWorker.addEventListener("controllerchange", register);
  register();

  await Promise.all([booted, wasm]);

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
        /* the real address of what the frame shows, or null */
        url() {
          try {
            const p = win().location.pathname;
            return p.startsWith(prefix) ? decodeURIComponent(p.slice(prefix.length)) + win().location.search : null;
          } catch (_) { return null; }
        },
      };
    },
  };
}
