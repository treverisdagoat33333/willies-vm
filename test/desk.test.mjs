/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// The desktop (js/desk.js): theme presets, live wallpapers, widgets, a to-do
// list, and icons and widgets you can drag, all kept in "desk" / settings.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1366, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("/");
await page.click("#guest-button");
await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });
await page.evaluate(() => document.getElementById("btn-close")?.click());
const desk = () => page.evaluate(() => JSON.parse(localStorage.getItem("desk") || "{}"));

// presets and live wallpapers
await page.evaluate(() => openSettings());
await page.waitForSelector("#presets .preset");
ok(await page.$$eval("#presets .preset", (x) => x.length) >= 8 && await page.$eval('#presets [data-preset="default"]', (b) => b.classList.contains("on")), "Settings shows the theme presets, with the current one marked");
await page.click('#presets [data-preset="synth"]');
let st = await page.evaluate(() => ({ wall: S.wallpaper, accent: S.accent, live: document.getElementById("bg-live").dataset.live, anim: getComputedStyle(document.getElementById("bg-live"), "::before").animationName, on: document.querySelector('#presets [data-preset="synth"]').classList.contains("on") }));
ok(st.wall === "live-synth" && st.accent === "#ff2e97" && st.on, "a preset sets the colours and wallpaper in one click", JSON.stringify(st));
ok(st.live === "synth" && /lvSun/.test(st.anim), "…and the live wallpaper animates", JSON.stringify(st));
ok(await page.$$eval("#walls .wall.live", (x) => x.length) === 6, "the wallpaper picker has the live ones, marked");
await page.evaluate(() => set("motion", true));
ok(await page.evaluate(() => getComputedStyle(document.getElementById("bg-live"), "::before").animationPlayState) === "paused", "…which stand still with motion turned off");
await page.evaluate(() => { set("motion", false); closeAllPanels(); });

// widgets
ok(await page.$eval(".wd-clock", (w) => !w.hidden && /\d:\d\d/.test(w.textContent)), "the clock widget is on by default");
ok(await page.$eval(".wd-music", (w) => w.hidden), "…and now playing hides while nothing plays");
await page.evaluate(() => set("wTodo", true));
await page.waitForSelector(".wd-todo:not([hidden])");
await page.fill(".wt-add input", "study for the test");
await page.press(".wt-add input", "Enter");
await page.fill(".wt-add input", "walk the dog");
await page.press(".wt-add input", "Enter");
await page.check('.wd-todo [data-td="0"]');
let d = await desk();
ok(d.todos?.length === 2 && d.todos[0].done && !d.todos[1].done && /1 left/.test(await page.textContent(".wd-todo")), "the to-do widget adds and ticks off tasks, and keeps them", JSON.stringify(d.todos));
await page.click(".wt-clear");
ok((await desk()).todos.length === 1, "…and clears the done ones");
// dragging a widget moves it and remembers where
const w = await page.$(".wd-clock"), wb = await w.boundingBox();
await page.mouse.move(wb.x + 30, wb.y + 20); await page.mouse.down(); await page.mouse.move(wb.x - 300, wb.y + 220, { steps: 8 }); await page.mouse.up();
d = await desk();
ok(d.widgets?.clock && Math.abs((await w.boundingBox()).x - (wb.x - 330 + 30)) < 40, "widgets can be dragged, and remember where", JSON.stringify(d.widgets));

// icons
const ic = await page.$('#icons .dicon[data-app="games"]'), ib = await ic.boundingBox();
await page.mouse.move(ib.x + 40, ib.y + 40); await page.mouse.down(); await page.mouse.move(ib.x + 500, ib.y + 300, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(300);
d = await desk();
const nb = await ic.boundingBox(), spot = await ic.evaluate((e) => e.style.left + "," + e.style.top);
ok(d.icons?.games && nb.x > ib.x + 300 && await page.$eval("#icons", (e) => e.classList.contains("free")), "desktop icons can be dragged, snapping to a spot that's remembered", JSON.stringify(d.icons?.games));
ok(!(await page.evaluate(() => document.getElementById("games-panel")?.classList.contains("show"))), "…and a drag doesn't open the app");
await page.click('#icons .dicon[data-app="games"]');
ok(await page.waitForFunction(() => document.getElementById("games-panel")?.classList.contains("show"), null, { timeout: 5000 }).then(() => true, () => false), "…while a click still does");
await page.evaluate(() => closeAllPanels());
// it all survives a reload
await page.reload();
await page.waitForSelector(".wd-todo:not([hidden])");
// (compare where it's placed, not its box: the hover effect nudges an icon under the mouse)
const after = { spot: await page.$eval('#icons .dicon[data-app="games"]', (e) => e.style.left + "," + e.style.top), before: spot, wall: await page.evaluate(() => S.wallpaper) };
ok(after.spot === after.before && after.wall === "live-synth", "after a reload, the layout and theme are the same", JSON.stringify(after));
await page.evaluate(() => openSettings());
await page.evaluate(() => document.querySelector('.spage[data-page="desktop"]') && document.querySelector('[data-page="desktop"]').click());
await page.click("#desk-reset");
d = await desk();
ok(!Object.keys(d.icons).length && !Object.keys(d.widgets).length && !(await page.$eval("#icons", (e) => e.classList.contains("free"))), "Reset layout puts everything back");

ok(!errors.length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
