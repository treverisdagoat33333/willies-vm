/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * Static files, compressed. The proxy engines' files are big (libcurl alone is
 * 2 MB, the rewriter 600 KB) and express.static sends them as they are, so
 * each file is compressed once (Brotli, or gzip for old browsers), kept in
 * memory against its size and modified time, and sent with an ETag so a
 * repeat visit costs a 304. Anything not compressible, or a Range request,
 * falls through to express.static.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const TYPES = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};
const MIN = 1024;
const CACHE_MAX = 64 * 1024 * 1024; // compressed bytes kept in memory

const cache = new Map(); // `${file}|${enc}` -> { key, buf }
let cached = 0;
const pending = new Map();

async function compressed(file, stat, enc) {
  const id = `${file}|${enc}`;
  const key = `${stat.size}-${stat.mtimeMs}`;
  const hit = cache.get(id);
  if (hit?.key === key) return hit.buf;
  const pid = `${id}|${key}`;
  if (pending.has(pid)) return pending.get(pid);
  const p = (async () => {
    const raw = await fs.promises.readFile(file);
    const buf = enc === "br"
      ? await brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
      : await gzip(raw, { level: 9 });
    if (hit) cached -= hit.buf.length;
    // too much in memory: forget the oldest
    while (cached + buf.length > CACHE_MAX && cache.size) {
      const [k, v] = cache.entries().next().value;
      cache.delete(k);
      cached -= v.buf.length;
    }
    cache.set(id, { key, buf });
    cached += buf.length;
    return buf;
  })().finally(() => pending.delete(pid));
  pending.set(pid, p);
  return p;
}

/* `maxAge` (seconds) suits files that only change with a deploy's package
   versions; the site's own files revalidate every time (no-cache + ETag). */
export function compressedStatic(dirs, { maxAge = 0 } = {}) {
  const roots = [].concat(dirs).map((d) => path.resolve(d));
  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.headers.range) return next();
    const accept = String(req.headers["accept-encoding"] || "");
    const enc = /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
    if (!enc) return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    if (rel.endsWith("/")) rel += "index.html";
    const type = TYPES[path.extname(rel).toLowerCase()];
    if (!type || rel.includes("\0")) return next();
    for (const root of roots) {
      const file = path.join(root, rel);
      if (file !== root && !file.startsWith(root + path.sep)) return next();
      let stat;
      try { stat = await fs.promises.stat(file); } catch { continue; }
      if (!stat.isFile() || stat.size < MIN) return next();
      const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}-${enc}"`;
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", maxAge ? `public, max-age=${maxAge}` : "no-cache");
      res.setHeader("Content-Type", type);
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      let buf;
      try { buf = await compressed(file, stat, enc); } catch { return next(); }
      res.setHeader("Content-Encoding", enc);
      res.setHeader("Content-Length", buf.length);
      return req.method === "HEAD" ? res.end() : res.end(buf);
    }
    next();
  };
}
