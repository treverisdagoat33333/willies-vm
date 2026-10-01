/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// The Apps launcher (js/apps.js): its windows, every built-in tool, and websites
// opening through the proxy in a window of their own.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await (await browser.newContext({ baseURL: BASE, viewport: { width: 1366, height: 860 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto("/");
await p.click("#guest-button");
await p.waitForSelector("#auth-wrap.hidden", { state: "attached" });

await p.click("#tb-apps");
await p.waitForSelector('.aw[data-app="launcher"] .al-app');
const list = await p.evaluate(() => window.apps.list());
ok(list.tools.length >= 15 && list.web.length >= 15, `the launcher has ${list.tools.length} tools and ${list.web.length} websites`);
ok(await p.$$eval(".al-app", (a) => a.length) >= list.tools.length + list.web.length, "…all shown");
await p.fill(".al-q", "calc");
ok(await p.$$eval(".al-list .al-grid .al-app", (a) => a.every((x) => /calc/i.test(x.textContent))), "search narrows the list");
await p.press(".al-q", "Enter");
await p.waitForSelector('.aw[data-app="calc"]');
ok(true, "Enter opens the first match");

// the calculator
for (const k of ["(", "2", "+", "3", ")", "×", "4", "="]) await p.click(`.aw[data-app="calc"] [data-k="${k}"]`);
ok(await p.$eval(".calc-out", (i) => i.value) === "20", "the calculator does brackets", await p.$eval(".calc-out", (i) => i.value));

// every tool opens without throwing
for (const id of list.tools) {
  await p.evaluate((id) => window.apps.tool(id), id);
  await p.waitForTimeout(120);
}
ok(list.tools.every((id) => true) && (await p.evaluate(() => window.apps.windows())).length >= list.tools.length, "every tool opens a window");
ok(!(await p.$$eval(".aw-body", (b) => b.some((x) => /Couldn't open/.test(x.textContent)))), "…and none failed to build");

// notes save
await p.fill('.aw[data-app="notes"] .n-title', "Shopping");
await p.fill('.aw[data-app="notes"] .n-text', "milk, eggs");
await p.waitForTimeout(500);
ok(await p.evaluate(() => JSON.parse(localStorage.getItem("apps")).notes.some((n) => n.title === "Shopping" && n.text === "milk, eggs")), "notes save as you type");

// the converter and password maker
await p.selectOption('.aw[data-app="convert"] .cv-kind', "Temperature");
await p.fill('.aw[data-app="convert"] .cv-a', "100");
ok(await p.$eval('.aw[data-app="convert"] .cv-b', (i) => i.value) === "212", "100 °C is 212 °F");
ok(await p.$eval('.aw[data-app="password"] .pw-val', (i) => i.value.length) === 16, "a 16-character password");

// windows drag, maximize and close
const box = await p.$('.aw[data-app="snake"] .aw-bar');
const before = await p.$eval('.aw[data-app="snake"]', (e) => e.offsetLeft);
const bb = await box.boundingBox();
await p.mouse.move(bb.x + 60, bb.y + 15); await p.mouse.down(); await p.mouse.move(bb.x + 160, bb.y + 60, { steps: 5 }); await p.mouse.up();
ok(Math.abs((await p.$eval('.aw[data-app="snake"]', (e) => e.offsetLeft)) - before - 100) < 4, "windows drag by the title bar");
await p.click('.aw[data-app="snake"] .aw-max');
ok(await p.$eval('.aw[data-app="snake"]', (e) => e.classList.contains("max") && e.offsetWidth === innerWidth), "…maximize");
await p.click('.aw[data-app="snake"] .aw-x');
ok(!(await p.$('.aw[data-app="snake"]')), "…and close");

// a website in its own window, through the proxy
await p.evaluate(() => window.apps.web("youtube"));
await p.waitForSelector('.aw[data-app="web-youtube"] iframe.aw-frame');
await p.waitForFunction(() => /\/~\//.test(document.querySelector('.aw[data-app="web-youtube"] iframe').src), null, { timeout: 20000 }).catch(() => {});
const src = await p.$eval('.aw[data-app="web-youtube"] iframe', (f) => f.src);
ok(/\/~\/(wj|sj|sj1|uv)\//.test(src) && /youtube/.test(decodeURIComponent(src)), "YouTube opens through the proxy in its own window", src);
ok(await p.$eval("#browser-wrap", (b) => getComputedStyle(b).display === "none"), "…not in the browser app");

ok(!errors.length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
