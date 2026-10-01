/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Every way out: each full-screen app, panel and window opens, closes with its
// own close button (and stays closed), and opens again. A window once closed
// and reopened in the same click, because its data-app attribute launched it.
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
await p.evaluate(() => { if (typeof hideLauncher === "function") hideLauncher(); });
await p.waitForTimeout(600);

const shown = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const s = getComputedStyle(e); return s.display !== "none" && s.visibility !== "hidden" && !e.hidden && e.getClientRects().length > 0; }, sel);
const settle = () => p.waitForTimeout(700); // past every closing animation (500 ms at most)

/* the full-screen apps: open from the taskbar, close with their own button */
const APPS = [
  ["browser", "#tb-browser", "#browser-wrap", "#b-close"],
  ["movies", "#tb-movies", "#movies-wrap", "#mv-close"],
  ["music", "#tb-music", "#music-window", "#mu-close"],
  ["AI", "#tb-ai", "#ai-window", "#ai-close"],
  ["chat", "#tb-chat", "#chat-window", "#dc-close"],
  ["cloud", "#tb-cloud", "#cloud-wrap", "#cloud-close"],
];
for (const [name, open, wrap, close] of APPS) {
  await p.click(open);
  await settle();
  const was = await shown(wrap);
  await p.click(close);
  await settle();
  const after = await shown(wrap);
  await p.click(open);
  await settle();
  const again = await shown(wrap);
  ok(was && !after && again, `${name}: opens, closes, opens again`, JSON.stringify({ was, after, again }));
  await p.click(close);
  await settle();
}

/* the VM (its Close asks first) and Remote PC */
p.on("dialog", (d) => d.accept());
await p.evaluate(() => openVM(location.origin + "/manifest.webmanifest", "Test VM"));
await settle();
const vmWas = await shown("#vm-wrap");
await p.click("#vm-close");
await settle();
ok(vmWas && !(await shown("#vm-wrap")) && !(await p.$eval("#tb-vm", (b) => b.classList.contains("active"))), "the VM closes after its confirm");
await p.evaluate(() => openVM(location.origin + "/manifest.webmanifest", "Test VM"));
await settle();
await p.click('#vm-wrap [data-minimize="vm"]');
await p.evaluate(() => closeVM(true)); // its time ran out while minimized
await settle();
ok(!(await p.$eval("#tb-vm", (b) => b.classList.contains("minimized"))), "…and a VM that ends while minimized leaves no dot on the taskbar");
await p.click("#tb-remote");
await settle();
const rWas = await shown("#remote-wrap");
await p.click("#remote-close");
await settle();
ok(rWas && !(await shown("#remote-wrap")), "Remote PC closes");

/* the launcher window */
await p.click("#tb-home");
await settle();
const homeOpen = await shown("#main-window");
await p.click("#btn-close");
await settle();
ok(homeOpen && !(await shown("#main-window")), "the launcher window closes with its ✕");
await p.click("#tb-home");
await settle();
await p.click("#btn-minimize");
await settle();
ok(!(await shown("#main-window")), "…and minimizes");

/* panels: their Close button, and Escape */
for (const id of ["settings-panel", "links-panel", "history-panel", "games-panel"]) {
  await p.evaluate((id) => openPanel(id), id);
  await settle();
  const was = await shown("#" + id);
  await p.click(`[data-close="${id}"]`);
  await settle();
  ok(was && !(await shown("#" + id)), `${id} closes with its Close button`);
}
await p.evaluate(() => openPanel("settings-panel"));
await settle();
await p.keyboard.press("Escape");
await settle();
ok(!(await shown("#settings-panel")), "Escape closes a panel");

/* app windows: the Arcade, the Apps launcher, a tool, a game, a website */
const winClose = async (label, opener, id) => {
  await opener();
  await p.waitForSelector(`.aw[data-win="${id}"]`, { timeout: 10000 });
  await p.click(`.aw[data-win="${id}"] .aw-x`);
  await settle();
  const gone = !(await p.$(`.aw[data-win="${id}"]`));
  ok(gone, `${label} window closes with its ✕`);
};
await winClose("the Arcade", () => p.click("#tb-games"), "arcade");
await winClose("the Apps launcher", () => p.click("#tb-apps"), "launcher");
await winClose("a tool (calculator)", () => p.evaluate(() => window.apps.tool("calc")), "calc");
await winClose("a game", () => p.evaluate(() => window.arcade.play("cl2048")), "arcade:cl2048");
await winClose("a website (YouTube)", () => p.evaluate(() => window.apps.web("youtube")), "web-youtube");
// clicking inside a window must not open anything either
await p.click("#tb-games");
await p.waitForSelector('.aw[data-win="arcade"] .ar-q');
await p.click('.aw[data-win="arcade"] .ar-head');
await p.click('.aw[data-win="arcade"] .aw-x');
await settle();
ok(!(await p.$('.aw[data-win="arcade"]')), "a click inside the Arcade doesn't stop it closing");
// a minimized window can still be closed after it comes back
await p.evaluate(() => window.apps.tool("notes"));
await p.click('.aw[data-win="notes"] .aw-min');
await p.click('#tb-min .tb-chip[data-win="notes"]');
await p.click('.aw[data-win="notes"] .aw-x');
await settle();
ok(!(await p.$('.aw[data-win="notes"]')) && !(await p.$("#tb-min .tb-chip")), "a window that was minimized closes, and leaves no chip behind");

/* the start menu closes on a click elsewhere */
await p.click("#tb-start");
await settle();
const startOpen = await p.$eval("#start", (s) => s.classList.contains("show"));
await p.mouse.click(700, 300);
await settle();
ok(startOpen && !(await p.$eval("#start", (s) => s.classList.contains("show"))), "the start menu closes on a click elsewhere");

/* a dialog closes with Cancel */
await p.evaluate(() => dcModal({ title: "Test", fields: [], onOk: () => {} }));
await settle();
const modal = await p.$eval("#dc-modal", (m) => m.classList.contains("show"));
await p.keyboard.press("Escape");
await settle();
ok(modal && !(await p.$eval("#dc-modal", (m) => m.classList.contains("show"))), "a dialog closes with Escape");

ok(!errors.length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
