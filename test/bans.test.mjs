/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Site bans and kicks (bans.js, Admin panel): devices, accounts, IP addresses,
// "no new accounts", kicking, lifting, and that the owner can't lock themselves out.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const stamp = Date.now().toString(36).slice(-5);
async function person(name, password) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/");
  if (name) {
    await page.evaluate(async ({ name, password }) => {
      const r = await fetch(password ? "/api/auth/login" : "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: password || "password123" }) });
      if (!r.ok) throw new Error(await r.text());
    }, { name, password });
    await page.reload();
    await page.waitForFunction(() => typeof currentRole !== "undefined" && currentRole !== "guest", null, { timeout: 10000 });
  } else {
    await page.click("#guest-button");
    await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });
  }
  return { ctx, page, name };
}
const api = (p, url, method = "GET", body) => p.page.evaluate(async ({ url, method, body }) => { const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; }, { url, method, body });
const beat = (p) => p.page.evaluate(() => liveBeat(true));
const own = await person("testowner", "test-owner-pass");

// the owner can't lock themselves out
let r = await api(own, "/api/admin/bans", "POST", { kind: "ip", value: "127.0.0.1" });
ok(r.status === 400 && /ban you too/.test(r.body.error), "the owner can't ban their own network", JSON.stringify(r));
r = await api(own, "/api/admin/bans", "POST", { kind: "user", value: "testowner" });
ok(r.status === 400, "…or their own account");
ok((await api(await person(null), "/api/admin/bans")).status === 403, "bans are owner-only");

// a guest's device, from Live now
const g = await person(null);
await beat(g);
// find the guest's label the way the dashboard does: who's here right now
await own.page.evaluate(() => openAdmin());
await own.page.waitForFunction(() => document.querySelectorAll("#ad-live-list .ad-lv[data-v^='guest-']").length > 0, null, { timeout: 8000 });
ok(await own.page.$$eval("#ad-live-list .ad-lv[data-v^='guest-'] [data-do='ban']", (b) => b.length) > 0, "Live now shows guests with Kick and Ban buttons");
// this guest's own device (other suites' guests may be on the list too)
const gdev = (await g.ctx.cookies()).find((c) => c.name === "wvm_dev")?.value;
r = await api(own, "/api/admin/bans", "POST", { kind: "device", value: gdev, reason: "test reason", label: "test guest" });
ok(r.status === 200, "the owner bans a guest's device from Live now", JSON.stringify(r));
ok(await g.page.waitForFunction(() => /You're banned from Willie OS/.test(document.body.textContent), null, { timeout: 25000 }).then(() => true, () => false), "…their page is sent to the banned page");
ok(/test reason/.test(await g.page.textContent("body")), "…which says why");
ok((await api(g, "/api/auth/me")).status === 403, "…and every API answers 403");
ok((await g.page.evaluate(() => new Promise((res) => { const w = new WebSocket(location.origin.replace("http", "ws") + "/chat/"); w.onopen = () => res("open"); w.onerror = () => res("refused"); }))) === "refused", "…and sockets (chat, the proxy) are refused");
const g2 = await person(null);
ok((await api(g2, "/api/auth/me")).status === 200, "other devices on the same network are fine");
const banId = r.body.id;
await api(own, `/api/admin/bans/${banId}`, "DELETE");
await g.page.goto("/");
ok(await g.page.$("#guest-button") !== null, "lifting the ban lets them back in");

// "no new accounts" from a device: browsing works, signing up doesn't
const dev = (await g2.ctx.cookies()).find((c) => c.name === "wvm_dev")?.value;
r = await api(own, "/api/admin/bans", "POST", { kind: "device", scope: "signup", value: dev, label: "g2" });
const reg = await api(g2, "/api/auth/register", "POST", { username: "nosign" + stamp, password: "password123" });
const blocked = r.status === 200 && reg.status === 403 && /can't be made/.test(reg.body.error);
ok(blocked, "No new accounts stops sign-ups from that device");
ok((await api(g2, "/api/auth/me")).status === 200, "…while they can still use the site");

// an account: kicked (signed out), then banned site-wide, then lifted
const a = await person("banme" + stamp);
await beat(a);
r = await api(own, `/api/admin/visitors/${a.name}/kick`, "POST");
ok(r.status === 200, "the owner kicks an account");
ok(await a.page.waitForFunction(() => !!document.querySelector("#auth-wrap:not(.hidden)"), null, { timeout: 25000 }).then(() => true, () => false), "…they're back at the sign-in screen");
r = await api(own, "/api/admin/bans", "POST", { kind: "user", user: a.name, reason: "spam" });
ok(r.status === 200, "the owner bans the account from the whole site");
const login = await api(a, "/api/auth/login", "POST", { username: a.name, password: "password123" });
ok(login.status === 403 && /banned/.test(login.body.error), "…and it can't sign in", JSON.stringify(login));
ok((await api(own, "/api/admin/bans")).body.bans.some((b) => b.kind === "user" && b.value === a.name && b.reason === "spam"), "the ban shows in the list with its reason");
await api(own, `/api/admin/bans/${r.body.id}`, "DELETE");
ok((await api(a, "/api/auth/login", "POST", { username: a.name, password: "password123" })).status === 200, "lifted: they can sign in again");

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
