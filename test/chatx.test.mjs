/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Chat extras (js/chat-extras.js, chat.js, emoji.js): threads, polls, voice
// messages and custom emoji, between real pages.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const stamp = Date.now().toString(36).slice(-5);
async function person(name, login) {
  const ctx = await browser.newContext({ baseURL: BASE, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.evaluate(async ({ name, login }) => {
    const r = await fetch(login ? "/api/auth/login" : "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: login || "password123" }) });
    if (!r.ok) throw new Error(await r.text());
  }, { name, login });
  await page.reload();
  await page.waitForFunction(() => typeof chatMe !== "undefined" && !!chatMe && chatReady, null, { timeout: 15000 });
  await page.evaluate(() => openChat());
  return { ctx, page, errors, name };
}
const a = await person("xann" + stamp), b = await person("xbob" + stamp);
const send = (p, text) => p.page.evaluate((text) => { document.querySelector("#dc-input").value = text; sendChat(); }, text);
const until = (p, fn, arg) => p.page.waitForFunction(fn, arg, { timeout: 8000 }).then(() => true, () => false);

/* ---- threads ---- */
await send(a, "thread parent " + stamp);
await until(b, (s) => dcMessages.some((m) => m.text === "thread parent " + s), stamp);
const pid = await b.page.evaluate((s) => dcMessages.find((m) => m.text === "thread parent " + s).id, stamp);
await b.page.evaluate((id) => window.chatx.openThread(dcMessages.find((m) => m.id === id)), pid);
ok(await b.page.isVisible("#dc-thread"), "Reply in thread opens the thread panel");
await b.page.fill("#dc-thread-input", "first reply");
await b.page.press("#dc-thread-input", "Enter");
ok(await until(b, () => /first reply/.test(document.querySelector("#dc-thread-list").textContent)), "a thread reply shows in the panel");
ok(await until(a, (id) => dcMessages.find((m) => m.id === id)?.thread?.count === 1 && !!document.querySelector(".dc-thread-chip"), pid), "…the parent gets a \"1 reply\" chip for everyone");
ok(await a.page.evaluate(() => !dcMessages.some((m) => m.text === "first reply")), "…and the reply stays out of the channel");
await a.page.click(".dc-thread-chip");
ok(await until(a, () => /first reply/.test(document.querySelector("#dc-thread-list")?.textContent || "")), "the chip opens the thread with its replies");
await a.page.click("#dc-thread-close");

/* ---- polls ---- */
await a.page.click("#dc-poll-btn");
await a.page.fill("#dcf-q", "Pizza or tacos?");
await a.page.fill("#dcf-options", "Pizza\nTacos\nBoth");
await a.page.click("#dc-modal-ok");
ok(await until(b, () => !!document.querySelector(".dc-poll")), "a poll shows for everyone");
await b.page.click(".dc-poll-opt >> nth=1");
ok(await until(a, () => { const o = [...document.querySelectorAll(".dc-poll-opt")]; return o[1] && /100%/.test(o[1].textContent); }), "a vote shows live for the others");
await b.page.click(".dc-poll-opt >> nth=0");
ok(await until(b, () => { const o = [...document.querySelectorAll(".dc-poll-opt")]; return /100%/.test(o[0].textContent) && /0%/.test(o[1].textContent); }), "…voting again in a one-answer poll moves the vote");
ok(await b.page.$eval(".dc-poll-opt.mine", (e) => /Pizza/.test(e.textContent)), "…and your pick is marked");

/* ---- voice messages ---- */
ok(await a.page.isVisible("#dc-rec"), "accounts get a record button");
await a.page.click("#dc-rec");
await a.page.waitForTimeout(1500);
await a.page.click("#dc-rec");
ok(await until(b, () => !!document.querySelector(".dc-voice-msg audio")), "a voice message arrives and plays in a player");
const au = await b.page.evaluate(async () => { const src = document.querySelector(".dc-voice-msg audio").src; const r = await fetch(src); return { type: r.headers.get("content-type"), csp: r.headers.get("content-security-policy") }; });
ok(/^audio\//.test(au.type) && /sandbox/.test(au.csp), "…served as sound, still sandboxed", JSON.stringify(au));

/* ---- custom emoji: only admins add them ---- */
const denied = await b.page.evaluate(async (png) => (await fetch("/api/emoji?name=nope", { method: "POST", body: Uint8Array.from(atob(png), (c) => c.charCodeAt(0)) })).status, PNG.toString("base64"));
ok(denied === 403, "members can't add emoji", denied);
const own = await person("testowner", "test-owner-pass");
const added = await own.page.evaluate(async (png) => (await fetch("/api/emoji?name=party_" + Date.now().toString(36).slice(-4), { method: "POST", body: Uint8Array.from(atob(png), (c) => c.charCodeAt(0)) })).json(), PNG.toString("base64"));
ok(/^party_/.test(added.name), "the owner can add one", JSON.stringify(added));
ok(await until(b, (n) => dcEmojis.some((e) => e.name === n), added.name), "…and everyone gets it straight away");
await send(b, `nice :${added.name}:`);
ok(await until(a, (n) => !!document.querySelector(`#dc-msgs img.dc-cemoji[alt=":${n}:"]`), added.name), "…it shows as a picture in messages");
const mid = await a.page.evaluate(() => dcMessages.at(-1).id);
await a.page.evaluate(({ id, n }) => dcReact(id, `:${n}:`), { id: mid, n: added.name });
ok(await until(b, (n) => !!document.querySelector(`.dc-react .dc-cemoji[alt=":${n}:"]`), added.name), "…and works as a reaction");
const badType = await own.page.evaluate(async () => (await fetch("/api/emoji?name=bad", { method: "POST", body: "<svg onload=alert(1)>" })).status);
ok(badType === 415, "an emoji that isn't a picture is refused", badType);

for (const p of [a, b, own]) ok(!p.errors.length, `no page errors (${p.name})`, p.errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
