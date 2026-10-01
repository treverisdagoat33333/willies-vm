/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// The Apps launcher (js/apps.js): its windows, every built-in tool, and websites
// opening through the proxy in a window of their own.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
// two pretend games in public/games/: a folder with a cover and game.json, and a single file
const GDIR = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "public", "games");
const made = [path.join(GDIR, "zz-test-folder"), path.join(GDIR, "zz-test-single.html")];
fs.mkdirSync(made[0], { recursive: true });
fs.writeFileSync(path.join(made[0], "index.html"), "<!doctype html><title>Ignored title</title><canvas id=c></canvas><script>window.ready=1</script>");
fs.writeFileSync(path.join(made[0], "game.json"), JSON.stringify({ title: "Test Racer", description: "Vroom" }));
fs.writeFileSync(path.join(made[0], "cover.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
fs.writeFileSync(made[1], "<!doctype html><title>Single File Game</title><p>hi</p>");
process.on("exit", () => made.forEach((f) => fs.rmSync(f, { recursive: true, force: true })));
const glist = (await (await fetch(BASE + "/api/games/local")).json()).games;
const racer = glist.find((g) => g.id === "zz-test-folder"), single = glist.find((g) => g.id === "zz-test-single.html");
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

// minimize: a tool window waits on the taskbar
await p.evaluate(() => window.apps.tool("notes"));
await p.click('.aw[data-app="notes"] .aw-min');
ok(await p.$eval('.aw[data-app="notes"]', (e) => e.hidden) && await p.$('#tb-min .tb-chip[data-win="notes"]'), "a window minimizes to the taskbar");
await p.click('#tb-min .tb-chip[data-win="notes"]');
ok(await p.$eval('.aw[data-app="notes"]', (e) => !e.hidden) && !(await p.$('#tb-min .tb-chip')), "…and comes back from it");
// the big apps minimize too, and keep what they had
await p.click("#tb-movies");
await p.waitForTimeout(400);
await p.click('#movies-wrap [data-minimize="movies"]');
ok(await p.$eval("#movies-wrap", (e) => getComputedStyle(e).display === "none") && await p.$eval("#tb-movies", (b) => b.classList.contains("minimized")), "Movies minimizes, with a dot on its taskbar button");
await p.click("#tb-movies");
ok(await p.$eval("#movies-wrap", (e) => getComputedStyle(e).display !== "none"), "…and its button brings it back");
ok(await p.$$eval("[data-minimize]", (b) => b.length) === 8, "every full-screen app has a minimize button");
// the launcher's window buttons (a tool's class name once squashed them)
await p.evaluate(() => window.apps.tool("clock"));
const wc = await p.$eval("#main-window .wc", (e) => ({ dir: getComputedStyle(e).flexDirection, n: [...e.children].filter((b) => b.offsetWidth).length }));
ok(wc.dir === "row" && wc.n === 3, "the launcher keeps its minimize, maximize and close buttons in a row", JSON.stringify(wc));
await p.evaluate(() => showLauncher());
await p.$eval("#btn-close", (b) => b.click());
await p.waitForTimeout(500);
ok(await p.$eval("#main-window", (e) => getComputedStyle(e).display === "none"), "…and its close button closes it");

// your own games
ok(racer?.title === "Test Racer" && racer.cover === "/games/zz-test-folder/cover.png" && racer.url === "/games/zz-test-folder/index.html", "a game folder is found, titled from game.json, with its cover", JSON.stringify(racer));
ok(single?.title === "Single File Game" && !glist.some((g) => g.id === "README.md"), "a single-file game is titled from its <title>, and other files are skipped", JSON.stringify(single));
ok((await fetch(BASE + racer.url)).headers.get("cross-origin-embedder-policy") === "credentialless", "games may load files from other sites");
await p.evaluate(() => closeAllPanels?.());
await p.click("#tb-games");
await p.evaluate(() => window.apps.windows().forEach((w) => window.apps.close(w)));
await p.waitForSelector("#my-games .my-game", { timeout: 5000 }).catch(() => {});
ok(await p.$$eval("#my-games .my-game", (c) => c.map((x) => x.textContent)).then((t) => t.some((x) => x.includes("Test Racer")) && t.some((x) => x.includes("Single File Game"))), "the Games panel lists them under My games");
await p.click('#my-games .my-game[data-game="zz-test-folder"]');
await p.waitForSelector('.aw[data-app="game:zz-test-folder"] iframe');
await p.waitForFunction(() => document.querySelector('.aw[data-app="game:zz-test-folder"] iframe').contentWindow?.ready === 1, null, { timeout: 5000 }).catch(() => {});
ok(await p.$eval('.aw[data-app="game:zz-test-folder"] iframe', (f) => f.contentWindow.ready === 1 && !f.src.includes("/~/")), "clicking one plays it in its own window, not through the browser");
ok(await p.$eval('.aw[data-app="game:zz-test-folder"] .aw-ic img', (i) => i.src.endsWith("/cover.png")), "…with its cover as the window's icon");

// the Arcade
ok((await fetch(BASE + "/play/arcade/cladvancewars")).status === 404 && (await fetch(BASE + "/play/arcade/..%2F..%2Fserver")).status === 404, "the Arcade serves only games on its list (no console ROMs)");
const ar = await fetch(BASE + "/play/arcade/cl2048");
ok(ar.headers.get("content-type").startsWith("text/html") && ar.headers.get("cross-origin-embedder-policy") === "credentialless" && (await ar.text()).includes("arcadeSave"), "a game comes back as a page, with the storage shim");
await p.evaluate(() => { closeAllPanels(); window.apps.windows().forEach((w) => window.apps.close(w)); });
await p.click("#tb-games");
await p.click(".ar-banner");
await p.waitForSelector('.aw[data-app="arcade"] .ar-card');
const total = await p.evaluate(() => window.arcade.list().then((l) => l.length));
ok(total > 1500 && await p.$$eval(".ar-card", (c) => c.length) === 72, `the Arcade lists ${total} games, 72 at a time`);
await p.evaluate(() => { const b = document.querySelector('.aw[data-app="arcade"] .aw-body'); b.scrollTop = b.scrollHeight; });
await p.waitForTimeout(400);
ok(await p.$$eval(".ar-card", (c) => c.length) === 144, "…and more as you scroll");
await p.click('.ar-cats [data-c="Racing"]');
ok(await p.$$eval(".ar-card small", (c) => c.every((x) => x.textContent.startsWith("Racing"))), "a category shows only its games");
await p.click('.ar-cats [data-c="All"]');
await p.fill(".ar-q", "2048");
await p.waitForTimeout(300);
ok(await p.$$eval(".ar-card b", (c) => c.length >= 1 && c.every((x) => /2048/.test(x.textContent))), "search finds games by name");
await p.hover('.ar-card[data-f="cl2048"]');
await p.click('.ar-card[data-f="cl2048"] .ar-star');
await p.click('.ar-cats [data-c="Favourites"]');
ok(await p.$$eval(".ar-card", (c) => c.map((x) => x.dataset.f).join()) === "cl2048", "the star adds it to Favourites");
await p.click('.ar-card[data-f="cl2048"]');
await p.waitForSelector('.aw[data-app="arcade:cl2048"] iframe');
const gameFrame = async () => { for (let i = 0; i < 40; i++) { const f = p.frames().filter((x) => x.url().includes("/play/arcade/cl2048")).at(-1); const r = f && await f.evaluate(() => window.report).catch(() => null); if (r) return r; await p.waitForTimeout(150); } return null; };
const r1 = await gameFrame();
ok(r1?.plays === 1 && r1.origin === "null" && !r1.parentReadable, "a game plays in its own window, sandboxed: no access to our page", JSON.stringify(r1));
await p.waitForTimeout(700);
await p.click('.aw[data-app="arcade:cl2048"] .aw-x');
await p.evaluate(() => window.arcade.play("cl2048"));
await p.waitForTimeout(500);
const r2 = await gameFrame();
ok(r2?.plays === 2, "its saves are kept for next time", JSON.stringify(r2));
await p.click('.ar-cats [data-c="Recent"]');
ok(await p.$$eval(".ar-card", (c) => c[0]?.dataset.f) === "cl2048", "…and it's in Recently played");

ok(!errors.length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
