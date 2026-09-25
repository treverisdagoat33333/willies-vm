/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// fast mode must refuse internal addresses and anonymous callers (server without the test exemption)
const BASE = process.env.STRICT_BASE; // a server without the tests' local-address exemption
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const frame = (url, method = "GET") => { const m = Buffer.from(JSON.stringify({ url, method, headers: [] })); const l = Buffer.alloc(4); l.writeUInt32BE(m.length); return Buffer.concat([l, m]); };
const g = await fetch(BASE + "/api/auth/guest", { method: "POST" });
const cookie = (g.headers.get("set-cookie") || "").split(";")[0];
ok(g.ok && cookie, "got a guest session", g.status);
const post = (url, withCookie = true) => fetch(BASE + "/wj-net", { method: "POST", body: frame(url), headers: withCookie ? { cookie } : {} });
let r = await post("http://127.0.0.1:9/", false);
ok(r.status === 401, "no session: refused", r.status);
for (const [url, label] of [["http://127.0.0.1:9/", "loopback IP"], ["http://169.254.169.254/latest/meta-data/", "cloud metadata IP"], ["http://10.0.0.5/", "private 10/8"], ["http://192.168.1.1/", "private 192.168/16"], ["http://[::1]:9/", "IPv6 loopback"]]) {
  r = await post(url);
  ok(r.status === 403 && /private/.test(decodeURIComponent(r.headers.get("x-wj-error") || "")), `${label} is refused`, `${r.status} ${r.headers.get("x-wj-error")}`);
}
r = await post("http://localhost:9/");
ok(r.status === 502 && /private address/.test(decodeURIComponent(r.headers.get("x-wj-error") || "")), "a hostname that resolves to loopback is refused after DNS", `${r.status} ${decodeURIComponent(r.headers.get("x-wj-error") || "")}`);
r = await post("file:///etc/passwd");
ok(r.status === 400, "non-http schemes are refused", r.status);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
