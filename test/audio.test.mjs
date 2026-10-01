/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Does the sound actually come out the other side? The calls and voice suites
// check that voice data arrives; this one measures what each page plays, for a
// direct call, a call through our relay (and the switch to it mid-call) and a
// voice channel, both ways, plus mute and deafen. Headless Chrome ignores the
// "sound needs a click" rule, so the recovery for browsers that enforce it
// (Safari; soundUnlock in app.js) is tested with stand-ins.
//
// What counts as "playing": an <audio> element that is playing, not muted, at
// a volume, whose stream carries sound; or a node wired to a running
// AudioContext's speakers that carries sound. The fake microphone beeps.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

/* the meter, put in every page before its own scripts */
const METER = () => {
  const taps = [];
  const realConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = realConnect.call(this, dest, ...rest);
    try {
      if (dest instanceof AudioDestinationNode) {
        const an = this.context.createAnalyser();
        an.fftSize = 2048;
        realConnect.call(this, an);
        taps.push({ ctx: this.context, an });
      }
    } catch (_) {}
    return r;
  };
  let meterCtx = null;
  const elTaps = new WeakMap();
  const rms = (an) => { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); };
  window.__level = () => {
    let el = 0, ctx = 0;
    for (const t of taps) if (t.ctx.state === "running") ctx = Math.max(ctx, rms(t.an));
    for (const a of document.querySelectorAll("audio")) {
      if (!a.srcObject || a.paused || a.muted || a.volume === 0) continue;
      try {
        meterCtx ||= new AudioContext();
        if (meterCtx.state !== "running") meterCtx.resume();
        let an = elTaps.get(a);
        if (!an) { an = meterCtx.createAnalyser(); an.fftSize = 2048; meterCtx.createMediaStreamSource(a.srcObject).connect(an); elTaps.set(a, an); }
        el = Math.max(el, rms(an));
      } catch (_) {}
    }
    return { el, ctx, max: Math.max(el, ctx), suspended: taps.filter((t) => t.ctx.state !== "running" && t.ctx.state !== "closed").length, paused: [...document.querySelectorAll("audio")].filter((a) => a.srcObject && a.paused).length };
  };
};
/* the loudest sound a page puts out over a few seconds */
const hear = async (p, ms = 3500) => {
  await p.page.waitForTimeout(400); // the site's own click sound for the button just pressed
  let best = { max: 0 };
  for (const end = Date.now() + ms; Date.now() < end;) {
    const l = await p.page.evaluate(() => window.__level());
    if (l.max >= best.max) best = l;
    await p.page.waitForTimeout(100);
  }
  return best;
};
const LOUD = 0.005; // the fake microphone's beep is well above this; silence is ~0

const stamp = Date.now().toString(36).slice(-5);
async function person(name, extra = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, permissions: ["microphone", "camera"] });
  await ctx.addInitScript(METER);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.evaluate(async ({ name }) => {
    const r = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: "password123" }) });
    if (!r.ok) throw new Error(await r.text());
  }, { name });
  await page.evaluate((x) => Object.entries(x).forEach(([k, v]) => localStorage.setItem(k, v)), extra);
  await page.reload();
  await page.waitForFunction(() => typeof chatMeAccount !== "undefined" && chatMeAccount === true, null, { timeout: 15000 });
  await page.mouse.click(5, 5); // someone using the site has clicked on it at some point
  return { ctx, page, errors, name };
}
const state = (p) => p.page.$eval("#call", (c) => c.dataset.state);
async function call(a, b, label) {
  // the caller presses Call in the DM, the other side presses Accept: real clicks, as people do
  await a.page.evaluate((to) => { openChat(); dcSend({ type: "dm.open", name: to }); }, b.name);
  await a.page.waitForSelector("#dc-call:not([hidden])", { timeout: 10000 });
  await a.page.click("#dc-call");
  await b.page.waitForFunction(() => document.querySelector("#call").dataset.state === "incoming", null, { timeout: 15000 }).catch(() => {});
  await b.page.click("#cl-accept");
  const timer = (p) => p.page.waitForFunction(() => /^\d+:\d\d/.test(document.querySelector("#cl-status").textContent), null, { timeout: 30000 }).then(() => true, () => false);
  const [ta, tb] = await Promise.all([timer(a), timer(b)]);
  ok(ta && tb, `${label}: the call connects`);
  await a.page.waitForTimeout(1500);
}
async function hangUp(a, b) {
  await a.page.click("#cl-end").catch(() => {});
  await b.page.waitForFunction(() => document.querySelector("#call").dataset.state === "off", null, { timeout: 10000 }).catch(() => {});
  await a.page.waitForTimeout(500);
}
const both = async (a, b, label) => {
  const [hb, ha] = await Promise.all([hear(b), hear(a)]);
  ok(hb.max > LOUD, `${label}: ${b.name.slice(0, 3)} hears ${a.name.slice(0, 3)} through the speakers`, JSON.stringify(hb));
  ok(ha.max > LOUD, `${label}: ${a.name.slice(0, 3)} hears ${b.name.slice(0, 3)} too`, JSON.stringify(ha));
};

/* ---- sound the browser blocks until a click: the site asks, and the click starts it ---- */
{
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/"); // nobody has clicked this page yet
  await page.waitForFunction(() => typeof resumeSound === "function");
  // headless Chrome plays sound without a click whatever the flags say, so this stands in for
  // Safari: a sound engine and a player that refuse to start until the page is clicked
  const before = await page.evaluate(() => {
    let clicked = false;
    addEventListener("pointerdown", () => { clicked = true; }, true);
    window.__ctx = { state: "suspended", resume() { if (clicked) this.state = "running"; return Promise.resolve(); } };
    window.__el = { paused: true, play() { if (!clicked) return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" })); this.paused = false; return Promise.resolve(); } };
    resumeSound(window.__ctx);
    playSound(window.__el);
    return new Promise((r) => setTimeout(() => r({ ctx: window.__ctx.state, el: window.__el.paused, toast: [...document.querySelectorAll(".toast")].some((t) => /turn the sound on/.test(t.textContent)) }), 300));
  });
  ok(before.ctx === "suspended" && before.el && before.toast, "blocked sound: nothing plays before a click, and the site says to click", JSON.stringify(before));
  await page.mouse.click(400, 300);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ ctx: window.__ctx.state, el: window.__el.paused }));
  ok(after.ctx === "running" && !after.el, "…and the first click turns both on", JSON.stringify(after));
  await ctx.close();
}

/* ---- a direct call (WebRTC) ---- */
const a = await person("ann" + stamp), b = await person("bob" + stamp);
await call(a, b, "direct");
ok((await a.page.evaluate(() => window.calls.stats()))?.mode !== "relay", "direct: it's a direct call", JSON.stringify(await a.page.evaluate(() => window.calls.stats())));
await both(a, b, "direct");
await a.page.click("#cl-mute");
await b.page.waitForTimeout(800);
ok((await hear(b, 2500)).max < LOUD, "direct: when Ann mutes, Bob hears nothing");
await a.page.click("#cl-mute");
await b.page.click("#cl-deaf");
ok((await hear(b, 2500)).max < LOUD, "direct: when Bob deafens, nothing comes out of his speakers");
await b.page.click("#cl-deaf");
ok((await hear(b)).max > LOUD, "direct: …and undeafening brings Ann back");
await hangUp(a, b);

/* ---- a call through our server ---- */
for (const p of [a, b]) await p.page.evaluate(() => { localStorage.removeItem("wvm.callRelayUntil"); localStorage.setItem("wvm.callRelay", "always"); });
await call(a, b, "relay");
ok((await a.page.evaluate(() => window.calls.stats()))?.mode === "relay", "relay: it goes through our server");
await both(a, b, "relay");
await b.page.click("#cl-deaf");
ok((await hear(b, 2500)).max < LOUD, "relay: deafening silences the speakers");
await b.page.click("#cl-deaf");
await hangUp(a, b);
// the fallback: direct fails after 9 s, and the call moves to our server with no click in between
for (const p of [a, b]) await p.page.evaluate(() => { localStorage.removeItem("wvm.callRelayUntil"); localStorage.setItem("wvm.callRelay", "blocked"); });
await call(a, b, "fallback");
await a.page.waitForFunction(() => window.calls.stats()?.mode === "relay", null, { timeout: 20000 }).catch(() => {});
await b.page.waitForTimeout(1500);
await both(a, b, "fallback (moved to our server mid-call)");
await hangUp(a, b);
for (const p of [a, b]) await p.page.evaluate(() => { localStorage.removeItem("wvm.callRelay"); localStorage.removeItem("wvm.callRelayUntil"); });

/* ---- a voice channel ---- */
const c = await person("cat" + stamp);
for (const p of [a, b, c]) { await p.page.evaluate(() => { openChat(); dcOpen("general"); }); }
for (const p of [a, b, c]) { await p.page.waitForSelector("#dc-voice:not([hidden])", { timeout: 10000 }); await p.page.click("#dc-voice"); }
await a.page.waitForFunction(() => window.voice.stats()?.members.length === 3, null, { timeout: 10000 }).catch(() => {});
await a.page.waitForTimeout(1500);
const [va, vb, vc] = await Promise.all([hear(a), hear(b), hear(c)]);
ok(va.max > LOUD && vb.max > LOUD && vc.max > LOUD, "voice channel: all three hear the others", JSON.stringify({ va, vb, vc }));
for (const p of [a, b]) await p.page.click("#vc-mute");
await c.page.waitForTimeout(1000);
ok((await hear(c, 2500)).max < LOUD, "voice channel: with the other two muted, Cat hears nothing");
for (const p of [a, b]) await p.page.click("#vc-mute");
await c.page.click("#vc-deaf");
ok((await hear(c, 2500)).max < LOUD, "voice channel: deafened, nothing comes out");
await c.page.click("#vc-deaf");
ok((await hear(c)).max > LOUD, "voice channel: …and undeafening brings them back");

ok(![a, b, c].some((p) => p.errors.length), "no page errors", [a, b, c].flatMap((p) => p.errors).join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
