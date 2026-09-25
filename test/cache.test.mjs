/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Unit tests for public/wj/cache.mjs, run inside Chromium (it needs the Cache API).
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto(process.env.BASE + "/manifest.webmanifest");
const out = await page.evaluate(async () => {
  const { CachingTransport } = await import("/wj/cache.mjs");
  const results = [];
  const ok = (c, l, x = "") => results.push([!!c, l, c ? "" : String(x)]);
  let n = 0;
  const mk = (script) => {
    const calls = [];
    const inner = { ready: true, init() {}, connect() {}, async request(remote, method, body, headers) { calls.push({ url: remote.href, headers }); const r = script(calls.length, headers); return { body: new TextEncoder().encode(r.body ?? "").buffer, headers: r.headers, status: r.status ?? 200, statusText: "OK" }; } };
    return { t: new CachingTransport(inner), calls };
  };
  const text = async (r) => new Response(r.body).text();
  const U = () => new URL(`https://ex.test/${++n}.js`);
  const wait = () => new Promise((r) => setTimeout(r, 150)); // cache writes are in the background

  { const { t, calls } = mk(() => ({ body: "A", headers: [["cache-control", "max-age=60"]] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); const r = await t.request(u, "GET", null, []);
    ok(calls.length === 1 && (await text(r)) === "A" && r.status === 200, "max-age: second request comes from the cache", calls.length); }
  { const { t, calls } = mk(() => ({ body: "A", headers: [["cache-control", "no-store, max-age=60"]] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); await text(await t.request(u, "GET", null, []));
    ok(calls.length === 2, "no-store is never cached", calls.length); }
  { const { t, calls } = mk((i) => (i === 1 ? { body: "E", headers: [["etag", '"v1"'], ["cache-control", "max-age=0"]] } : { status: 304, body: "", headers: [["etag", '"v1"']] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); const r = await t.request(u, "GET", null, []);
    const inm = calls[1]?.headers.find(([k]) => k.toLowerCase() === "if-none-match")?.[1];
    ok(calls.length === 2 && inm === '"v1"', "stale with ETag: revalidates with If-None-Match", inm);
    ok(r.status === 200 && (await text(r)) === "E", "a 304 reuses the stored body", r.status); }
  { const { t, calls } = mk((i) => ({ body: "M" + i, headers: [["last-modified", "Mon, 01 Jan 2024 00:00:00 GMT"], ["date", new Date().toUTCString()], ["content-type", "application/javascript"]] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); await text(await t.request(u, "GET", null, []));
    ok(calls.length === 1, "Last-Modified only: fresh for a while by the usual heuristic", calls.length); }
  { const { t, calls } = mk((i) => ({ body: "H" + i, headers: [["last-modified", "Mon, 01 Jan 2024 00:00:00 GMT"], ["content-type", "text/html"]] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); await text(await t.request(u, "GET", null, []));
    const ims = calls[1]?.headers.find(([k]) => k.toLowerCase() === "if-modified-since");
    ok(calls.length === 2 && ims, "HTML is never assumed fresh; it's revalidated", calls.length); }
  { const { t, calls } = mk(() => ({ body: "C", headers: [["cache-control", "max-age=60"], ["set-cookie", "a=1"]] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); await text(await t.request(u, "GET", null, []));
    ok(calls.length === 2, "responses that set cookies aren't cached", calls.length); }
  { const { t, calls } = mk(() => ({ body: "V", headers: [["cache-control", "max-age=60"], ["vary", "Accept-Language"]] })); const u = U();
    await text(await t.request(u, "GET", null, [["Accept-Language", "en"]])); await wait();
    await text(await t.request(u, "GET", null, [["Accept-Language", "fr"]])); await wait();
    const n2 = calls.length; await text(await t.request(u, "GET", null, [["Accept-Language", "fr"]]));
    ok(n2 === 2 && calls.length === 2, "Vary: a different header value is a miss, the same one a hit", `${n2},${calls.length}`); }
  { const { t, calls } = mk(() => ({ body: "P", headers: [["cache-control", "max-age=60"]] })); const u = U();
    await text(await t.request(u, "POST", "x", [])); await wait(); await text(await t.request(u, "POST", "x", []));
    ok(calls.length === 2, "POST bypasses the cache", calls.length); }
  { const { t, calls } = mk(() => ({ body: "R", headers: [["cache-control", "max-age=60"]] })); const u = U();
    await text(await t.request(u, "GET", null, [["Range", "bytes=0-1"]])); await wait(); await text(await t.request(u, "GET", null, [["Range", "bytes=0-1"]]));
    ok(calls.length === 2, "Range requests bypass the cache", calls.length); }
  { const { t, calls } = mk((i) => ({ body: "N" + i, headers: [["cache-control", "max-age=60"], ["etag", '"n"']] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); await text(await t.request(u, "GET", null, [["Cache-Control", "no-cache"]]));
    ok(calls.length === 2, "a request asking for no-cache revalidates even when fresh", calls.length); }
  { const { t, calls } = mk(() => ({ body: "B", headers: [["cache-control", "max-age=60"], ["content-length", String(30 * 1024 * 1024)]] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); await text(await t.request(u, "GET", null, []));
    ok(calls.length === 2, "bodies over 25 MB aren't stored", calls.length); }
  { const { t, calls } = mk(() => ({ status: 404, body: "nf", headers: [["cache-control", "max-age=60"]] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); await text(await t.request(u, "GET", null, []));
    ok(calls.length === 2, "errors (404) aren't cached", calls.length); }
  { const { t, calls } = mk(() => ({ body: "X", headers: [["cache-control", "max-age=60"]] })); const u = U();
    await text(await t.request(u, "GET", null, [])); await wait(); await text(await t.request(new URL(u.href + "#frag"), "GET", null, []));
    ok(calls.length === 1, "the #fragment doesn't split the cache", calls.length); }
  return results;
});
let pass = 0, fail = 0;
for (const [c, l, x] of out) { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); }
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
