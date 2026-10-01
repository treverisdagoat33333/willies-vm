/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Auto-healing connections and adaptive quality (both in app.js). A socket that
// dies without closing is played by telling the heartbeat it has heard nothing
// for a minute: the next check must treat it as closed and reconnect.
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
  const ctx = await browser.newContext({ baseURL: BASE, permissions: ["microphone", "camera"] });
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
  await page.waitForFunction(() => typeof chatMeAccount !== "undefined" && chatMeAccount === true && chatReady, null, { timeout: 15000 });
  return { ctx, page, errors, name };
}
/* make a socket look dead: nothing heard for a minute */
// (pinned, so voice still arriving can't refresh it: a dead socket hears nothing at all)
const stall = (p, pick) => p.page.evaluate((pick) => { for (const s of liveSockets) if (s.ws.url.includes(pick)) Object.defineProperty(s, "last", { get: () => Date.now() - 60000, set() {} }); }, pick);
const a = await person("ann" + stamp), b = await person("bob" + stamp);

/* ---- the heartbeat gets answered ---- */
const pong = await a.page.evaluate(async () => { const at = Date.now(); probeSockets(); await new Promise((r) => setTimeout(r, 800)); return [...liveSockets].filter((s) => s.ws.url.includes("/chat/")).map((s) => s.last >= at); });
ok(pong.length === 1 && pong[0], "chat: the server answers the heartbeat");

/* ---- chat: a dead socket is replaced, and you're where you were ---- */
await a.page.evaluate((to) => { openChat(); dcSend({ type: "dm.open", name: to }); }, b.name);
await a.page.waitForFunction(() => dcActive.startsWith("dm:"), null, { timeout: 5000 });
const dm = await a.page.evaluate(() => dcActive);
const oldWs = await a.page.evaluate(() => { window.__oldChat = chatWS; return true; });
await stall(a, "/chat/");
await a.page.waitForFunction(() => chatWS && chatWS !== window.__oldChat && chatReady, null, { timeout: 15000 }).catch(() => {});
ok(oldWs && await a.page.evaluate(() => !!chatWS && chatWS !== window.__oldChat && chatReady), "chat: a connection that went silent is replaced by itself");
await a.page.waitForTimeout(600);
ok(await a.page.evaluate(() => dcActive) === dm, "…and you're back in the DM you had open", await a.page.evaluate(() => dcActive));
// written while the connection was down: sent when it's back
await a.page.evaluate(() => { const h = chatWS.onclose; chatWS.onclose = null; chatWS.close(); h({ code: 4000 }); });
await a.page.fill("#dc-input", "written while offline");
await a.page.press("#dc-input", "Enter");
ok(await a.page.evaluate(() => dcOutbox.length) === 1, "chat: a message written while offline is kept");
await b.page.evaluate(() => { openChat(); });
await b.page.waitForFunction((dm) => { if (dcActive !== dm) dcOpen(dm); return dcMessages.some((m) => m.text === "written while offline"); }, dm, { timeout: 15000, polling: 500 }).catch(() => {});
ok(await b.page.evaluate(() => dcMessages.some((m) => m.text === "written while offline")), "…and arrives once the connection is back");

/* ---- voice: a dead socket rejoins the same room ---- */
for (const p of [a, b]) await p.page.evaluate(() => { dcOpen("general"); window.voice.join("general"); });
await a.page.waitForFunction(() => window.voice.stats()?.members.length === 2, null, { timeout: 10000 }).catch(() => {});
await a.page.evaluate(() => { window.__oldVoice = [...liveSockets].find((s) => s.ws.url.includes("/voice/"))?.ws; });
await stall(a, "/voice/");
await a.page.waitForFunction(() => { const s = [...liveSockets].find((x) => x.ws.url.includes("/voice/")); return s && s.ws !== window.__oldVoice && s.ws.readyState === 1 && window.voice.stats()?.members.length === 2; }, null, { timeout: 15000 }).catch(() => {});
ok(await a.page.evaluate(() => { const s = [...liveSockets].find((x) => x.ws.url.includes("/voice/")); return !!s && s.ws !== window.__oldVoice && window.voice.stats()?.members.length === 2; }), "voice: a connection that went silent rejoins the same room by itself");
for (const p of [a, b]) await p.page.evaluate(() => window.voice.leave?.() ?? document.querySelector("#vc-leave")?.click());
await a.page.waitForTimeout(800);

/* ---- a call through our server: a dead socket reconnects, and voice keeps coming ---- */
for (const p of [a, b]) await p.page.evaluate(() => { localStorage.removeItem("wvm.callRelayUntil"); localStorage.setItem("wvm.callRelay", "always"); });
await a.page.evaluate((to) => window.calls.start(to), b.name);
await b.page.waitForFunction(() => document.querySelector("#call").dataset.state === "incoming", null, { timeout: 15000 }).catch(() => {});
await b.page.click("#cl-accept");
await a.page.waitForFunction(() => window.calls.stats()?.mode === "relay" && window.calls.stats()?.got > 10, null, { timeout: 20000 }).catch(() => {});
await a.page.evaluate(() => { window.__oldRelay = [...liveSockets].find((s) => s.ws.url.includes("/call-relay/"))?.ws; });
await stall(a, "/call-relay/");
await a.page.waitForFunction(() => { const s = [...liveSockets].find((x) => x.ws.url.includes("/call-relay/")); return s && s.ws !== window.__oldRelay && s.ws.readyState === 1; }, null, { timeout: 15000 }).catch(() => {});
const before = (await a.page.evaluate(() => window.calls.stats()))?.got || 0;
await a.page.waitForTimeout(2000);
const after = await a.page.evaluate(() => window.calls.stats());
ok(after?.mode === "relay" && after.got > before + 20, "call: a relay connection that went silent reconnects, and voice keeps coming", JSON.stringify({ before, after }));
await a.page.click("#cl-end").catch(() => {});
await b.page.waitForFunction(() => document.querySelector("#call").dataset.state === "off", null, { timeout: 10000 }).catch(() => {});
for (const p of [a, b]) await p.page.evaluate(() => { localStorage.removeItem("wvm.callRelay"); localStorage.removeItem("wvm.callRelayUntil"); });

/* ---- a direct call: a network change restarts its paths and it stays up ---- */
await a.page.waitForTimeout(800);
await a.page.evaluate((to) => window.calls.start(to), b.name);
await b.page.waitForFunction(() => document.querySelector("#call").dataset.state === "incoming", null, { timeout: 15000 }).catch(() => {});
await b.page.click("#cl-accept");
await a.page.waitForFunction(() => window.calls.stats()?.state === "connected", null, { timeout: 20000 }).catch(() => {});
await a.page.evaluate(() => window.dispatchEvent(new Event("online")));
await a.page.waitForTimeout(4000);
const d = await a.page.evaluate(() => window.calls.stats());
ok(d?.mode === "direct" && d.state === "connected", "call: a network change restarts a direct call's paths, and it stays connected", JSON.stringify(d));
await a.page.click("#cl-end").catch(() => {});
await a.page.waitForTimeout(500);

/* ---- a struggling share trades resolution for smooth motion, then climbs back ---- */
const adapt = await a.page.evaluate(async () => {
  const p = { encodings: [{ maxBitrate: 4e6 }], degradationPreference: "maintain-resolution" }, set = [];
  const sender = { track: { kind: "video", id: "v" }, getParameters: () => JSON.parse(JSON.stringify(p)), setParameters: async (x) => { Object.assign(p, x); set.push(x.encodings[0].scaleResolutionDownBy); } };
  let reason = "bandwidth";
  const pc = { connectionState: "connected", getSenders: () => [sender], getStats: async () => new Map([["o", { type: "outbound-rtp", kind: "video", trackIdentifier: "v", qualityLimitationReason: reason }]]) };
  const stop = adaptVideo(pc);
  await new Promise((r) => setTimeout(r, 9600)); // three checks, held back each time
  const down = { scale: p.encodings[0].scaleResolutionDownBy, pref: p.degradationPreference };
  reason = "none";
  await new Promise((r) => setTimeout(r, 18600)); // six fine checks
  stop();
  return { down, up: p.encodings[0].scaleResolutionDownBy, set };
});
ok(adapt.down.scale === 1.5 && adapt.down.pref === "balanced", "network: a share held back by bandwidth drops resolution, not frame rate", JSON.stringify(adapt));
ok(adapt.up === 1, "…and goes back to full once the connection has been fine for a while", JSON.stringify(adapt));

/* ---- a slow device gets the light look, without touching the setting ---- */
const c = await browser.newContext({ baseURL: BASE });
const cp = await c.newPage();
await cp.goto("/");
await cp.evaluate(() => { localStorage.setItem("wvm.autoLite.test", "1"); localStorage.removeItem("wvm.autoLite"); });
await cp.reload();
await cp.click("#guest-button");
await cp.waitForSelector("#auth-wrap.hidden", { state: "attached" });
await cp.evaluate(() => { if (typeof hideLauncher === "function") hideLauncher(); });
await cp.waitForTimeout(600);
const lite = await cp.evaluate(async () => {
  const startPerf = document.documentElement.dataset.perf;
  // a choppy desktop: frames 60 ms apart
  const real = window.requestAnimationFrame;
  window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 60);
  for (let i = 0; i < 2; i++) { measureFrames(); await new Promise((r) => setTimeout(r, 3400)); }
  window.requestAnimationFrame = real;
  return { startPerf, perf: document.documentElement.dataset.perf, setting: S.perf, saved: !!localStorage.getItem("wvm.autoLite"), note: document.getElementById("autolite-note").textContent };
});
ok(lite.startPerf === "off" && lite.perf === "on" && lite.setting === false && lite.saved, "device: a choppy desktop turns on the light look by itself, leaving the setting alone", JSON.stringify(lite));
ok(/On for this device/.test(lite.note), "…and Settings says why", lite.note);
await cp.evaluate(() => set("autoPerf", false));
ok(await cp.evaluate(() => document.documentElement.dataset.perf) === "off", "…and switching it off brings the effects back");
await c.close();

ok(![a, b].some((p) => p.errors.length), "no page errors", [a, b].flatMap((p) => p.errors).join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
