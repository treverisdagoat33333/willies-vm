/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Voice channels: three accounts talking in #general (Chromium's fake microphone
// plays a tone), everyone else seeing who's there, mute, leave, and calls.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const stamp = Date.now().toString(36).slice(-5);
async function person(name) {
  const ctx = await browser.newContext({ baseURL: BASE, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  if (name) {
    await page.evaluate(async (name) => {
      const r = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: "password123" }) });
      if (!r.ok) throw new Error(await r.text());
    }, name);
    await page.reload();
  } else {
    await page.click("#guest-button");
  }
  await page.waitForFunction(() => typeof chatMe !== "undefined" && !!chatMe, null, { timeout: 15000 });
  return { ctx, page, errors, name };
}
const stats = (p) => p.page.evaluate(() => window.voice.stats());
const heardFrom = async (listener, speaker) => {
  const s = await stats(listener), i = s?.members.find((m) => m.name === speaker.name)?.i;
  return s?.heard[i] || { got: 0, peak: 0 };
};

const a = await person("vann" + stamp), b = await person("vbob" + stamp), c = await person("vcat" + stamp);

// ---- join from the channel's header
await a.page.evaluate(() => { openChat(); });
await a.page.waitForSelector("#dc-voice:not([hidden])", { timeout: 10000 }).catch(() => {});
ok(await a.page.isVisible("#dc-voice"), "a text channel has a Join voice button");
await a.page.click("#dc-voice");
await a.page.waitForFunction(() => window.voice.stats()?.members.length === 1, null, { timeout: 10000 }).catch(() => {});
ok((await stats(a))?.members.length === 1 && await a.page.isVisible("#vc"), "joining shows the voice bar", JSON.stringify(await stats(a)));
await b.page.evaluate(() => window.voice.join("general"));
await c.page.evaluate(() => window.voice.join("general"));
await a.page.waitForFunction(() => window.voice.stats()?.members.length === 3, null, { timeout: 10000 }).catch(() => {});
ok((await stats(a))?.members.length === 3 && (await stats(c))?.members.length === 3, "three people in the channel's voice", JSON.stringify((await stats(a))?.members));
await a.page.waitForTimeout(1500);
const ab = await heardFrom(a, b), ac = await heardFrom(a, c), ba = await heardFrom(b, a);
ok(ab.got > 30 && ac.got > 30 && ba.got > 30, "everyone hears everyone else", JSON.stringify({ ab, ac, ba }));
ok(ab.peak > 0.01 && ac.peak > 0.01, "…and it's sound, not silence", JSON.stringify({ ab, ac }));
await a.page.waitForFunction(() => document.querySelectorAll("#vc-people .vc-p.talking").length > 0, null, { timeout: 5000 }).catch(() => {});
ok(await a.page.$$eval("#vc-people .vc-p.talking", (x) => x.length) > 0, "the people talking light up");

// ---- everyone else sees who's in voice, but a guest can't join
const g = await person(null);
await g.page.waitForFunction(() => document.querySelector("#dc-channels .dc-vc")?.textContent === "3", null, { timeout: 10000 }).catch(() => {});
ok(await g.page.$eval("#dc-channels .dc-vc", (e) => e.textContent).catch(() => "") === "3", "the channel list shows 3 in voice, to everyone", await g.page.$eval("#dc-channels", (e) => e.innerHTML.slice(0, 200)));
const guestTry = await g.page.evaluate(() => new Promise((resolve) => {
  const ws = new WebSocket(`ws://${location.host}/voice/?channel=general`);
  ws.onopen = () => resolve("opened");
  ws.onerror = () => resolve("refused");
  setTimeout(() => resolve("timeout"), 4000);
}));
ok(guestTry === "refused", "a guest can't join voice", guestTry);
await g.ctx.close();

// ---- mute
await b.page.click("#vc-mute");
await a.page.waitForFunction((n) => window.voice.stats()?.members.find((m) => m.name === n)?.muted, b.name, { timeout: 5000 }).catch(() => {});
ok(await a.page.$$eval("#vc-people .vc-muted", (x) => x.length) === 1, "muting shows on everyone's voice bar");
await a.page.waitForTimeout(300);
const before = (await heardFrom(a, b)).got;
await a.page.waitForTimeout(800);
ok((await heardFrom(a, b)).got - before <= 2, "…and your voice stops going out", `${before} -> ${(await heardFrom(a, b)).got}`);
await b.page.click("#vc-mute");

// ---- leave
await c.page.click("#vc-leave");
await a.page.waitForFunction(() => window.voice.stats()?.members.length === 2, null, { timeout: 5000 }).catch(() => {});
ok((await stats(a))?.members.length === 2 && !(await c.page.isVisible("#vc")), "leaving takes you out of it", JSON.stringify((await stats(a))?.members));
await a.page.waitForFunction(() => document.querySelector("#dc-channels .dc-vc")?.textContent === "2", null, { timeout: 5000 }).catch(() => {});
ok(await a.page.$eval("#dc-channels .dc-vc", (e) => e.textContent) === "2", "…and the count goes down");

// ---- a call takes you out of voice (one mic, one conversation)
await a.page.evaluate((to) => window.calls.start(to), b.name);
await b.page.waitForFunction(() => document.querySelector("#call").dataset.state === "incoming", null, { timeout: 10000 }).catch(() => {});
ok(!(await a.page.evaluate(() => window.voice.active)), "calling someone leaves voice");
await b.page.click("#cl-accept");
await b.page.waitForTimeout(500);
ok(!(await b.page.evaluate(() => window.voice.active)), "…and so does answering");
ok(await b.page.evaluate(() => { window.voice.join("general"); return window.voice.active; }) === false, "you can't join voice while in a call");
await a.page.click("#cl-end").catch(() => {});

ok(![a, b, c].some((p) => p.errors.length), "no page errors", [a, b, c].flatMap((p) => p.errors).join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
