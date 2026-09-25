/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
import { chromium } from "playwright";
const BASE = process.env.BASE, SITE = process.env.SITE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
const ctx = await browser.newContext({ baseURL: BASE });
const page = await ctx.newPage();
let phase = "start";
page.on("pageerror", (e) => errors.push(`[${phase}] page: ${e.message} @ ${(e.stack||"").split("\n").slice(0,3).join(" | ")}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
await page.goto("/");
await page.click("#guest-button");
await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });

// default engine
ok(await page.evaluate(() => S.proxy === "sj2" && proxyId() === "sj2"), "default engine is Scramjet v2");
await page.evaluate(() => openSettings());
await page.click('#snav [data-page="browser"]');
ok(await page.$eval('select[data-setting="proxy"]', (s) => s.value) === "sj2", "Settings shows Scramjet v2 selected");
ok(JSON.stringify(await page.$$eval('select[data-setting="proxy"] option', (o) => o.map((x) => x.value))) === '["sj2","wj","sj1","uv"]', "Settings offers all four engines");
await page.evaluate(() => closePanel("settings-panel"));

const PREFIX = { sj2: "/~/sj/", wj: "/~/wj/", sj1: "/~/sj1/", uv: "/~/uv/" };
const activeFrame = async () => {
  const h = await page.$("#browser-frames iframe.active");
  return h && (await h.contentFrame());
};
async function waitText(sel, pred, ms = 20000) {
  const end = Date.now() + ms;
  let last = null;
  while (Date.now() < end) {
    try {
      const f = await activeFrame();
      last = f && (await f.$eval(sel, (e) => e.textContent));
      if (last != null && pred(last)) return last;
    } catch (_) {}
    await page.waitForTimeout(250);
  }
  return last;
}
async function checkSite(engine, label) {
  phase = label;
  // after a switch, the old engine's page stays up until the new frame replaces it
  await page.waitForFunction((p) => document.querySelector("#browser-frames iframe.active")?.getAttribute("src")?.includes(p), PREFIX[engine], { timeout: 20000 }).catch(() => {});
  const h = await waitText("#h", (t) => t === "Proxy test home");
  ok(h === "Proxy test home", `${label}: page loads through ${engine}`, h);
  const f = await activeFrame();
  const src = f ? f.url() : "(no frame)";
  ok(src.startsWith(BASE + PREFIX[engine]), `${label}: frame is on the ${PREFIX[engine]} prefix`, src);
  ok(await f.$eval("body", (b) => b.dataset.inline) === "1", `${label}: inline script runs`);
  ok(await f.$eval("body", (b) => getComputedStyle(b).backgroundColor) === "rgb(1, 2, 3)", `${label}: stylesheet applies`);
  const img = await (async () => { for (let i = 0; i < 40; i++) { const w = await f.$eval("#img", (i) => i.complete && i.naturalWidth).catch(() => 0); if (w) return w; await page.waitForTimeout(250); } return 0; })();
  ok(img === 1, `${label}: image loads`, img);
  const loc = await waitText("#loc", (t) => !!t);
  ok(loc === SITE + "/", `${label}: page sees its real address`, loc);
  const fetched = await waitText("#fetched", (t) => t !== "waiting");
  ok(fetched === "cookie=wvmtest=hello", `${label}: fetch works and carries the site's cookie`, fetched);
  const ws = await waitText("#ws", (t) => t !== "waiting");
  ok(ws === "echo:ping", `${label}: WebSocket works`, ws);
  await f.click("#next");
  const h2 = await waitText("#h", (t) => t === "Page two");
  ok(h2 === "Page two", `${label}: clicking a link navigates`, h2);
  await page.click("#b-back");
  const h3 = await waitText("#h", (t) => t === "Proxy test home");
  ok(h3 === "Proxy test home", `${label}: Back button goes back`, h3);
  await page.click("#b-reload");
  await page.waitForTimeout(800);
  const h4 = await waitText("#h", (t) => t === "Proxy test home");
  ok(h4 === "Proxy test home", `${label}: Reload keeps the page`, h4);
}
async function pickEngine(engine) {
  phase = "pick " + engine;
  await page.evaluate(() => openSettings());
  await page.click('#snav [data-page="browser"]');
  await page.selectOption('select[data-setting="proxy"]', engine);
  await page.waitForTimeout(300);
  await page.evaluate(() => closePanel("settings-panel"));
}

// Scramjet v2 (default)
await page.evaluate((u) => openBrowser(u), SITE + "/");
await checkSite("sj2", "Scramjet v2");

for (const [engine, name] of [["wj", "WillieJet"], ["sj1", "Scramjet v1"], ["uv", "Ultraviolet"]]) {
  // switching in Settings reloads the open tab on the new engine
  await pickEngine(engine);
  ok(await page.evaluate(() => S.proxy) === engine, `${name}: setting saved`);
  ok(JSON.parse(await page.evaluate(() => localStorage.getItem("wvm.settings.v1"))).proxy === engine, `${name}: setting persisted`);
  await checkSite(engine, `${name} (switched)`);
  // and a brand new tab uses it too
  await page.evaluate((u) => newTab(u), SITE + "/");
  await checkSite(engine, `${name} (new tab)`);
  ok(await page.evaluate(() => tabs.every((t) => t.engine === S.proxy)), `${name}: every tab is on the new engine`);
}

// setting survives a reload, and the browser comes back up on it
await page.reload();
await page.waitForFunction(() => typeof S !== "undefined");
ok(await page.evaluate(() => S.proxy) === "uv", "engine choice survives a page reload");
await page.evaluate((u) => openBrowser(u), SITE + "/");
await checkSite("uv", "Ultraviolet (after reload)");

// back to v2
await pickEngine("sj2");
await checkSite("sj2", "Scramjet v2 (switched back)");

const hits = await (await fetch(SITE + "/hits")).json();
ok(hits.filter((h) => h === "/").length >= 10, "the site was actually reached through wisp", hits.length);
ok(!errors.filter((e) => !/Failed to load resource|favicon|net::ERR/.test(e)).length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log("errors:\n" + errors.slice(0, 30).join("\n"));
await browser.close();
process.exit(fail ? 1 : 0);
