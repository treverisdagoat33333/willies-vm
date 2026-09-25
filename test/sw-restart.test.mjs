/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// The browser stops idle service workers; what happens to the next click?
import { chromium } from "playwright";
const BASE = process.env.BASE, SITE = process.env.SITE;
const verdict = {};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const engine of (process.env.ENGINES || "sj2,wj").split(",")) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.click("#guest-button");
  await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });
  await page.evaluate((e) => { S.proxy = e; }, engine);
  await page.evaluate((u) => openBrowser(u), SITE + "/");
  const h = async () => { for (let i = 0; i < 40; i++) { try { const f = await (await page.$("#browser-frames iframe.active")).contentFrame(); const t = await f.$eval("h1", (e) => e.textContent); if (t) return t; } catch (_) {} await page.waitForTimeout(250); } return null; };
  await h();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  const results = [];
  for (let round = 0; round < 3; round++) {
    await cdp.send("ServiceWorker.stopAllWorkers");
    await page.waitForTimeout(300);
    const f = await (await page.$("#browser-frames iframe.active")).contentFrame();
    await f.click("#next", { timeout: 5000 }).catch((e) => console.log("click failed", e.message.slice(0, 80)));
    await page.waitForTimeout(3000);
    let text = null;
    try { const f2 = await (await page.$("#browser-frames iframe.active")).contentFrame(); text = (await f2.$eval("body", (b) => b.innerText)).slice(0, 40).replace(/\s+/g, " "); } catch (e) { text = "(unreadable: " + e.message.slice(0, 40) + ")"; }
    results.push(text);
    await page.evaluate((u) => navigate(u, getTab()), SITE + "/");
    await h();
  }
  console.log(engine.padEnd(4), "after the service worker was stopped, clicking a link gave:", JSON.stringify(results));
  verdict[engine] = results.every((r) => r === "Page two");
  await ctx.close();
}
await browser.close();
// WillieJet has to recover every time; Scramjet v2 is only reported
console.log(verdict.wj ? "\n1 passed, 0 failed" : "\n0 passed, 1 failed (WillieJet didn't recover)");
process.exit(verdict.wj ? 0 : 1);
