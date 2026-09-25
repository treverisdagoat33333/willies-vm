/*!
 * william's vm — WillieJet fast mode (worker side)
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 *
 * With fast mode on, HTTP requests go to our server's /wj-net (fastnet.js),
 * which fetches them with native TLS; the browser gets the reply over its
 * one fast connection to our site. Off, or for WebSockets, or when our
 * server says no (signed out, rate limited), requests take the normal path:
 * libcurl over /wisp/.
 *
 * Some sites (Cloudflare's bot protection especially) turn away our server's
 * own connections with a challenge instead of the page. Such a reply is
 * retried on the normal path, and that site skips fast mode for the rest of
 * the session. Sites the user switched it off for skip it always.
 */
const header = (pairs, name) => pairs.find(([k]) => k.toLowerCase() === name)?.[1] ?? null;
/* Cloudflare marks its challenge pages this way; the site never saw the request */
const isChallenge = (status, pairs) => (status === 403 || status === 429 || status === 503) && header(pairs, "cf-mitigated") !== null;
const toPairs = (h) => (Array.isArray(h) ? h : Object.entries(h || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])));

/* Splits a framed reply (uint32 length + JSON + body) into its parts. */
async function unframe(stream) {
  const reader = stream.getReader();
  let buf = new Uint8Array(0);
  const need = async (n) => {
    while (buf.length < n) {
      const { value, done } = await reader.read();
      if (done) throw new Error("fast mode reply cut short");
      const next = new Uint8Array(buf.length + value.length);
      next.set(buf);
      next.set(value, buf.length);
      buf = next;
    }
  };
  await need(4);
  const len = new DataView(buf.buffer, buf.byteOffset).getUint32(0);
  await need(4 + len);
  const meta = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + len)));
  let first = buf.subarray(4 + len);
  const body = new ReadableStream({
    async pull(ctl) {
      if (first) {
        const f = first;
        first = null;
        if (f.length) return ctl.enqueue(f);
      }
      const { value, done } = await reader.read();
      done ? ctl.close() : ctl.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return { ...meta, body };
}

export class FastTransport {
  constructor(fallback, on = false, skip = [], onBlocked = () => {}) {
    this.fallback = fallback;
    this.on = on;
    this.skip = new Set(skip); // hosts the user switched fast mode off for
    this.blocked = new Set(); // origins that challenged our server this session
    this.onBlocked = onBlocked;
    this.stats = { fast: 0, fellBack: 0, challenged: 0 };
  }

  get ready() { return this.fallback.ready; }
  set ready(v) { this.fallback.ready = v; }
  init() { return this.fallback.init(); }
  meta() { return this.fallback.meta?.(); }
  connect(...args) { return this.fallback.connect(...args); } // WebSockets always go over /wisp/

  async request(remote, method, body, headers, signal) {
    if (!this.on || (remote.protocol !== "https:" && remote.protocol !== "http:") || this.skip.has(remote.hostname) || this.blocked.has(remote.origin)) {
      return this.fallback.request(remote, method, body, headers, signal);
    }
    const bytes = body == null ? null : new Uint8Array(await new Response(body).arrayBuffer());
    const meta = new TextEncoder().encode(JSON.stringify({ url: remote.href, method, headers: toPairs(headers) }));
    const framed = new Uint8Array(4 + meta.length + (bytes ? bytes.length : 0));
    new DataView(framed.buffer).setUint32(0, meta.length);
    framed.set(meta, 4);
    if (bytes) framed.set(bytes, 4 + meta.length);

    const r = await fetch("/wj-net", {
      method: "POST", body: framed, signal, cache: "no-store", credentials: "same-origin",
      headers: { "content-type": "application/octet-stream" },
    });
    if (r.status !== 200) {
      const why = decodeURIComponent(r.headers.get("x-wj-error") || "");
      // our server won't do it (signed out, over the limit, turned off): take the normal path
      if (r.status === 401 || r.status === 404 || r.status === 429) {
        this.stats.fellBack++;
        return this.fallback.request(remote, method, bytes, headers, signal);
      }
      throw new Error(why || `fast mode failed (HTTP ${r.status})`);
    }
    const res = r.headers.get("x-wj-framed") ? await unframe(r.body) : {
      status: Number(r.headers.get("x-wj-status")) || 502,
      statusText: decodeURIComponent(r.headers.get("x-wj-status-text") || ""),
      headers: JSON.parse(decodeURIComponent(r.headers.get("x-wj-headers") || "%5B%5D")),
      body: r.body,
    };
    if (isChallenge(res.status, res.headers)) {
      // the site turned our server away (not your browser): go the normal way from now on
      this.stats.challenged++;
      res.body?.cancel?.().catch(() => {});
      if (!this.blocked.has(remote.origin)) {
        this.blocked.add(remote.origin);
        this.onBlocked(remote.origin);
      }
      return this.fallback.request(remote, method, bytes, headers, signal);
    }
    this.stats.fast++;
    return res;
  }
}
