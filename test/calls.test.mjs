/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Voice calls between two accounts, with Chromium's fake microphone.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--auto-select-desktop-capture-source=Entire screen"],
});
const stamp = Date.now().toString(36).slice(-5);
async function person(name, extra = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.evaluate(async ({ name }) => {
    const r = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: "password123" }) });
    if (!r.ok) throw new Error(await r.text());
  }, { name });
  if (Object.keys(extra).length) await page.evaluate((x) => Object.entries(x).forEach(([k, v]) => localStorage.setItem(k, v)), extra);
  await page.reload();
  await page.waitForFunction(() => typeof chatMeAccount !== "undefined" && chatMeAccount === true, null, { timeout: 15000 });
  return { ctx, page, errors, name };
}
const state = (p) => p.page.$eval("#call", (c) => c.dataset.state);
async function connect(a, b, label) {
  await a.page.evaluate((to) => window.calls.start(to), b.name);
  await b.page.waitForFunction(() => document.querySelector("#call").dataset.state === "incoming", null, { timeout: 15000 }).catch(() => {});
  ok(await state(b) === "incoming", `${label}: the call rings`, await state(b));
  await b.page.click("#cl-accept");
  const t0 = Date.now();
  const timer = (p) => p.page.waitForFunction(() => /^\d+:\d\d/.test(document.querySelector("#cl-status").textContent), null, { timeout: 30000 }).then(() => true, () => false);
  const [ta, tb] = await Promise.all([timer(a), timer(b)]);
  ok(ta && tb, `${label}: both sides connect`, `${await a.page.textContent("#cl-status")} / ${await b.page.textContent("#cl-status")}`);
  return Date.now() - t0;
}
const stats = (p) => p.page.evaluate(() => window.calls.stats());
const setFlag = (p, v) => p.page.evaluate((v) => { localStorage.removeItem("wvm.callRelayUntil"); v ? localStorage.setItem("wvm.callRelay", v) : localStorage.removeItem("wvm.callRelay"); }, v);
async function hangUp() {
  await a.page.click("#cl-end").catch(() => {});
  await b.page.waitForFunction(() => document.querySelector("#call").dataset.state === "off", null, { timeout: 10000 }).catch(() => {});
}

const a = await person("ann" + stamp), b = await person("bob" + stamp);

// ---- direct (WebRTC)
await connect(a, b, "direct");
await b.page.waitForFunction(() => document.querySelectorAll("#cl-audio audio").length > 0, null, { timeout: 10000 }).catch(() => {});
ok(await b.page.$$eval("#cl-audio audio", (x) => x.length) > 0, "direct: the other side's voice arrives");
await a.page.click("#cl-end");
await b.page.waitForFunction(() => document.querySelector("#call").dataset.state === "off", null, { timeout: 10000 }).catch(() => {});
ok(await state(a) === "off" && await state(b) === "off", "hanging up ends it on both sides");

// ---- through our server, chosen up front (wvm.callRelay=always, as on a network known to block calls)
await setFlag(a, "always"); await setFlag(b, "always");
await connect(a, b, "relay");
await a.page.waitForTimeout(1500);
let sa = await stats(a), sb = await stats(b);
ok(sa?.mode === "relay" && sb?.mode === "relay" && /via our server/.test(await a.page.textContent("#cl-status")), "relay: the call goes through our server, and says so", JSON.stringify({ sa, sb }));
ok(sb.got > 30 && sa.got > 30, "relay: voice arrives both ways", JSON.stringify({ sa, sb }));
ok(sb.peak > 0.01 && sa.peak > 0.01, "…and it's sound, not silence", JSON.stringify({ a: sa.peak, b: sb.peak }));
// muting stops your voice being sent
await a.page.click("#cl-mute");
await a.page.waitForTimeout(300);
const before = (await stats(b)).got;
await a.page.waitForTimeout(800);
ok((await stats(b)).got - before <= 2, "relay: muting stops sending your voice", `${before} -> ${(await stats(b)).got}`);
await a.page.click("#cl-mute");
// a shared screen comes through as pictures
const canShare = await a.page.evaluate(() => !!navigator.mediaDevices?.getDisplayMedia);
if (canShare) {
  await a.page.click("#cl-share");
  await b.page.waitForFunction(() => (window.calls.stats()?.frames || 0) >= 2, null, { timeout: 10000 }).catch(() => {});
  sb = await stats(b);
  ok(sb.frames >= 2 && await b.page.$eval("#call", (c) => c.classList.contains("relay-video")), "relay: a shared screen shows on the other side", JSON.stringify(sb));
  await a.page.click("#cl-share");
  await b.page.waitForFunction(() => !document.querySelector("#call").classList.contains("relay-video"), null, { timeout: 5000 }).catch(() => {});
  ok(!(await b.page.$eval("#call", (c) => c.classList.contains("relay-video"))), "…and goes away when sharing stops");
}
// nobody else can join the call's relay
const c = await person("cat" + stamp);
const id = (await stats(a)).id;
const intruder = await c.page.evaluate((id) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://${location.host}/call-relay/?id=${id}`);
  ws.onmessage = (e) => resolve("got " + e.data);
  ws.onerror = () => resolve("refused");
  ws.onclose = () => resolve("refused");
  setTimeout(() => resolve("timeout"), 4000);
}), id);
ok(intruder === "refused", "someone not in the call can't join its relay", intruder);
await c.ctx.close();
await hangUp();

// ---- a network that blocks direct calls: it falls back on its own
await setFlag(a, "blocked"); await setFlag(b, null);
const took = await connect(a, b, "fallback");
ok((await stats(a))?.mode === "relay" && (await stats(b))?.mode === "relay", "fallback: when the direct path fails, the call moves to our server by itself", JSON.stringify([await stats(a), await stats(b)]));
ok(await a.page.evaluate(() => +localStorage.getItem("wvm.callRelayUntil") > Date.now()) && await b.page.evaluate(() => +localStorage.getItem("wvm.callRelayUntil") > Date.now()), "…and both devices remember to go straight there", took);
await hangUp();
await setFlag(a, null);
await a.page.evaluate(() => localStorage.setItem("wvm.callRelayUntil", String(Date.now() + 3600e3)));
const quick = await connect(a, b, "remembered");
ok((await stats(a))?.mode === "relay" && quick < 6000, "the next call goes through our server right away", `${quick} ms`);
await hangUp();

ok(!a.errors.length && !b.errors.length, "no page errors", [...a.errors, ...b.errors].join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
