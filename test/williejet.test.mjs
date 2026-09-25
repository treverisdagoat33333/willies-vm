/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// WillieJet round 2: fast mode, rewrite cache, address bar, fallback, crash recovery,
// cache controls, panic wipe, instant start, warm-up, speed test.
import { chromium } from "playwright";
const BASE = process.env.BASE, SITE = process.env.SITE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const hits = async () => (await fetch(SITE + "/hits")).json();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const frame = async () => (await page.$("#browser-frames iframe.active"))?.contentFrame();
async function text(sel, want, ms = 15000) {
  const end = Date.now() + ms; let last = null;
  while (Date.now() < end) { try { last = await (await frame()).$eval(sel, (e) => e.textContent); if (want ? want(last) : last) return last; } catch (_) {} await page.waitForTimeout(200); }
  return last;
}
await page.goto("/");
await page.click("#guest-button");
await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });

// ---- instant start: WillieJet as default starts before the browser is opened
await page.evaluate(() => { S.proxy = "wj"; save(); });
await page.reload();
await page.waitForFunction(() => typeof proxies !== "undefined");
await page.waitForTimeout(3500);
ok(await page.evaluate(() => !!proxies.wj && $("#browser-wrap").style.display !== "flex"), "instant start: WillieJet is running before the browser opens");
ok((await page.evaluate(() => performance.getEntriesByType("resource").some((r) => r.name.includes("/wj/worker.mjs")))), "…its worker was loaded at startup");

// ---- address bar follows the page
await page.evaluate((u) => openBrowser(u), SITE + "/");
ok(await text("h1", (t) => t === "Proxy test home") === "Proxy test home", "page loads");
await page.waitForTimeout(600);
ok(await page.evaluate(() => getTab().title) === "Proxy Test", "tab shows the page's own title", await page.evaluate(() => getTab().title));
await (await frame()).click("#next");
await text("h1", (t) => t === "Page two");
await page.waitForTimeout(2000);
ok(await page.inputValue("#browser-address") === SITE + "/page2", "clicking a link updates the address bar", await page.inputValue("#browser-address"));
ok(await page.evaluate(() => getTab().title) === "Page Two", "…and the tab title");
ok(await page.evaluate(() => historyData[0]?.url.endsWith("/page2") && historyData[0].title === "Page Two"), "…and history, with the page's title", await page.evaluate(() => JSON.stringify(historyData[0])));
await page.click("#b-bm");
ok(await page.evaluate(() => bookmarks.some((b) => b.url.endsWith("/page2"))), "bookmarking saves the page you're on, not the one you typed");
await page.click("#b-back");
await text("h1", (t) => t === "Proxy test home");
await page.waitForTimeout(2000);
ok(await page.inputValue("#browser-address") === SITE + "/", "Back updates the address bar too", await page.inputValue("#browser-address"));

// ---- rewrite cache: the bench page's scripts and styles get stored rewritten
// (reusing them across browser sessions is timed and checked by nextday.mjs)
await page.evaluate((u) => navigate(u, getTab()), SITE + "/bench/");
await page.waitForFunction(() => { try { return getTab().frame.contentDocument.getElementById("done")?.textContent === "12000"; } catch (_) { return false; } }, null, { timeout: 30000 });
await page.waitForTimeout(1000);
const rw = await page.evaluate(async () => (await (await caches.open("wj-rewrite-v1")).keys()).map((k) => k.url));
ok(rw.length === 40, "all 30 scripts and 10 styles are kept rewritten", rw.length);
ok(rw.every((u) => u.includes("/~/wj/_/")), "…under a key that doesn't depend on the desktop tab", rw[0]);
// ---- cache stats + clear
await page.evaluate(() => openSettings());
await page.click('#snav [data-page="browser"]');
await page.waitForTimeout(800);
const statsText = await page.textContent("#wj-stats");
ok(/files from cache/.test(statsText) && /skipped rewriting/.test(statsText), "Settings shows cache stats", statsText);
await page.click("#wj-clear");
await page.waitForTimeout(800);
const left = await page.evaluate(async () => (await (await caches.open("wj-http-v1")).keys()).length + (await (await caches.open("wj-rewrite-v1")).keys()).length);
ok(left === 0, "Clear WillieJet cache empties both caches", left);
ok(/0 files from cache/.test(await page.textContent("#wj-stats")), "…and resets the stats", await page.textContent("#wj-stats"));

// ---- fast mode
ok(await page.$eval('.switch[data-setting="wjFast"]', (b) => b.getAttribute("aria-checked") === "true" || b.classList.contains("on")) && await page.evaluate(() => S.wjFast === true), "fast mode is on by default");
await page.click('.switch[data-setting="wjFast"]');
await page.waitForTimeout(300);
ok(await page.evaluate(() => S.wjFast === false), "fast mode switches off");
await page.click('.switch[data-setting="wjFast"]');
await page.waitForTimeout(300);
ok(await page.evaluate(() => S.wjFast === true), "…and back on");
await page.evaluate(() => closePanel("settings-panel"));
const netReqs = [];
page.on("request", (r) => { if (r.url().endsWith("/wj-net")) netReqs.push(r.url()); });
await page.evaluate((u) => navigate(u, getTab()), SITE + "/?fast=1");
ok(await text("#fetched", (t) => t.startsWith("cookie=")) === "cookie=wvmtest=hello", "with fast mode, the page, its fetch and its cookie still work", await text("#fetched"));
ok(await text("#ws", (t) => t !== "waiting") === "echo:ping", "…WebSockets still work (they stay on /wisp/)");
const fs = await page.evaluate(() => proxies.wj.then((e) => e.stats()));
ok(fs.fast.on && fs.fast.fast >= 4, "…and requests went through our server", JSON.stringify(fs.fast));
// replies with more headers than fit in one (40 big cookies) come back framed
await page.evaluate((u) => navigate(u, getTab()), SITE + "/t/bigheaders");
ok(await text("#r", (t) => t !== "waiting") === '{"n":40}', "fast mode: a reply with 36 KB of headers still arrives whole", await text("#r"));
await page.waitForTimeout(3500); // the test cookies expire; 36 KB of cookies would make any server refuse the next request
// a site that turns away our server's own fetches (Cloudflare-style challenge): retried the normal way
const CF = SITE.replace("127.0.0.1", "localhost"); // its own origin, so the main test site keeps fast mode
const blocked0 = (await page.evaluate(() => proxies.wj.then((e) => e.stats()))).fast.challenged;
await page.evaluate((u) => navigate(u, getTab()), CF + "/t/cf");
ok(await text("#r", (t) => t.includes('"ok"')) === '{"ok":true}', "a site that challenges fast mode still loads (retried the normal way)", await text("#r"));
ok((await page.evaluate(() => proxies.wj.then((e) => e.stats()))).fast.challenged === blocked0 + 1, "…and fast mode stops asking it after the first challenge");
ok(await page.evaluate(() => [...document.querySelectorAll("#toasts *, .toast")].some((e) => /turns away fast mode/.test(e.textContent))), "…and says so");
// switching fast mode off for one site from the engine badge
await page.evaluate((u) => navigate(u, getTab()), SITE + "/");
await text("h1", (t) => t === "Proxy test home");
await page.click("#b-engine");
ok(await page.$$eval("#b-engine-pop button.item", (b) => b.some((x) => /Fast mode for this site.*✓/.test(x.textContent))), "the badge menu shows fast mode on for this site");
await page.click('#b-engine-pop button.item:has-text("Fast mode for this site")');
await page.waitForTimeout(1500);
await text("h1", (t) => t === "Proxy test home");
const viaFastBefore = netReqs.length;
await page.evaluate((u) => navigate(u, getTab()), SITE + "/page2");
await text("h1", (t) => t === "Page two");
ok(netReqs.length === viaFastBefore, "with it off for the site, its pages skip our server", netReqs.length - viaFastBefore);
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("wvm.siteNoFast")).includes("127.0.0.1")), "…and that's remembered");
await page.click("#b-engine");
await page.click('#b-engine-pop button.item:has-text("Fast mode for this site")');
await page.waitForTimeout(1500);
await page.evaluate(() => set("wjFast", false));

// ---- warm-up while typing
const before = (await hits()).filter((h) => h === "HEAD /").length;
await page.click("#browser-address");
await page.fill("#browser-address", "");
await page.type("#browser-address", SITE + "/abc", { delay: 20 });
await page.waitForTimeout(1500);
const after = (await hits()).filter((h) => h === "HEAD /").length;
ok(after === before + 1, "typing an address warms up a connection to that site (one HEAD, no cookies)", `${before} -> ${after}`);
await page.keyboard.press("Escape");

// ---- smarter fallback: a page that loads blank and throws
await page.evaluate((u) => { setSiteEngine(u, null); }, SITE + "/");
await page.evaluate((u) => navigate(u, getTab()), SITE + "/t/blank");
await page.waitForFunction(() => document.querySelector("#browser-frames iframe.active")?.getAttribute("src")?.includes("/~/sj/"), null, { timeout: 20000 }).catch(() => {});
ok((await page.$eval("#browser-frames iframe.active", (f) => f.getAttribute("src"))).includes("/~/sj/"), "a blank page is retried on the next engine (Scramjet v2)", await page.$eval("#browser-frames iframe.active", (f) => f.getAttribute("src")));
await page.waitForTimeout(9000);
ok((await page.$eval("#browser-frames iframe.active", (f) => f.getAttribute("src"))).includes("/~/sj/"), "…only once (still blank there, so it stops)");
await page.evaluate((u) => setSiteEngine(u, null), SITE + "/");
await page.evaluate((u) => navigate(u, getTab()), SITE + "/");
await text("h1", (t) => t === "Proxy test home");
await page.waitForTimeout(8000);
ok((await page.$eval("#browser-frames iframe.active", (f) => f.getAttribute("src"))).includes("/~/wj/"), "a normal page is left alone");

// ---- crash recovery: kill the worker; it comes back and the tab reloads
const w = page.workers().find((x) => x.url().includes("/wj/worker.mjs"));
ok(!!w, "found the WillieJet worker");
await w.evaluate(() => setTimeout(() => { for (;;) {} }, 50)).catch(() => {});
const t0 = Date.now();
await page.waitForFunction(() => [...document.querySelectorAll(".toast, #toasts *")].some((e) => /restarted itself/.test(e.textContent)), null, { timeout: 40000 }).catch(() => {});
const took = Math.round((Date.now() - t0) / 1000);
ok(took < 35, "a stuck engine is restarted automatically", took + "s");
ok(await text("h1", (t) => t === "Proxy test home", 20000) === "Proxy test home", "…and the tab reloads and works", await text("h1"));
await (await frame()).click("#next");
ok(await text("h1", (t) => t === "Page two") === "Page two", "…links work on the new engine");

// ---- speed test
await page.evaluate(() => openSettings());
await page.click('#snav [data-page="browser"]');
await page.fill("#st-sites", SITE + "/\n" + SITE + "/page2");
await page.click("#st-run");
await page.waitForFunction(() => $("#st-run").textContent === "Run speed test" && !$("#st-run").disabled, null, { timeout: 120000 });
const cells = await page.$$eval(".st-table tr", (rows) => rows.slice(1).map((r) => [...r.children].slice(1, 5).map((c) => c.textContent)));
ok(cells.length === 2 && cells.every((r) => r.every((c) => / ms$/.test(c))), "speed test times every site on all 4 engines", JSON.stringify(cells));
ok(await page.$$eval(".st-table td.best", (b) => b.length) === 2, "…and marks the fastest per site");

// ---- "Copy debug info": a site whose own script sends it to /undefined (like claude.ai did)
await page.evaluate(() => closePanel("settings-panel"));
await page.evaluate((u) => navigate(u, getTab()), SITE + "/t/undef");
await page.waitForFunction((u) => $("#browser-address").value === u, SITE + "/undefined", { timeout: 15000 }).catch(() => {});
ok(await page.inputValue("#browser-address") === SITE + "/undefined", "the test page really does wander off to /undefined", await page.inputValue("#browser-address"));
await page.click("#b-engine");
await page.click('#b-engine-pop button.item:has-text("Copy debug info")');
await page.waitForSelector("#dcf-log", { timeout: 15000 });
const report = await page.inputValue("#dcf-log");
ok(/location navigation to "\/undefined"/.test(report), "the debug info names the navigation to /undefined", report.slice(0, 600));
ok(/goNext \(http:\/\/127\.0\.0\.1:\d+\/t\/undef\.js:\d+:\d+\)/.test(report), "…points at the site's function, script and line that did it", report.slice(0, 900));
ok(/code there: .*cfg\.next/.test(report), "…and shows that line of the site's code", report.slice(0, 1200));
await page.click("#dc-modal-ok").catch(() => {});

// ---- ad blocker (on by default)
const R = async (path, want = (r) => true, ms = 20000) => {
  await page.evaluate((u) => navigate(u, getTab()), SITE + path);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const f = await frame();
      if ((await f.url()).includes(encodeURIComponent(path))) { // this page, not the one before it
        const r = JSON.parse(await f.$eval("#r", (e) => e.textContent));
        if (want(r)) return r;
      }
    } catch (_) {}
    await page.waitForTimeout(150);
  }
  return null;
};
const pre0 = (await page.evaluate(() => proxies.wj.then((e) => e.stats()))).preload.started;
let r = await R("/t/ads?1", (x) => x.hidden !== undefined);
ok(r && r.script === "loaded" && r.img === 1 && r.beacon === 204 && !r.timeout, "ad blocker: an ad script, a pixel and a tracker beacon get harmless empty answers", JSON.stringify(r));
ok(r?.hidden === true && r?.ga === "undefined", "…the ad script never ran, and its empty box is hidden", JSON.stringify(r));
const adFrame = page.frames().find((f) => f.url().includes("doubleclick.net"));
ok(!!adFrame && await adFrame.evaluate(() => !document.querySelector("h2")), "…an ad frame inside the page stays blank");
let adStats = (await page.evaluate(() => proxies.wj.then((e) => e.stats()))).ads;
ok(adStats.byHost["127.0.0.1"] >= 4, "…and all four were counted for the site", JSON.stringify(adStats));
ok((await page.evaluate(() => proxies.wj.then((e) => e.stats()))).preload.started === pre0, "…and preloading didn't fetch the ad script either");
await page.click("#b-engine");
await page.waitForTimeout(500);
ok(await page.$$eval("#b-engine-pop button.item", (b) => b.some((x) => /Block ads on this site.*blocked.*✓/.test(x.textContent))), "the badge menu shows the ad blocker on for this site, with its count", await page.$$eval("#b-engine-pop button.item", (b) => b.map((x) => x.textContent).join(" | ")));
await page.click('#b-engine-pop button.item:has-text("Block ads on this site")');
await page.waitForTimeout(1000);
const counted = adStats.byHost["127.0.0.1"];
r = await R("/t/ads?2", (x) => x.hidden !== undefined, 25000);
ok(r?.hidden === false, "switched off for the site, ads load again", JSON.stringify(r));
adStats = (await page.evaluate(() => proxies.wj.then((e) => e.stats()))).ads;
ok(adStats.byHost["127.0.0.1"] === counted && JSON.parse(await page.evaluate(() => localStorage.getItem("wvm.siteAdsOff"))).includes("127.0.0.1"), "…nothing more is blocked there, and that's remembered", JSON.stringify(adStats));
await page.click("#b-engine");
await page.click('#b-engine-pop button.item:has-text("Block ads on this site")');
await page.waitForTimeout(1000);
// following a link to a tracker's own site: a notice, and "Open anyway"
await R("/t/adlink");
await (await frame()).click("#l");
let notice = null;
for (let i = 0; i < 40 && !notice; i++) { await page.waitForTimeout(200); notice = await (await frame())?.$eval("h2", (e) => e.textContent).catch(() => null); }
ok(notice === "Ad or tracker site blocked", "a link to an ad or tracker site shows a notice instead", notice);
await (await frame()).click("button");
let gone = false;
for (let i = 0; i < 50 && !gone; i++) { await page.waitForTimeout(200); gone = !(await (await frame())?.$("h2:has-text('Ad or tracker site blocked')").catch(() => null)); }
ok(gone, "…and Open anyway opens it");

// ---- preloading: next visit, a page's scripts all start at once
// (fast mode is off here: the test site is plain HTTP/1.1, where fast mode shares 6 connections)
const timeOf = async (path) => (await R(path, (x) => x.t > 0))?.t ?? null;
await timeOf("/t/chunks?a");
await timeOf("/t/modules?a");
await page.waitForTimeout(16000); // what each page used is remembered 15 s after it loads
const p0 = (await page.evaluate(() => proxies.wj.then((e) => e.stats()))).preload;
const chunksOn = await timeOf("/t/chunks?b"), modulesOn = await timeOf("/t/modules?b");
const p1 = (await page.evaluate(() => proxies.wj.then((e) => e.stats()))).preload;
ok(p1.used - p0.used >= 9 && p1.wasted === p0.wasted, "the second visit's files were preloaded, and all used", JSON.stringify({ p0, p1 }));
ok(await page.evaluate(() => getTab().engine) === "wj", "…still on WillieJet");
await page.evaluate(() => proxies.wj.then((e) => e.setPreload(false)));
const chunksOff = await timeOf("/t/chunks?c"), modulesOff = await timeOf("/t/modules?c");
await page.evaluate(() => proxies.wj.then((e) => e.setPreload(true)));
console.log(`      preloading: chunks ${chunksOn} ms vs ${chunksOff} ms without, modules ${modulesOn} ms vs ${modulesOff} ms`);
ok(chunksOn && chunksOff && chunksOn < chunksOff * 0.7, "a script-loads-script page (like a webpack app) loads much faster", `${chunksOn} vs ${chunksOff}`);
ok(modulesOn && modulesOff && modulesOn < modulesOff * 0.7, "…and so does a chain of modules", `${modulesOn} vs ${modulesOff}`);

// ---- saved logins
r = await R("/t/login");
let lf = await frame();
await lf.fill("#u", "william@example.com");
await lf.fill("#p", "hunter2-secret");
await lf.click("#go");
await page.waitForSelector("#login-ask.show", { timeout: 10000 }).catch(() => {});
const ask = await page.textContent("#login-ask").catch(() => "");
ok(/Save your login for 127\.0\.0\.1/.test(ask) && /william@example\.com/.test(ask), "signing in offers to save the login", ask);
await page.click('#login-ask [data-a="save"]');
await page.waitForTimeout(600);
const vault = await page.evaluate(async () => { const v = await kvGet(await loginsDb(), "vault"); return v ? new TextDecoder().decode(new Uint8Array(v.data)) : null; });
ok(!!vault && !vault.includes("hunter2-secret") && !vault.includes("william@"), "…and saves it encrypted");
r = await R("/t/login?again");
await page.waitForSelector("#b-key:not([hidden])", { timeout: 8000 }).catch(() => {});
ok(await page.isVisible("#b-key"), "back on the sign-in page, the key button shows");
await page.click("#b-key");
await page.click('#b-key-pop button.item:has-text("william@example.com")');
lf = await frame();
ok(await lf.inputValue("#u") === "william@example.com" && await lf.inputValue("#p") === "hunter2-secret", "…and fills in the saved login");
r = await R("/t/login?fail");
lf = await frame();
await lf.fill("#u", "someone@example.com");
await lf.fill("#p", "wrong-password");
await lf.click("#go");
await page.waitForTimeout(3000);
ok(!(await page.isVisible("#login-ask")), "a sign-in that didn't go through (the form stays up) isn't offered");
await page.evaluate(() => openSettings());
await page.click('#snav [data-page="browser"]');
await page.waitForTimeout(500);
ok(/1 saved/.test(await page.textContent("#logins-count")) && /william@example\.com/.test(await page.textContent("#logins-list")), "Settings lists the saved login", await page.textContent("#logins-count"));
page.once("dialog", (d) => d.accept());
await page.click("#logins-clear");
await page.waitForTimeout(500);
ok(/None yet/.test(await page.textContent("#logins-count")), "…and Delete all removes it", await page.textContent("#logins-count"));
await page.evaluate(() => closePanel("settings-panel"));

// ---- panic wipe clears the WillieJet cache
await page.evaluate(async () => { await (await caches.open("wj-http-v1")).put("https://x.test/a", new Response("a")); wjWipe(); await new Promise((r) => setTimeout(r, 300)); });
ok(!(await page.evaluate(() => caches.has("wj-http-v1"))), "the panic wipe deletes the WillieJet cache");
ok(!errors.filter((e) => !/^broken \d$/.test(e)).length, "no page errors (besides the test page's own deliberate ones)", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
