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
const page = await (await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("/");
await page.click("#guest-button");
await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });
await page.evaluate(() => { S.proxy = "wj"; save(); });
const frameSrc = () => page.$eval("#browser-frames iframe.active", (f) => f.getAttribute("src"));
async function heading() {
  for (let i = 0; i < 60; i++) {
    try { const f = await (await page.$("#browser-frames iframe.active")).contentFrame(); const t = await f.$eval("h1", (e) => e.textContent); if (t) return t; } catch (_) {}
    await page.waitForTimeout(250);
  }
  return null;
}
await page.evaluate((u) => openBrowser(u), SITE + "/");
ok(await heading() === "Proxy test home", "WillieJet loads the page");
ok(await page.textContent("#b-engine") === "WJ", "toolbar shows WJ", await page.textContent("#b-engine"));

// pick Ultraviolet for this site from the toolbar
await page.click("#b-engine");
ok(await page.isVisible("#b-engine-pop.show"), "engine menu opens");
const items = await page.$$eval("#b-engine-pop button.item", (b) => b.map((x) => x.textContent));
ok(items.length === 4 && items.some((t) => /WillieJet.*default.*✓/.test(t)), "menu lists 4 engines, WillieJet is default and current", items.join(" | "));
await page.click('#b-engine-pop button.item:has-text("Ultraviolet")');
await page.waitForFunction(() => document.querySelector("#browser-frames iframe.active")?.getAttribute("src")?.includes("/~/uv/"), null, { timeout: 15000 }).catch(() => {});
ok(await heading() === "Proxy test home" && (await frameSrc()).includes("/~/uv/"), "picking Ultraviolet reloads the site on it", await frameSrc());
ok(await page.textContent("#b-engine") === "UV", "toolbar now shows UV");
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("wvm.siteEngines"))["127.0.0.1"] === "uv"), "the choice is remembered for the site");
await page.evaluate((u) => newTab(u), SITE + "/page2");
await heading();
ok((await frameSrc()).includes("/~/uv/"), "a new tab on the same site uses the remembered engine", await frameSrc());
// back to default
await page.click("#b-engine");
await page.click('#b-engine-pop button.item:has-text("Use my default engine")');
await page.waitForTimeout(500);
await heading();
ok((await frameSrc()).includes("/~/wj/"), "'Use my default engine' goes back to WillieJet", await frameSrc());

// a site that doesn't answer: the error page, no automatic retry (another engine wouldn't help)
await page.evaluate(() => navigate("http://localhost:1/", getTab()));
let errText = null;
for (let i = 0; i < 60 && !errText; i++) {
  await page.waitForTimeout(250);
  try { errText = await (await (await page.$("#browser-frames iframe.active")).contentFrame()).$eval("h1", (e) => e.textContent); } catch (_) {}
}
ok(/couldn't load/.test(errText || ""), "unreachable site shows WillieJet's error page", errText);
await page.waitForTimeout(800);
ok((await frameSrc()).includes("/~/wj/"), "a network failure doesn't trigger a pointless retry", await frameSrc());
// the error page's button switches engines
const ef = await (await page.$("#browser-frames iframe.active")).contentFrame();
await ef.click('button[data-e="sj2"]');
await page.waitForTimeout(1200);
ok((await frameSrc()).includes("/~/sj/"), "error page's 'Open with Scramjet v2' switches the tab", await frameSrc());
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("wvm.siteEngines")).localhost === "sj2"), "…and remembers it for that site");

// an engine failure (not the network) falls back to Ultraviolet by itself
await page.evaluate(() => { setSiteEngine("http://localhost:1/", null); });
await page.evaluate(() => navigate("http://localhost:1/", getTab()));
await page.waitForTimeout(2500);
const ef2 = await (await page.$("#browser-frames iframe.active")).contentFrame();
await ef2.evaluate(() => parent.postMessage({ wj: "failed", url: "http://localhost:1/", error: "rewriter crashed", network: false }, location.origin));
await page.waitForTimeout(1200);
ok((await frameSrc()).includes("/~/uv/"), "an engine failure retries on Ultraviolet automatically", await frameSrc());
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("wvm.siteEngines")).localhost === "uv"), "…and remembers it");

// messages from somewhere other than our tab frames are ignored
await page.evaluate(() => window.postMessage({ wj: "switch", engine: "sj1", url: "http://localhost:1/" }, location.origin));
await page.waitForTimeout(500);
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("wvm.siteEngines")).localhost === "uv"), "a message not from a tab frame is ignored");
ok(!errors.length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
