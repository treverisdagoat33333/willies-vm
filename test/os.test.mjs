/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Willie OS: window snapping, desktops, theme codes, profile pages, Files (each
// account's cloud storage) and the owner's live dashboard.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const stamp = Date.now().toString(36).slice(-5);
async function person(name, password) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  if (name) {
    await page.evaluate(async ({ name, password }) => {
      const r = await fetch(password ? "/api/auth/login" : "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: password || "password123" }) });
      if (!r.ok) throw new Error(await r.text());
    }, { name, password });
    await page.reload();
    await page.waitForFunction(() => typeof currentRole !== "undefined" && currentRole !== "guest", null, { timeout: 10000 });
  } else {
    await page.click("#guest-button");
    await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });
  }
  return { ctx, page, errors, name };
}
const a = await person("osann" + stamp), b = await person("osbob" + stamp);
const p = a.page;

/* ---- the black look ---- */
ok(await p.evaluate(() => S.theme === "oled" && S.wallpaper === "black" && document.title === "Willie OS"), "Willie OS starts black", await p.evaluate(() => [S.theme, S.wallpaper, document.title].join()));

/* ---- snapping ---- */
await p.evaluate(() => window.apps.tool("notes"));
await p.waitForSelector('.aw[data-win="notes"]');
const bar = await p.$('.aw[data-win="notes"] .aw-bar b');
const bb = await bar.boundingBox();
await p.mouse.move(bb.x + 5, bb.y + 5); await p.mouse.down();
await p.mouse.move(400, 300, { steps: 4 }); await p.mouse.move(2, 400, { steps: 6 });
ok(await p.evaluate(() => document.querySelector("#aw-snap")?.classList.contains("on")), "dragging to the left edge shows where it will land");
await p.mouse.up();
let r = await p.$eval('.aw[data-win="notes"]', (el) => ({ x: el.offsetLeft, w: el.offsetWidth, h: el.offsetHeight, snap: el.dataset.snap }));
ok(r.snap === "l" && r.x === 0 && Math.abs(r.w - 640) <= 2, "…and letting go fills the left half", JSON.stringify(r));
await p.evaluate(() => window.apps.snap("notes", "br"));
r = await p.$eval('.aw[data-win="notes"]', (el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth }));
ok(r.x === 640 && r.w === 640 && r.y > 300, "corners give a quarter", JSON.stringify(r));
await p.keyboard.press("Control+Alt+ArrowUp");
ok(await p.$eval('.aw[data-win="notes"]', (el) => el.classList.contains("max")), "Ctrl+Alt+Up maximizes the window in front");
await p.keyboard.press("Control+Alt+ArrowDown");

/* ---- desktops ---- */
ok(await p.isVisible("#tb-desks") && await p.$$eval("#tb-desks .tb-desk:not(.add)", (x) => x.length) === 2, "the taskbar shows the desktops");
await p.click('#tb-desks [data-desk="2"]');
ok(await p.evaluate(() => window.apps.desk()) === 2 && !(await p.isVisible('.aw[data-win="notes"]')), "switching desktops hides the other desktop's windows");
await p.evaluate(() => window.apps.tool("calc"));
await p.keyboard.press("Control+Alt+1");
ok(await p.isVisible('.aw[data-win="notes"]') && !(await p.isVisible('.aw[data-win="calc"]')), "Ctrl+Alt+1 goes back, each desktop keeping its own windows");
await p.click('.aw[data-win="notes"] .aw-desk');
await p.click('#aw-desk-pop button[data-n="2"]');
ok(!(await p.isVisible('.aw[data-win="notes"]')) && await p.$eval('.aw[data-win="notes"]', (el) => el.dataset.desk) === "2", "a window can move to another desktop");
await p.evaluate(() => window.apps.switchDesk(2));
await p.evaluate(() => { window.apps.close?.("notes"); });

/* ---- theme codes ---- */
await p.evaluate(() => openSettings());
await p.evaluate(() => window.desk.applyPreset("sakura"));
const code = await p.evaluate(() => window.desk.themeCode());
ok(/^WOS1-[A-Za-z0-9_-]+$/.test(code), "Share my theme makes a code", code.slice(0, 30));
await b.page.evaluate(() => openSettings());
await b.page.fill("#theme-code", code);
await b.page.click("#theme-use");
ok(await b.page.evaluate(() => S.wallpaper) === await p.evaluate(() => S.wallpaper) && await b.page.evaluate(() => S.accent) === await p.evaluate(() => S.accent), "…which gives a friend the same look");
const evil = "WOS1-" + Buffer.from(JSON.stringify({ wallpaper: "custom", homepage: "https://evil.example", proxy: "uv", accent: "red" })).toString("base64url");
const before = await b.page.evaluate(() => JSON.stringify({ h: S.homepage, p: S.proxy, a: S.accent }));
await b.page.fill("#theme-code", evil);
await b.page.click("#theme-use");
ok(await b.page.evaluate(() => JSON.stringify({ h: S.homepage, p: S.proxy, a: S.accent })) === before, "a code can only change the look, with checked values");
await p.evaluate(() => window.desk.applyPreset("black"));

/* ---- profile pages ---- */
await p.evaluate(() => openChat());
await p.waitForFunction(() => chatReady, null, { timeout: 10000 });
await p.evaluate(() => { document.querySelector("#dc-me-edit").click(); });
await p.fill("#dcf-bio", "Hello from Willie OS");
await p.click(".cx-swatch >> nth=3");
await p.click("#dc-modal-ok");
await b.page.evaluate(() => openChat());
await b.page.waitForFunction(() => chatReady, null, { timeout: 10000 });
await b.page.evaluate((n) => window.chatx.profile(n), a.name);
ok(await b.page.waitForFunction(() => /Hello from Willie OS/.test(document.querySelector(".cx-pf-bio")?.textContent || ""), null, { timeout: 8000 }).then(() => true, () => false), "View profile shows someone's page with their bio");
const pf = await b.page.evaluate(() => ({ banner: getComputedStyle(document.querySelector(".cx-pf-banner")).backgroundImage, badges: [...document.querySelectorAll(".cx-badge")].map((x) => x.textContent), btns: [...document.querySelectorAll(".cx-pf-btns button")].map((x) => x.textContent) }));
ok(/gradient/.test(pf.banner) && pf.badges.some((x) => /Newcomer/.test(x)) && pf.badges.some((x) => /Storyteller/.test(x)), "…their banner and badges", JSON.stringify(pf));
ok(pf.btns.includes("Message") && pf.btns.includes("Call"), "…and buttons to message or call them");
await b.page.keyboard.press("Escape");

/* ---- Files ---- */
await p.evaluate(() => window.apps.tool("files"));
await p.waitForSelector('.aw[data-win="files"] .fx-grid');
await p.setInputFiles('.aw[data-win="files"] .fx-file', [{ name: "hello.txt", mimeType: "text/plain", buffer: Buffer.from("hi there from files") }, { name: "page.html", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") }]);
ok(await p.waitForFunction(() => document.querySelectorAll('.aw[data-win="files"] .fx-it').length === 2, null, { timeout: 8000 }).then(() => true, () => false), "Files uploads and lists them");
await p.click('.aw[data-win="files"] .fx-it:has-text("hello.txt") .fx-thumb');
ok(await p.waitForFunction(() => /hi there from files/.test(document.querySelector('.aw[data-win="files"] .fx-view-body pre')?.textContent || ""), null, { timeout: 5000 }).then(() => true, () => false), "…opens a text file in place");
await p.click('.aw[data-win="files"] .fx-vx');
const list = await p.evaluate(() => fetch("/api/drive").then((r) => r.json()));
const html = list.files.find((f) => f.name === "page.html");
const hh = await p.evaluate(async (id) => { const r = await fetch("/api/drive/" + id); return { t: r.headers.get("content-type"), csp: r.headers.get("content-security-policy"), d: r.headers.get("content-disposition") }; }, html.id);
ok(/text\/plain/.test(hh.t) && /sandbox/.test(hh.csp), "an uploaded web page is never served as one", JSON.stringify(hh));
const theirs = await b.page.evaluate(async (id) => (await fetch("/api/drive/" + id)).status, html.id);
ok(theirs === 404 && (await b.page.evaluate(() => fetch("/api/drive").then((r) => r.json()))).files.length === 0, "nobody else can see your files", theirs);
p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "School" : undefined));
await p.click('.aw[data-win="files"] .fx-mk');
await p.waitForFunction(() => /School/.test(document.querySelector('.aw[data-win="files"] .fx-crumbs')?.textContent || ""), null, { timeout: 5000 }).catch(() => {});
await p.setInputFiles('.aw[data-win="files"] .fx-file', { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("folder file") });
await p.waitForTimeout(800);
const lst2 = await p.evaluate(() => fetch("/api/drive").then((r) => r.json()));
ok(lst2.folders.includes("/School") && lst2.files.some((f) => f.name === "notes.txt" && f.folder === "/School"), "folders hold files", JSON.stringify(lst2.folders));
await p.click('.aw[data-win="files"] .fx-crumbs button[data-p="/"]');
await p.click('.aw[data-win="files"] .fx-it:has-text("hello.txt") .fx-del');
ok(await p.waitForFunction(() => ![...document.querySelectorAll('.aw[data-win="files"] .fx-it b')].some((b) => b.textContent === "hello.txt"), null, { timeout: 5000 }).then(() => true, () => false), "deleting a file removes it");
const g = await person(null);
await g.page.evaluate(() => window.apps.tool("files"));
ok(/Make an account/.test(await g.page.textContent('.aw[data-win="files"]')), "guests are asked to make an account");

/* ---- the owner's live dashboard ---- */
const own = await person("testowner", "test-owner-pass");
ok((await g.page.evaluate(() => fetch("/api/admin/live").then((r) => r.status))) === 403, "the live stream is the owner's only");
await b.page.evaluate(() => window.ai.open());
await b.page.evaluate(() => liveBeat(true));
await own.page.evaluate(() => openAdmin());
ok(await own.page.waitForFunction((n) => [...document.querySelectorAll("#ad-live-list .ad-lv")].some((r) => r.textContent.includes(n) && /AI/.test(r.textContent)), b.name, { timeout: 8000 }).then(() => true, () => false), "Live now shows who's here and which app they're in");
await g.page.evaluate(() => fetch("/api/stats/error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "js", msg: "live test problem " + Date.now(), place: "test" }) }));
ok(await own.page.waitForFunction(() => /live test problem/.test(document.querySelector("#ad-live-errs")?.textContent || ""), null, { timeout: 6000 }).then(() => true, () => false), "…and a problem shows the moment it happens");

for (const x of [a, b, g, own]) ok(!x.errors.length, `no page errors (${x.name || "guest"})`, x.errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
