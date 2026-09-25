/*!
 * william's vm — WillieJet page inject
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 *
 * Loaded into every page WillieJet proxies, right after the Scramjet core.
 * Hooks the page with Scramjet's client before any of the site's own scripts
 * run, and connects it to the engine worker (for WebSockets and cookie
 * writes; ordinary requests go through the service worker).
 *
 * The rewriter (~600 KB of wasm) is borrowed from the desktop page, which
 * already holds it, instead of every page downloading and decoding its own
 * copy.
 */
(() => {
  const WASM_KEY = Symbol.for("wj.wasm");
  const ENGINE_KEY = Symbol.for("wj.engine");
  const DEBUG_KEY = Symbol.for("wj.debug");
  const ADS_KEY = Symbol.for("wj.ads");
  const LOGINS_KEY = Symbol.for("wj.logins");
  const encode = (u) => (u ? encodeURIComponent(u) : u);
  const decode = (u) => (u ? decodeURIComponent(u) : u);

  /* The nearest same-origin window up the chain that has `key`. */
  function lookUp(key) {
    const seen = [];
    for (let w = self; w && !seen.includes(w); w = w.parent) {
      seen.push(w);
      try { if (w[key]) return w[key]; } catch (_) { break; }
      if (w.parent === w) break;
    }
    try { if (self.opener && self.opener[key]) return self.opener[key]; } catch (_) {}
    return null;
  }

  function rewriterBytes() {
    const shared = lookUp(WASM_KEY);
    if (shared) return shared;
    // a popup with no way back to the desktop: fetch it (it's a cached static file)
    const x = new XMLHttpRequest();
    x.open("GET", "/scramjet/scramjet.wasm", false);
    x.overrideMimeType("text/plain; charset=x-user-defined");
    x.send();
    const s = x.responseText, u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
    return u;
  }

  /* A line to the engine worker. Asks the desktop page directly, or goes
     through the service worker when this window can't reach it. */
  function openLine(page) {
    const ch = new MessageChannel();
    const engine = lookUp(ENGINE_KEY);
    if (engine && engine.page === page) engine.connect(ch.port2);
    else navigator.serviceWorker?.controller?.postMessage({ $wj$transport: { page } }, [ch.port2]);
    return ch.port1;
  }

  const post = MessagePort.prototype.postMessage;
  const transfer = (b) => (b instanceof ArrayBuffer || (typeof ReadableStream !== "undefined" && b instanceof ReadableStream) ? [b] : []);

  class Line {
    constructor(page) {
      this.port = openLine(page);
      this.ready = true;
      this.n = 0;
      this.waiting = new Map();
      this.port.onmessage = ({ data }) => {
        const done = this.waiting.get(data?.id);
        if (!done) return;
        this.waiting.delete(data.id);
        done(data);
      };
    }
    init() { return Promise.resolve(); }
    meta() { return {}; }
    call(msg, xfer = [], ports = []) {
      const id = ++this.n;
      return new Promise((resolve) => {
        this.waiting.set(id, resolve);
        post.call(this.port, { ...msg, id }, [...xfer, ...ports]);
      });
    }
    async request(remote, method, body, headers) {
      const r = await this.call({ t: "request", remote: String(remote), method, body, headers }, transfer(body));
      if (r.error) throw new Error(r.error);
      return r.res;
    }
    connect(url, protocols, headers, onopen, onmessage, onclose, onerror) {
      const ch = new MessageChannel();
      const ws = ch.port1;
      ws.onmessage = ({ data }) => {
        if (data?.type === "data") onmessage(data.data);
        else if (data?.type === "close") onclose(data.code, data.reason);
        else if (data?.type === "error") onerror(data.error);
      };
      this.call({ t: "ws", url: String(url), protocols, headers }, [], [ch.port2]).then((r) => {
        if (r.ok) onopen(r.protocol || "", r.extensions || "");
        else onerror(r.error || "WebSocket failed");
      });
      return [
        (data) => post.call(ws, { type: "data", data }, data instanceof ArrayBuffer ? [data] : []),
        (code, reason) => post.call(ws, { type: "close", code, reason }),
      ];
    }
    async setCookies(cookies, options) {
      await this.call({ t: "cookie", cookies: cookies.map(({ url, cookie }) => ({ url: String(url), cookie })), options: options || {} });
    }
  }

  /* For "Copy debug info": where this page tries to go (and which of its scripts
     asked), and the errors it throws, sent to the desktop's log. */
  function watch(client, global) {
    const sink = lookUp(DEBUG_KEY);
    if (typeof sink !== "function") return;
    const here = () => { try { return String(client.url.href); } catch (_) { return "?"; } };
    try {
      new self.$scramjet.Plugin("wj-debug").tap(client.hooks.lifecycle.navigate, (ctx, props) => {
        sink({ kind: "navigate", how: ctx?.type, to: String(props?.url), from: here(), stack: new Error().stack });
      });
    } catch (_) {}
    global.addEventListener("error", (e) => sink({ kind: "error", from: here(), message: String(e.message), at: `${e.filename}:${e.lineno}:${e.colno}`, stack: e.error?.stack }));
    global.addEventListener("unhandledrejection", (e) => sink({ kind: "rejection", from: here(), message: String(e.reason?.message || e.reason), stack: e.reason?.stack }));
  }

  /* history.replaceState(state, title) with no URL (or a null one) means "stay
     on this URL", but Scramjet's core turns the missing URL into the text
     "undefined" (or "null") and the page lands on /undefined. claude.ai's
     router does exactly this on startup. Hand the core the current URL
     instead. */
  function keepUrlOnHistory(client, global) {
    const proto = global.History?.prototype;
    if (!proto) return;
    for (const name of ["pushState", "replaceState"]) {
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc || typeof desc.value !== "function") continue;
      Object.defineProperty(proto, name, {
        ...desc,
        value: new Proxy(desc.value, {
          apply(target, that, args) {
            if (args.length >= 2 && args[2] == null) args = [args[0], args[1], client.url.href];
            return Reflect.apply(target, that, args);
          },
        }),
      });
    }
  }

  /* With the ad blocker on, the boxes blocked ads leave behind are hidden. A
     constructed sheet, so the page's own DOM stays as the site built it. */
  function hideAdBoxes(client, global) {
    let css = "";
    try { css = lookUp(ADS_KEY)?.(client.url.hostname) || ""; } catch (_) {}
    if (!css) return;
    try {
      const sheet = new global.CSSStyleSheet();
      sheet.replaceSync(css);
      global.document.adoptedStyleSheets = [...global.document.adoptedStyleSheets, sheet];
    } catch (_) {}
  }

  /* Sign-ins, so the desktop can offer to save them (Saved logins, in js/app.js).
     They go only to the desktop page in this browser; nothing is sent anywhere.
     Two-step sign-ins (name first, password on the next page) send the name as a
     hint. The desktop waits until the sign-in went through before asking. */
  function watchLogins(client, global) {
    const sink = lookUp(LOGINS_KEY);
    if (typeof sink !== "function") return;
    const doc = global.document;
    const host = () => { try { return client.url.hostname; } catch (_) { return ""; } };
    const USERISH = /user|e-?mail|login|account|identifier|phone/i;
    const typed = (scope) => [...scope.querySelectorAll("input")].filter((i) => /^(text|email|tel)$/i.test(i.type) && i.value);
    function usernameIn(scope, pw) {
      const inputs = typed(scope);
      const auto = inputs.find((i) => /username|email/i.test(i.autocomplete || ""));
      if (auto) return auto.value;
      if (pw) {
        const before = inputs.filter((i) => i.compareDocumentPosition(pw) & 4); // fields before the password
        return before.length ? before[before.length - 1].value : "";
      }
      const named = inputs.find((i) => i.type === "email" || USERISH.test(`${i.name} ${i.id} ${i.placeholder || ""} ${i.getAttribute("aria-label") || ""}`));
      return named ? named.value : "";
    }
    let last = "";
    function check(scope) {
      const pws = [...scope.querySelectorAll('input[type="password"]')].filter((p) => p.value);
      // "new password" + "confirm": the one typed twice
      const pw = pws.length >= 2 && pws[pws.length - 1].value === pws[pws.length - 2].value ? pws[pws.length - 1] : pws[0] || null;
      const username = usernameIn(scope, pw).slice(0, 200);
      const e = pw ? { kind: "login", host: host(), username, password: pw.value } : username ? { kind: "user", host: host(), username } : null;
      if (!e) return;
      const sig = e.kind + "\n" + e.username + "\n" + (e.password || "");
      if (sig === last) return;
      last = sig;
      setTimeout(() => { if (last === sig) last = ""; }, 3000);
      try { sink(e, global); } catch (_) {}
    }
    const scopeOf = (el) => el?.closest?.("form") || doc;
    doc.addEventListener("submit", (ev) => check(ev.target instanceof global.HTMLFormElement ? ev.target : doc), true);
    doc.addEventListener("click", (ev) => {
      const b = ev.target?.closest?.('button,input[type="submit"],input[type="button"],[role="button"]');
      if (b) check(scopeOf(b));
    }, true);
    doc.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target?.tagName === "INPUT") check(scopeOf(ev.target)); }, true);
  }

  /* One hooked window (the page itself, or an about:blank frame inside it). */
  function attach(global, init) {
    const S = self.$scramjet;
    const jar = new S.CookieJar();
    jar.load(init.cookies);
    const line = new Line(init.page);

    const cookies = new BroadcastChannel("wj-cookies");
    cookies.onmessage = ({ data }) => {
      if (data?.wj !== "cookie") return;
      if (data.options?.clear) jar.clear();
      for (const c of data.cookies || []) {
        try { jar.setCookies(c.cookie, new URL(c.url)); } catch (_) {}
      }
      cookies.postMessage({ wj: "ack", id: data.id });
    };

    const context = {
      config: init.sjconfig,
      prefix: new URL(init.prefix, location.origin),
      cookieJar: jar,
      interface: {
        getInjectScripts: init.makeInjector(init.core, init.inject, init.page, init.prefix, init.sjconfig, jar),
        codecEncode: encode,
        codecDecode: decode,
      },
    };
    const client = new S.ScramjetClient(global, {
      context,
      transport: line,
      sendSetCookie: (list, options) => line.setCookies(list, options),
      shouldBlockMessageEvent: () => false,
      hookSubcontext: (frameself) => attach(frameself, { ...init, cookies: jar.dump() }),
      initHeaders: init.initHeaders,
      history: init.history,
    });
    client.hook();
    keepUrlOnHistory(client, global);
    hideAdBoxes(client, global);
    watchLogins(client, global);
    watch(client, global);
    return client;
  }

  self.$wj = {
    load(init) {
      document.querySelectorAll("script[scramjet-injected]").forEach((s) => s.remove());
      const S = self.$scramjet;
      if (S.SCRAMJETCLIENT in globalThis) {
        globalThis[S.SCRAMJETCLIENT].syncDocumentInit({ initHeaders: init.initHeaders, history: init.history, cookies: init.cookies });
        return;
      }
      const bytes = rewriterBytes();
      // a Uint8Array from another window fails instanceof here; copy it into this one (a fast memcpy)
      S.setWasm(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      attach(globalThis, init);
      delete self.$wj; // inject.js runs again with any rewritten document; don't leave it lying around
    },
  };
})();
