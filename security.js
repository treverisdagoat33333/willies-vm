/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import crypto from "node:crypto";

/*
|--------------------------------------------------------------------------
| Small security helpers
|
| No extra dependencies: a fixed-window rate limiter kept in memory, a
| constant-time string compare, and the client IP as Render reports it.
|--------------------------------------------------------------------------
*/

/*
 * Render (and most hosts) sit behind one proxy that appends the real client
 * address to X-Forwarded-For. With `trust proxy` set to 1, Express already
 * resolves req.ip from it; raw upgrade requests need the same by hand.
 */
export function clientIp(req) {
  if (req.ip) return req.ip;
  const xff = String(req.headers?.["x-forwarded-for"] || "");
  const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length) return parts[parts.length - 1];
  return req.socket?.remoteAddress || "unknown";
}

/* Compare two secrets without leaking how many leading characters match. */
export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/*
 * A fixed-window counter per key. `hit(key)` records an attempt and returns
 * how many seconds the caller must wait, or 0 if it is allowed.
 */
export function createLimiter({ windowMs, max }) {
  const buckets = new Map(); // key -> { count, resetAt }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, Math.max(windowMs, 60_000));
  sweep.unref?.();

  function peek(key) {
    const b = buckets.get(key);
    if (!b || b.resetAt <= Date.now()) return 0;
    return b.count >= max ? Math.ceil((b.resetAt - Date.now()) / 1000) : 0;
  }

  function hit(key) {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    if (b.count >= max) return Math.ceil((b.resetAt - now) / 1000);
    b.count++;
    return 0;
  }

  function reset(key) {
    buckets.delete(key);
  }

  return { hit, peek, reset };
}

/* Express middleware: one limiter, keyed by client IP (plus an optional suffix). */
export function limitByIp(limiter, message, keyFn) {
  return (req, res, next) => {
    const key = clientIp(req) + (keyFn ? "|" + keyFn(req) : "");
    const wait = limiter.hit(key);
    if (wait) {
      res.set("Retry-After", String(wait));
      return res.status(429).json({ error: `${message} Try again in ${formatWait(wait)}.` });
    }
    next();
  };
}

export function formatWait(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.ceil(secs / 60);
  return m === 1 ? "a minute" : `${m} minutes`;
}
