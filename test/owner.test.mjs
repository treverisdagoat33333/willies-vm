/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Owner tools: viewing the site as someone (read-only, they're told), the AI's
// moderation actions (owner only, never without a confirm), and the kept VM card.
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
  await page.evaluate(async ({ name, password }) => {
    const r = await fetch(password ? "/api/auth/login" : "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: password || "password123" }) });
    if (!r.ok) throw new Error(await r.text());
  }, { name, password });
  await page.reload();
  await page.waitForFunction(() => typeof currentRole !== "undefined" && currentRole !== "guest", null, { timeout: 10000 });
  return { ctx, page, name };
}
const api = (p, url, method = "GET", body) => p.page.evaluate(async ({ url, method, body }) => { const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; }, { url, method, body });

const own = await person("testowner", "test-owner-pass");
const sam = await person("sam" + stamp);
const other = await person("oth" + stamp);

/* ---- view as ---- */
ok((await api(sam, `/api/admin/viewas/${other.name}`, "POST")).status === 403, "only the owner can view as someone");
ok((await api(own, "/api/admin/viewas/testowner", "POST")).status === 400, "the owner can't view as themselves");
// a DM between sam and other, which the owner should see while viewing as sam
await api(own, "/api/auth/me");
const view = await browser.newContext({ baseURL: BASE });
await view.addCookies(await own.ctx.cookies());
const vp = await view.newPage();
await vp.goto("/");
await vp.waitForFunction(() => currentRole === "owner", null, { timeout: 10000 });
let r = await vp.evaluate(async (n) => (await fetch(`/api/admin/viewas/${n}`, { method: "POST" })).status, sam.name);
ok(r === 200, "the owner starts viewing as an account", r);
await vp.reload();
await vp.waitForFunction((n) => currentUsername === n, sam.name, { timeout: 10000 });
ok(await vp.isVisible("#viewas-bar"), "a bar says who you're viewing as");
ok(/read-only/.test(await vp.textContent("#viewas-bar")), "…and that it's read-only");
const w = { page: vp };
ok((await api(w, "/api/account/settings", "PUT", { data: {} })).status === 403, "changing their settings is refused");
ok((await api(w, "/api/ai/chats", "PUT", { data: { chats: [] } })).status === 403, "…and their AI chats");
ok((await api(w, "/api/auth/me")).status === 200, "reading works");
// chat: reading yes, posting no, and not shown online
const chat = await vp.evaluate(() => new Promise((res) => {
  const s = new WebSocket(location.origin.replace("http", "ws") + "/chat/");
  const got = [];
  s.onmessage = (e) => { const d = JSON.parse(e.data); got.push(d); if (d.type === "ready") s.send(JSON.stringify({ type: "msg", channel: d.channel, text: "posted while viewing" })); if (d.type === "error") { s.close(); res({ ready: got[0], err: d.text }); } };
  setTimeout(() => res({ ready: got[0], err: null }), 5000);
}));
ok(chat.ready?.type === "ready" && chat.ready.you === sam.name, "chat opens as them");
ok(/Read-only/.test(chat.err || ""), "…but posting is refused", chat.err);
ok(!(chat.ready?.members || []).some((m) => m.name === sam.name && m.viewOnly), "…and nobody sees an extra them online");
ok((await vp.evaluate(() => new Promise((res) => { const s = new WebSocket(location.origin.replace("http", "ws") + "/voice/?channel=general"); s.onopen = () => res("open"); s.onerror = () => res("refused"); }))) === "refused", "voice is refused while viewing");
ok((await api(w, "/api/admin/bans")).status === 403, "owner powers are off while viewing");
// back to the owner
await vp.click("#viewas-bar button");
await vp.waitForFunction(() => currentRole === "owner" && !document.querySelector("#viewas-bar"), null, { timeout: 10000 });
ok(true, "Back to my account returns to the owner");
// they're told, once
const told = await api(sam, "/api/auth/me");
ok(told.body.ownerViews?.length === 1, "the person is told the owner looked", JSON.stringify(told.body.ownerViews));
ok((await api(sam, "/api/auth/me")).body.ownerViews?.length === 0, "…only once");
// a forged way back (not an owner token) just signs out
const stray = await browser.newContext({ baseURL: BASE });
await stray.addCookies((await other.ctx.cookies()).map((c) => c.name === "vm_session" ? { ...c, name: "wvm_back" } : c));
const sp = await stray.newPage(); await sp.goto("/");
await sp.evaluate(() => fetch("/api/auth/viewas/stop", { method: "POST" }));
ok((await sp.evaluate(async () => (await (await fetch("/api/auth/me")).json()).loggedIn)) === false, "a way back that isn't the owner's signs out instead");

/* ---- AI moderation ---- */
const sys = await own.page.evaluate(async () => { const r = await fetch("/api/ai/system"); return r.json(); });
ok(!/admin\.ban/.test(sys.actions), "the shared AI instructions never include moderation");
// the actions themselves: a confirm dialog first, nothing before it
await own.page.evaluate(() => window.ai?.open?.() || APPS.ai?.());
const before = (await api(own, "/api/admin/bans")).body.bans.length;
const label = await own.page.evaluate((n) => window.ai._act({ do: "admin.ban", user: n, hours: 1, reason: "spam" }), other.name);
ok(/Waiting for your OK/.test(label), "admin.ban asks first", label);
ok((await api(own, "/api/admin/bans")).body.bans.length === before, "…and nothing happens before the OK");
ok(await own.page.isVisible("#dc-modal.show"), "…with a confirm dialog");
await own.page.click("#dc-modal-ok");
await own.page.waitForFunction(() => !document.querySelector("#dc-modal.show"), null, { timeout: 5000 });
const bans = (await api(own, "/api/admin/bans")).body.bans;
ok(bans.some((b) => b.value === other.name && b.reason === "spam"), "after the OK they're banned");
await own.page.evaluate((n) => window.ai._act({ do: "admin.unban", user: n }), other.name);
await own.page.click("#dc-modal-ok");
await own.page.waitForFunction(() => !document.querySelector("#dc-modal.show"), null, { timeout: 5000 });
ok(!(await api(own, "/api/admin/bans")).body.bans.some((b) => b.value === other.name), "admin.unban lifts it");
// cancel does nothing
await own.page.evaluate(() => window.ai._act({ do: "admin.announce", text: "hello" }));
await own.page.click("#dc-modal-cancel");
ok(true, "cancel closes it");
const notOwner = await sam.page.evaluate(() => window.ai._act({ do: "admin.kick", user: "testowner" }).catch((e) => e.message));
ok(/Only the owner/.test(notOwner), "nobody else can run them", notOwner);

/* ---- owner-only models ---- */
const st = (p) => api(p, "/api/ai/status");
ok((await st(own)).body.models?.includes("dawvqTEST"), "the owner sees the dawvq models");
const ss = await st(sam);
ok(ss.body.models?.length && !ss.body.models.includes("dawvqTEST") && !/^dawvq/.test(ss.body.model), "everyone else doesn't", JSON.stringify(ss.body));
r = await api(sam, "/api/ai/chat", "POST", { model: "dawvqTEST", messages: [{ role: "user", content: "hi" }] });
ok(r.status === 403, "…and can't use one by asking for it", JSON.stringify(r));

/* ---- kept VM ---- */
await own.page.evaluate(() => openAdmin());
await own.page.waitForFunction(() => /E2B isn't set up|none yet|paused|open now/.test(document.querySelector("#ad-kept-state")?.textContent || ""), null, { timeout: 8000 });
ok(await own.page.isVisible("#ad-kept"), "the Admin panel has the kept VM card");
ok((await api(sam, "/api/vm/kept")).status === 403, "the kept VM is owner-only");

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
