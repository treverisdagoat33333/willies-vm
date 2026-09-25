/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Runs the /t/* pages of the test site on each engine and prints a table.
import { chromium } from "playwright";
const BASE = process.env.BASE, SITE = process.env.SITE;
const ENGINES = (process.env.ENGINES || "sj2,wj,sj1,uv").split(",");
const H = new URL(SITE).host;
const TESTS = {
  iframe: (r) => r.blank === "written" && r.child === "child ok" && r.childHost === H,
  worker: (r) => r.worker === "fetched:" + H,
  form: (r) => r.method === "POST" && r.body === "who=william&n=42",
  redirect: (r) => r.landed === "/t/landed",
  jscookie: (r) => r.read === true && r.sent === true,
  storage: (r) => r.ls === "v" && r.host === H && r.origin === "http://" + H && r.url === `http://${H}/x`,
  dynamic: (r) => r.mod === "module ok" && r.dyn === "dyn ok",
  xhr: (r) => /^200 /.test(r.xhr || ""),
  sse: (r) => r.sse === "one,two",
  big: (r) => r.big === 20000,
};
const FINAL_TITLE = { form: "echo", redirect: "landed" }; // tests that end on another page
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const table = {};
for (const engine of ENGINES) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.click("#guest-button");
  await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });
  await page.evaluate((e) => { S.proxy = e; }, engine);
  await page.evaluate((u) => openBrowser(u), SITE + "/");
  await page.waitForTimeout(1500);
  table[engine] = {};
  for (const [name, check] of Object.entries(TESTS)) {
    const t0 = Date.now();
    await page.evaluate((u) => navigate(u, getTab()), `${SITE}/t/${name}`);
    let result = null, raw = null;
    for (let i = 0; i < 80; i++) {
      await page.waitForTimeout(150);
      try {
        const f = await (await page.$("#browser-frames iframe.active")).contentFrame();
        if ((await f.title()) !== (FINAL_TITLE[name] || name)) continue; // still the previous page
        raw = await f.$eval("#r", (e) => e.textContent);
        if (raw && raw !== "waiting") { result = JSON.parse(raw); break; }
      } catch (_) {}
    }
    const pass = !!result && check(result);
    table[engine][name] = pass ? `ok ${Date.now() - t0}ms` : `FAIL ${raw ? raw.slice(0, 80) : "(no result)"}`;
  }
  table[engine].errors = errors.length;
  await ctx.close();
}
await browser.close();
const names = [...Object.keys(TESTS), "errors"];
console.log("test".padEnd(10) + ENGINES.map((e) => e.padEnd(26)).join(""));
for (const n of names) console.log(n.padEnd(10) + ENGINES.map((e) => String(table[e][n]).slice(0, 25).padEnd(26)).join(""));
for (const e of ENGINES) for (const n of names) if (String(table[e][n]).startsWith("FAIL")) console.log(`${e} ${n}: ${table[e][n]}`);
// WillieJet has to pass everything; the others are reported, not judged
const wjFails = Object.keys(TESTS).filter((n) => !String(table.wj?.[n]).startsWith("ok"));
console.log(wjFails.length ? `\n0 passed, 1 failed (WillieJet failed: ${wjFails.join(", ")})` : "\n1 passed, 0 failed");
process.exit(wjFails.length ? 1 : 0);
