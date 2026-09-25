/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Times the /bench/ page on each engine: first visit, repeat in the same tab, repeat in a new tab.
// Also sums main-thread long tasks (>50ms) in the desktop page during each load.
import { chromium } from "playwright";
const BASE = process.env.BASE, SITE = process.env.SITE;
const ENGINES = (process.env.ENGINES || "sj2,wj").split(",");
const ROUNDS = +process.env.ROUNDS || 3;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const results = {};
async function timed(page, how) {
  return page.evaluate(async ({ url, how }) => {
    window.__lt = window.__lt || (() => { const s = { total: 0 }; new PerformanceObserver((l) => l.getEntries().forEach((e) => (s.total += e.duration))).observe({ type: "longtask" }); return s; })();
    const lt0 = window.__lt.total, t0 = performance.now();
    if (how === "new") await newTab(url); else await navigate(url, getTab());
    const t = getTab();
    for (;;) {
      let ok = null;
      try { ok = t.frame.contentDocument?.getElementById("done")?.textContent; } catch (_) {}
      if (ok) return { ms: Math.round(performance.now() - t0), blocked: Math.round(window.__lt.total - lt0), ran: ok };
      if (performance.now() - t0 > 60000) return { ms: -1, blocked: 0, ran: "timeout" };
      await new Promise((r) => setTimeout(r, 5));
    }
  }, { url: SITE + "/bench/", how });
}
for (const engine of ENGINES) {
  results[engine] = { first: [], again: [], newtab: [], later: [], blockedFirst: [], ran: new Set() };
  for (let r = 0; r < ROUNDS; r++) {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.click("#guest-button");
    await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });
    await page.evaluate((e) => { S.proxy = e; }, engine);
    await page.evaluate((u) => openBrowser(u), SITE + "/");
    await page.waitForTimeout(1500);
    const a = await timed(page, "same");
    await page.evaluate((u) => navigate(u, getTab()), SITE + "/");
    await page.waitForTimeout(800);
    const b = await timed(page, "same");
    const c = await timed(page, "new");
    // come back later: the desktop reloads (engine restarts); only what's on disk helps
    await page.reload();
    await page.waitForFunction(() => typeof openBrowser === "function");
    await page.evaluate((e) => { S.proxy = e; }, engine);
    await page.evaluate((u) => openBrowser(u), SITE + "/");
    await page.waitForTimeout(1500);
    const d = await timed(page, "same");
    results[engine].later.push(d.ms);
    results[engine].first.push(a.ms); results[engine].blockedFirst.push(a.blocked);
    results[engine].again.push(b.ms); results[engine].newtab.push(c.ms);
    [a, b, c].forEach((x) => results[engine].ran.add(x.ran));
    await ctx.close();
  }
}
await browser.close();
console.log("engine  first-visit  repeat(same tab)  repeat(new tab)  after desktop reload  main-thread blocked (first)  scripts ran");
for (const [e, r] of Object.entries(results)) {
  console.log(`${e.padEnd(7)} ${String(median(r.first)).padStart(8)}ms  ${String(median(r.again)).padStart(12)}ms  ${String(median(r.newtab)).padStart(12)}ms  ${String(median(r.later)).padStart(16)}ms  ${String(median(r.blockedFirst)).padStart(18)}ms  ${[...r.ran].join(",")}`);
  console.log(`        raw first=${r.first} again=${r.again} newtab=${r.newtab} later=${r.later} blocked=${r.blockedFirst}`);
}
