/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// "Come back tomorrow": visit the bench page, quit the browser completely, relaunch, visit again.
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const BASE = process.env.BASE, SITE = process.env.SITE, SP = fs.mkdtempSync(path.join(os.tmpdir(), "wj-profiles-"));
const ENGINES = (process.env.ENGINES || "sj2,wj").split(",");
const ROUNDS = +process.env.ROUNDS || 1;
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
async function session(dir, engine, first) {
  const ctx = await chromium.launchPersistentContext(dir, { executablePath: process.env.CHROMIUM_PATH || undefined, baseURL: BASE });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto("/");
  if (first) { await page.click("#guest-button"); await page.waitForSelector("#auth-wrap.hidden", { state: "attached" }); }
  else await page.waitForSelector("#auth-wrap.hidden", { state: "attached", timeout: 15000 });
  await page.evaluate((e) => { S.proxy = e; save(); }, engine);
  await page.evaluate((u) => openBrowser(u), SITE + "/");
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async (url) => {
    const t0 = performance.now();
    await navigate(url, getTab());
    const t = getTab();
    for (;;) {
      let ok = null; try { ok = t.frame.contentDocument?.getElementById("done")?.textContent; } catch (_) {}
      if (ok) return { ms: Math.round(performance.now() - t0), ran: ok };
      if (performance.now() - t0 > 60000) return { ms: -1, ran: "timeout" };
      await new Promise((r) => setTimeout(r, 5));
    }
  }, SITE + "/bench/");
  r.stats = engine === "wj" ? await page.evaluate(() => proxies.wj.then((e) => e.stats())) : null;
  await ctx.close();
  return r;
}
const out = {};
for (const engine of ENGINES) {
  out[engine] = { day1: [], day2: [], ran: new Set(), rw: [] };
  for (let i = 0; i < ROUNDS; i++) {
    const dir = `${SP}/profile-${engine}-${Date.now()}-${i}`;
    const a = await session(dir, engine, true);
    const b = await session(dir, engine, false);
    out[engine].day1.push(a.ms); out[engine].day2.push(b.ms);
    out[engine].ran.add(a.ran); out[engine].ran.add(b.ran);
    if (b.stats) out[engine].rw.push(`${b.stats.rewrites?.hits ?? "no"} rewrites reused, ${b.stats.http.hits} files from cache`);
    if (b.stats) out[engine].reused = (b.stats.rewrites?.hits ?? 0) >= 40 && b.ran === "12000";
  }
}
console.log("engine  first ever   next session (browser restarted)");
for (const [e, r] of Object.entries(out)) {
  console.log(`${e.padEnd(7)} ${String(median(r.day1)).padStart(8)}ms  ${String(median(r.day2)).padStart(12)}ms   scripts ran: ${[...r.ran].join(",")}`);
  console.log(`        raw day1=${r.day1} day2=${r.day2} ${r.rw.length ? "| " + r.rw[0] : ""}`);
}
fs.rmSync(SP, { recursive: true, force: true });
// WillieJet must reuse every rewritten script and style in the next session
console.log(out.wj?.reused ? "\n1 passed, 0 failed" : "\n0 passed, 1 failed (WillieJet didn't reuse its rewrites)");
process.exit(out.wj?.reused ? 0 : 1);
