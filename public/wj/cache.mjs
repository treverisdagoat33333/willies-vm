/*!
 * william's vm — WillieJet smart cache
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 *
 * Proxied requests never touch the browser's own HTTP cache: the network is
 * libcurl inside a worker. This wraps that transport with an HTTP cache of
 * our own (Cache API), following the same rules a browser does, so repeat
 * visits load files from disk instead of the network.
 *
 * - Fresh (Cache-Control max-age / Expires, or a conservative heuristic from
 *   Last-Modified): served straight from the cache.
 * - Stale with an ETag or Last-Modified: revalidated with a conditional
 *   request; a 304 reuses the stored body.
 * - Never stored: no-store, Vary: *, Set-Cookie, Range/Authorization
 *   requests, bodies over 25 MB, and anything but 200/203/301/308.
 * - HTML is only cached when the site says so explicitly.
 */
const NAME = "wj-http-v1";
const MAX_ENTRIES = 4000;
const MAX_BODY = 25 * 1024 * 1024;
const HEURISTIC_CAP = 7 * 24 * 3600 * 1000;
const STORABLE = new Set([200, 203, 301, 308]);

const get = (headers, name) => {
  name = name.toLowerCase();
  for (const [k, v] of headers) if (k.toLowerCase() === name) return v;
  return null;
};
const has = (headers, name) => get(headers, name) !== null;
function directives(value) {
  const out = {};
  for (const part of String(value || "").split(",")) {
    const [k, v] = part.trim().split("=");
    if (k) out[k.toLowerCase()] = v === undefined ? true : v.replace(/^"|"$/g, "");
  }
  return out;
}
const toPairs = (headers) => (Array.isArray(headers) ? headers : Object.entries(headers || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])));

/* How long a response stays fresh, in ms (0 = revalidate every time). */
function lifetime(headers, storedAt) {
  const cc = directives(get(headers, "cache-control"));
  if (cc["no-cache"]) return 0;
  if (cc["max-age"] !== undefined) return Math.max(0, Number(cc["max-age"]) * 1000 || 0);
  const date = Date.parse(get(headers, "date") || "") || storedAt;
  const expires = get(headers, "expires");
  if (expires !== null) return Math.max(0, (Date.parse(expires) || 0) - date);
  const type = get(headers, "content-type") || "";
  const modified = Date.parse(get(headers, "last-modified") || "");
  if (modified && !/html/i.test(type)) return Math.min(HEURISTIC_CAP, Math.max(0, (date - modified) / 10));
  return 0;
}

function storable(status, headers) {
  if (!STORABLE.has(status)) return false;
  const cc = directives(get(headers, "cache-control"));
  if (cc["no-store"]) return false;
  if ((get(headers, "vary") || "").includes("*")) return false;
  if (has(headers, "set-cookie")) return false;
  const len = Number(get(headers, "content-length"));
  if (len > MAX_BODY) return false;
  // worth keeping only if it can ever be reused without a full download
  const type = get(headers, "content-type") || "";
  const fresh = lifetime(headers, Date.now()) > 0;
  const validator = has(headers, "etag") || has(headers, "last-modified");
  if (/html/i.test(type) && !(cc["max-age"] !== undefined || has(headers, "expires") || validator)) return false;
  return fresh || validator;
}

export class CachingTransport {
  constructor(inner) {
    this.inner = inner;
    this.cache = typeof caches !== "undefined" ? caches.open(NAME).catch(() => null) : Promise.resolve(null);
    this.puts = 0;
    this.stats = { hits: 0, revalidated: 0, misses: 0, stored: 0 };
  }

  get ready() { return this.inner.ready; }
  set ready(v) { this.inner.ready = v; }
  init() { return this.inner.init(); }
  meta() { return this.inner.meta?.(); }
  connect(...args) { return this.inner.connect(...args); }

  async request(remote, method, body, headers, signal) {
    headers = toPairs(headers);
    const reqCc = directives(get(headers, "cache-control"));
    const bypass =
      method !== "GET" || body || reqCc["no-store"] ||
      has(headers, "range") || has(headers, "authorization") ||
      has(headers, "if-none-match") || has(headers, "if-modified-since");
    const cache = bypass ? null : await this.cache;
    if (!cache) return this.inner.request(remote, method, body, headers, signal);

    const key = remote.href.split("#")[0];
    const stored = await this.lookup(cache, key, headers);
    const forceCheck = reqCc["no-cache"] || /no-cache/i.test(get(headers, "pragma") || "") || reqCc["max-age"] === "0";

    if (stored && !forceCheck && Date.now() - stored.meta.storedAt < stored.meta.fresh) {
      this.stats.hits++;
      return this.fromStored(stored);
    }

    let sent = headers;
    if (stored) {
      const etag = get(stored.meta.headers, "etag");
      const modified = get(stored.meta.headers, "last-modified");
      if (etag || modified) {
        sent = [...headers];
        if (etag) sent.push(["If-None-Match", etag]);
        if (modified) sent.push(["If-Modified-Since", modified]);
      }
    }

    const res = await this.inner.request(remote, method, body, sent, signal);
    const resHeaders = toPairs(res.headers);

    if (res.status === 304 && stored && sent !== headers) {
      this.stats.revalidated++;
      // refresh the stored headers the 304 updates, keep the body
      const merged = stored.meta.headers.filter(([k]) => !has(resHeaders, k) || /^(content-|transfer-encoding)/i.test(k));
      for (const [k, v] of resHeaders) if (!/^(content-|transfer-encoding)/i.test(k)) merged.push([k, v]);
      const meta = { ...stored.meta, headers: merged, storedAt: Date.now() };
      meta.fresh = lifetime(merged, meta.storedAt);
      const [a, b] = stored.response.body ? stored.response.body.tee() : [null, null];
      this.write(cache, key, meta, b);
      return { body: a ?? new ArrayBuffer(0), headers: merged, status: meta.status, statusText: meta.statusText };
    }

    this.stats.misses++;
    if (!storable(res.status, resHeaders)) return res;

    const stream = res.body instanceof ReadableStream ? res.body : new Response(res.body ?? null).body;
    if (!stream) return res;
    const [a, b] = stream.tee();
    const storedAt = Date.now();
    const vary = (get(resHeaders, "vary") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const meta = {
      status: res.status, statusText: res.statusText, headers: resHeaders, storedAt,
      fresh: lifetime(resHeaders, storedAt),
      vary: Object.fromEntries(vary.map((n) => [n, get(headers, n)])),
    };
    this.write(cache, key, meta, b);
    return { ...res, headers: resHeaders, body: a };
  }

  async lookup(cache, key, headers) {
    try {
      const response = await cache.match(key);
      if (!response) return null;
      const meta = JSON.parse(decodeURIComponent(response.headers.get("x-wj-meta") || ""));
      for (const [name, value] of Object.entries(meta.vary || {})) {
        if (get(headers, name) !== value) return null;
      }
      return { response, meta };
    } catch (_) {
      return null;
    }
  }

  fromStored({ response, meta }) {
    return { body: response.body ?? new ArrayBuffer(0), headers: meta.headers, status: meta.status, statusText: meta.statusText };
  }

  /* Store in the background; give up on bodies that turn out too big. */
  write(cache, key, meta, stream) {
    const headerValue = encodeURIComponent(JSON.stringify(meta));
    if (headerValue.length > 64 * 1024) { stream?.cancel().catch(() => {}); return; }
    let size = 0;
    const limited = stream?.pipeThrough(new TransformStream({
      transform(chunk, ctl) {
        size += chunk.byteLength;
        if (size > MAX_BODY) ctl.error(new Error("too big to cache"));
        else ctl.enqueue(chunk);
      },
    }));
    cache.put(key, new Response(limited ?? null, { headers: { "x-wj-meta": headerValue } }))
      .then(() => {
        this.stats.stored++;
        if (++this.puts % 100 === 0) this.trim(cache);
      })
      .catch(() => {});
  }

  /* Oldest entries go first once there are too many. */
  async trim(cache) {
    try {
      const keys = await cache.keys();
      const extra = keys.length - MAX_ENTRIES;
      if (extra > 0) for (const k of keys.slice(0, extra + Math.round(MAX_ENTRIES * 0.1))) await cache.delete(k);
    } catch (_) {}
  }
}
