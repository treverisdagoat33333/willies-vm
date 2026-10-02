/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */

/*
|--------------------------------------------------------------------------
| WillieJet fast mode: this server fetches pages for the browser
|
| Normally WillieJet's worker does the HTTPS itself, through libcurl over
| /wisp/, so this server only relays encrypted bytes. With fast mode on (a
| setting, off by default), the worker POSTs each request here and we fetch
| it with Node's native TLS and keep-alive pools. First visits need far fewer
| round trips, and weak devices skip the in-browser encryption. The catch:
| this server can see that traffic. WebSockets still go over /wisp/.
|
| Request body:  uint32 BE length + JSON {url, method, headers: [[k, v]...]}
|                + the request body.
| Response:      200 with x-wj-status, x-wj-status-text and x-wj-headers
|                (URI-encoded JSON pairs). The upstream body passes through
|                still compressed, with its content-encoding, so the browser
|                decompresses it natively. If the headers are too big for a
|                header, or the encoding is unusual, we decompress and frame
|                the reply the way requests are framed (x-wj-framed: 1).
| Errors:        502 with x-wj-error.
|
| Private, loopback and link-local addresses are refused (checked after DNS),
| so nobody can use this to reach Render's internal network.
|--------------------------------------------------------------------------
*/
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";

/* Reaching private addresses is for the test suite only (test/preload.mjs). A
   function, not an exported object, so no other module can flip it by accident. */
let allowPrivate = false;
export function setAllowPrivate(on) { allowPrivate = Boolean(on); }

const MAX_META = 1024 * 1024;
const HEADER_BUDGET = 24 * 1024;
const HOP = new Set(["connection", "keep-alive", "proxy-connection", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length", "accept-encoding"]);
const PASS_ENCODINGS = new Set(["gzip", "deflate", "br"]);

function v4Private(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}
/* An IPv6 address as its 8 16-bit groups, or null. Works on the numbers, not the
   text: the URL parser writes [::ffff:127.0.0.1] as ::ffff:7f00:1, which a text
   match for the dotted form let straight through to the server itself. */
function v6Groups(ip) {
  let s = ip.toLowerCase().split("%")[0];
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail[1].split(".").map(Number);
    s = s.slice(0, -tail[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const [head, rest] = s.split("::");
  const h = head ? head.split(":") : [], r = rest ? rest.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - r.length : 0;
  const g = [...h, ...Array(Math.max(0, fill)).fill("0"), ...r].map((x) => parseInt(x || "0", 16));
  return g.length === 8 && g.every((x) => x >= 0 && x <= 0xffff) ? g : null;
}
const v4Of = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return v4Private(ip);
  const g = v6Groups(ip);
  if (!g) return true; // not an address we understand: refuse it
  const zero = (n) => g.slice(0, n).every((x) => x === 0);
  if (zero(8) || (zero(7) && g[7] === 1)) return true; // :: and ::1
  // IPv4 inside IPv6: mapped (::ffff:a.b.c.d), compatible (::a.b.c.d), NAT64 (64:ff9b::a.b.c.d), 6to4 (2002:aabb:ccdd::)
  if (zero(5) && g[5] === 0xffff) return v4Private(v4Of(g[6], g[7]));
  if (zero(6)) return v4Private(v4Of(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b) return true;
  if (g[0] === 0x2002) return v4Private(v4Of(g[1], g[2]));
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00; // unique-local, link-local, multicast
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const ok = allowPrivate ? addresses : addresses.filter((a) => !isPrivateIp(a.address));
    if (!ok.length) return callback(Object.assign(new Error(`${hostname} is a private address`), { code: "EPRIVATE" }));
    if (options.all) callback(null, ok);
    else callback(null, ok[0].address, ok[0].family);
  });
}

const agents = {
  "http:": new http.Agent({ keepAlive: true, maxSockets: 64, lookup: safeLookup }),
  "https:": new https.Agent({ keepAlive: true, maxSockets: 64, lookup: safeLookup }),
};

/* Reads the uint32 + JSON prefix off the request; the rest streams upstream. */
function readMeta(req) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < 4) return;
      const len = buf.readUInt32BE(0);
      if (len > MAX_META) return done(new Error("request too large"));
      if (buf.length < 4 + len) return;
      req.pause();
      done(null, JSON.parse(buf.subarray(4, 4 + len).toString("utf8")), buf.subarray(4 + len));
    };
    const onEnd = () => done(new Error("request cut short"));
    function done(err, meta, rest) {
      req.off("data", onData);
      req.off("end", onEnd);
      err ? reject(err) : resolve({ meta, rest });
    }
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", reject);
  });
}

function fail(res, status, message) {
  if (res.headersSent) return res.destroy();
  res.status(status).set("x-wj-error", encodeURIComponent(String(message).slice(0, 300))).end();
}

export async function fastnetHandler(req, res) {
  let meta, rest;
  try {
    ({ meta, rest } = await readMeta(req));
  } catch (e) {
    return fail(res, 400, e.message);
  }
  let target;
  try {
    target = new URL(meta.url);
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("only http and https");
  } catch (e) {
    return fail(res, 400, e.message);
  }
  const host = target.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !allowPrivate && isPrivateIp(host)) return fail(res, 403, `${host} is a private address`);

  const method = String(meta.method || "GET").toUpperCase();
  const headers = {};
  for (const [k, v] of Array.isArray(meta.headers) ? meta.headers : []) {
    const key = String(k).toLowerCase();
    if (HOP.has(key)) continue;
    headers[key] = headers[key] ? `${headers[key]}, ${v}` : String(v);
  }
  headers["accept-encoding"] = "gzip, deflate, br";
  const hasBody = !["GET", "HEAD"].includes(method);

  const upstream = (target.protocol === "https:" ? https : http).request(target, {
    method, headers, agent: agents[target.protocol], timeout: 30000,
    maxHeaderSize: 256 * 1024, // browsers accept this much; Node's default is 16 KB
  });
  upstream.on("timeout", () => upstream.destroy(new Error("the site took too long to answer")));
  upstream.on("error", (e) => fail(res, 502, e.code === "EPRIVATE" ? e.message : `${e.code || ""} ${e.message}`.trim()));
  res.on("close", () => { if (!res.writableFinished) upstream.destroy(); });

  upstream.on("response", (up) => {
    const pairs = [];
    let encoding = "";
    for (let i = 0; i < up.rawHeaders.length; i += 2) {
      const k = up.rawHeaders[i], v = up.rawHeaders[i + 1], key = k.toLowerCase();
      if (key === "content-encoding") { encoding = v.trim().toLowerCase(); continue; }
      if (key === "content-length" || key === "transfer-encoding" || key === "connection" || key === "keep-alive") continue;
      pairs.push([k, v]);
    }
    const encoded = encodeURIComponent(JSON.stringify(pairs));
    const passthrough = encoded.length <= HEADER_BUDGET && (!encoding || encoding === "identity" || PASS_ENCODINGS.has(encoding));
    res.status(200);
    res.set("cache-control", "no-store");
    if (passthrough) {
      res.set({ "x-wj-status": String(up.statusCode), "x-wj-status-text": encodeURIComponent(up.statusMessage || ""), "x-wj-headers": encoded });
      if (encoding && encoding !== "identity") res.set("content-encoding", encoding);
      up.pipe(res);
      return;
    }
    // too many headers for one header line, or an encoding browsers won't undo: frame it
    const decoder = encoding === "gzip" || encoding === "x-gzip" ? zlib.createGunzip()
      : encoding === "deflate" ? zlib.createInflate()
      : encoding === "br" ? zlib.createBrotliDecompress()
      : encoding === "zstd" && zlib.createZstdDecompress ? zlib.createZstdDecompress() : null;
    if (encoding && encoding !== "identity" && !decoder) pairs.push(["Content-Encoding", encoding]);
    const head = Buffer.from(JSON.stringify({ status: up.statusCode, statusText: up.statusMessage || "", headers: pairs }));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(head.length);
    res.set("x-wj-framed", "1");
    res.write(Buffer.concat([len, head]));
    (decoder ? up.pipe(decoder) : up).on("error", () => res.destroy()).pipe(res);
  });

  if (!hasBody) return upstream.end();
  if (rest.length) upstream.write(rest);
  req.pipe(upstream);
  req.resume();
}

