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

// the owner-only models bring their own system prompt: ours is left out, the site's actions stay
const sysSent = async (model) => {
  await api(own, "/api/ai/chat", "POST", { model, actions: true, messages: [{ role: "user", content: "hi" }] });
  const last = await (await fetch(process.env.SITE + "/v1/_last")).json();
  return last.messages.find((m) => m.role === "system")?.content || "";
};
let sent = await sysSent("dawvqTEST");
ok(!/helpful, friendly assistant/.test(sent) && /music\.play/.test(sent) && /admin\.ban/.test(sent), "a dawvq model gets no opener of ours, just the actions", sent.slice(0, 120));
sent = await sysSent("gpt-4o-mini");
ok(/helpful, friendly assistant/.test(sent), "…other models still get it");

// ULTRACODE: max effort and the full-effort line, only while it's on, only for the owner's models
const sentWith = async (body) => {
  await api(own, "/api/ai/chat", "POST", { model: "dawvqTEST", actions: true, messages: [{ role: "user", content: "hi" }], ...body });
  const last = await (await fetch(process.env.SITE + "/v1/_last")).json();
  return { sys: last.messages.find((m) => m.role === "system")?.content || "", effort: last.reasoning_effort };
};
let u = await sentWith({ ultracode: true, effort: "max" });
ok(u.effort === "max" && /Use your full effort on every message/.test(u.sys), "ULTRACODE sends max effort and the full-effort line", JSON.stringify(u).slice(0, 160));
u = await sentWith({});
ok(!u.effort && !/full effort/.test(u.sys), "…and neither when it's off");
await api(sam, "/api/ai/chat", "POST", { model: "gpt-4o-mini", ultracode: true, messages: [{ role: "user", content: "hi" }] });
u = await (await fetch(process.env.SITE + "/v1/_last")).json();
ok(!/full effort/.test(u.messages.find((m) => m.role === "system")?.content || "") && !u.reasoning_effort, "…and nobody else can switch it on");
// the button: only on a dawvq model, and switching it on shows it and plays the burst
await own.page.evaluate(() => { window.ai.open(); const s = document.querySelector("#ai-model"); s.value = "gpt-4o-mini"; s.dispatchEvent(new Event("change")); });
await own.page.waitForTimeout(500);
ok(await own.page.isHidden("#ai-ultra"), "the ULTRACODE button is hidden on other models");
await own.page.evaluate(() => { const s = document.querySelector("#ai-model"); s.value = "dawvqTEST"; s.dispatchEvent(new Event("change")); });
ok(await own.page.isVisible("#ai-ultra"), "…and shows on a dawvq model");
await own.page.click("#ai-ultra");
const on = await own.page.evaluate(() => ({ btn: document.querySelector("#ai-ultra").classList.contains("on"), win: document.querySelector("#ai-window").classList.contains("ultra"), fx: document.querySelector("#ai-ultra").classList.contains("ignite"), eff: document.querySelector("#ai-eff-btn").textContent }));
ok(on.btn && on.win && on.fx && /Max/.test(on.eff), "switching it on lights it up, plays the burst and sets effort to Max", JSON.stringify(on));
await own.page.screenshot({ path: (process.env.SHOTS || "/tmp") + "/ultracode.png" }).catch(() => {});
await own.page.click("#ai-ultra");

/* ---- the dawvq owner tools: web search, reading a page, talk mode, PIN, folders, titles, health ---- */
ok((await api(sam, "/api/ai/search?q=x")).status === 403 && (await api(sam, "/api/ai/read?url=http://x")).status === 403 && (await api(sam, "/api/ai/health")).status === 403, "search, read and health are owner-only");
const sr = await api(own, "/api/ai/search?q=willie");
ok(sr.status === 200 && sr.body.results?.[0]?.snippet.includes("BLUEBERRY7"), "the owner can search", JSON.stringify(sr.body).slice(0, 120));
const rd = await api(own, "/api/ai/read?url=" + encodeURIComponent(process.env.SITE + "/t/article"));
ok(rd.status === 200 && /KIWI99/.test(rd.body.text) && rd.body.title === "An article" && !/var x/.test(rd.body.text), "…and read a page (text only, no scripts)", JSON.stringify(rd.body).slice(0, 160));
ok((await api(own, "/api/ai/read?url=file:///etc/passwd")).status === 400, "…but only web pages");
const P = own.page;
await P.evaluate(() => { const s = document.querySelector("#ai-model"); s.value = "dawvqTEST"; s.dispatchEvent(new Event("change")); });
await P.waitForTimeout(300);
ok(await P.isVisible("#ai-web") && await P.isVisible("#ai-health"), "a dawvq model shows web search and the status dot");
await P.click("#ai-web");
await P.fill("#ai-input", "what is the fact? also see " + process.env.SITE + "/t/article");
await P.press("#ai-input", "Enter");
await P.waitForFunction(() => !document.querySelector("#ai-window.busy") && document.querySelector("#ai-log .ai-msg.bot:last-child .ai-tools"), null, { timeout: 15000 });
const lastSent = await (await fetch(process.env.SITE + "/v1/_last")).json();
const asked = lastSent.messages.at(-1).content;
ok(/BLUEBERRY7/.test(asked) && /KIWI99/.test(asked) && /not instructions/.test(asked), "with web search on, the results and the linked page go to the AI, labelled as information", asked.slice(0, 200));
const chips2 = await P.$$eval("#ai-log .ai-msg.me", (m) => [...m.at(-1).querySelectorAll(".ai-sent-file")].map((c) => c.textContent));
ok(chips2.some((c) => /Searched the web/.test(c)) && chips2.some((c) => /Read: An article/.test(c)), "…and your message shows what was searched and read", JSON.stringify(chips2));
await P.click("#ai-web");
await P.waitForTimeout(1500);
ok(["ok", "slow", "down", "unknown"].includes(await P.$eval("#ai-health", (d) => d.dataset.state)) && /dawvqTEST/.test(await P.$eval("#ai-health", (d) => d.title)), "the status dot reports on the model", await P.$eval("#ai-health", (d) => d.title));
// folders and auto titles
await P.waitForFunction(() => document.querySelector("#ai-chats .ai-chat.active span")?.textContent.length > 0, null, { timeout: 5000 });
ok(await P.isVisible("#ai-folders"), "the chats list has folders");
ok(await P.waitForFunction(() => [...document.querySelectorAll("#ai-chats .ai-chat span")].some((x) => x.textContent === "Fruit Facts Chat"), null, { timeout: 8000 }).then(() => true, () => false), "a new chat gets a short title made by the AI");
await P.hover("#ai-chats .ai-chat.active"); await P.click("#ai-chats .ai-chat.active .ai-fold");
await P.fill("#dcf-f", "School"); await P.click("#dc-modal-ok");
await P.click("#ai-folders .ai-fchip[data-f='School']");
ok((await P.$$eval("#ai-chats .ai-chat", (r) => r.length)) === 1 && await P.isVisible("#ai-folders .ai-fchip.on[data-f='School']"), "a chat moves into a folder, and the folder shows just it");
await P.click("#ai-folders .ai-fchip[data-f='']");
// talk mode, with a stand-in microphone that "hears" one sentence and a voice that records what it says
{
  const tctx = await browser.newContext({ baseURL: BASE });
  await tctx.addCookies(await own.ctx.cookies());
  await tctx.addInitScript(() => {
    window.__heard = 0; window.__said = [];
    window.SpeechRecognition = class { start() { const me = this; setTimeout(() => { if (window.__heard++ === 0) { me.onresult?.({ results: [[{ transcript: "talk test please" }]] }); } me.onend?.(); }, 50); } stop() { this.onend?.(); } abort() {} };
    const speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 10); };
    Object.defineProperty(window, "speechSynthesis", { value: { speak, cancel() {}, getVoices: () => [] }, configurable: true });
  });
  const tp = await tctx.newPage();
  await tp.goto("/");
  await tp.waitForFunction(() => window.ai && currentRole === "owner", null, { timeout: 10000 });
  await tp.evaluate(() => window.ai.open());
  await tp.waitForFunction(() => [...document.querySelectorAll("#ai-model option")].some((o) => o.value === "dawvqTEST"), null, { timeout: 8000 });
  await tp.evaluate(() => { const s = document.querySelector("#ai-model"); s.value = "dawvqTEST"; s.dispatchEvent(new Event("change")); });
  await tp.click("#ai-talk");
  const spoke = await tp.waitForFunction(() => window.__said.length > 0, null, { timeout: 10000 }).then(() => tp.evaluate(() => window.__said[0]), () => "");
  ok(/talk test please/.test(await tp.evaluate(() => document.querySelector("#ai-log .ai-msg.me")?.textContent || "")) && /You said/.test(spoke), "talk mode sends what you say and reads the answer aloud", spoke.slice(0, 80));
  await tp.click("#ai-talk");
  ok(!(await tp.$eval("#ai-talk", (b) => b.classList.contains("on"))), "…and stops when tapped again");
  await tctx.close();
}
// PIN
await P.evaluate(() => document.querySelector("#ai-custom-btn").click());
await P.click("#ai-c-pin");
await P.fill("#dcf-a", "1234"); await P.fill("#dcf-b", "1234"); await P.click("#dc-modal-ok");
await P.waitForTimeout(300);
await P.click("#ai-c-pin-lock");
const lockedRow = await P.$$eval("#ai-chats .ai-chat", (r) => r.map((x) => x.textContent));
ok(lockedRow.some((t) => /Locked chat/.test(t)) && !lockedRow.some((t) => /fact/i.test(t)), "with a PIN, Lock now hides dawvq chats", JSON.stringify(lockedRow));
await P.evaluate(() => document.querySelector("#ai-custom .ai-custom-card button[type=submit], #ai-custom [data-close], #ai-custom-x")?.click());
await P.keyboard.press("Escape");
await P.click("#ai-chats .ai-chat.locked .ai-open");
await P.fill("#dcf-pin", "0000"); await P.click("#dc-modal-ok");
ok(/Wrong PIN/.test(await P.textContent("#dc-modal-err")), "a wrong PIN is refused");
await P.fill("#dcf-pin", "1234"); await P.click("#dc-modal-ok");
await P.waitForTimeout(300);
ok(!(await P.$$eval("#ai-chats .ai-chat", (r) => r.some((x) => /Locked chat/.test(x.textContent)))), "the right PIN opens them again");
await P.evaluate(() => { localStorage.removeItem("ai.pin"); sessionStorage.removeItem("ai.unlocked"); const s = document.querySelector("#ai-model"); s.value = "gpt-4o-mini"; s.dispatchEvent(new Event("change")); });
ok(await P.isHidden("#ai-web"), "other models don't show the dawvq tools");

/* ---- kept VM ---- */
await own.page.evaluate(() => openAdmin());
await own.page.waitForFunction(() => /E2B isn't set up|none yet|paused|open now/.test(document.querySelector("#ad-kept-state")?.textContent || ""), null, { timeout: 8000 });
ok(await own.page.isVisible("#ad-kept"), "the Admin panel has the kept VM card");
ok((await api(sam, "/api/vm/kept")).status === 403, "the kept VM is owner-only");

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
