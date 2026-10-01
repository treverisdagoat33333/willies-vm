/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Compressed static files (static.js), owner backups (backup.js), the error
// log (analytics.js), chat search, pins, unread counts and muting, and the
// welcome tour (js/tour.js).
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];

/* ---- compression ---- */
const br = await fetch(BASE + "/libcurl/index.mjs", { headers: { "accept-encoding": "br" } });
const brLen = (await br.arrayBuffer()).byteLength; // fetch decodes it; the header says what came over the wire
ok(br.headers.get("content-encoding") === "br" && br.headers.get("cache-control") === "public, max-age=3600" && brLen > 2000000, "package files come compressed and cacheable", JSON.stringify([...br.headers]));
const page1 = await fetch(BASE + "/js/app.js", { headers: { "accept-encoding": "gzip" } });
const etag = page1.headers.get("etag");
ok(page1.headers.get("content-encoding") === "gzip" && page1.headers.get("cache-control") === "no-cache" && etag, "the site's own files are compressed and checked each time");
ok((await fetch(BASE + "/js/app.js", { headers: { "accept-encoding": "gzip", "if-none-match": etag } })).status === 304, "…so a repeat visit costs a 304");
ok(!(await fetch(BASE + "/js/app.js", { headers: { "accept-encoding": "identity" } })).headers.get("content-encoding"), "…and a browser that can't decompress gets the plain file");
ok((await fetch(BASE + "/js/..%2f..%2fserver.js", { headers: { "accept-encoding": "br" } })).status === 404, "nothing outside the folder is served");

/* ---- people ---- */
const stamp = Date.now().toString(36).slice(-5);
async function person(name, extra = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto("/");
  if (name === "testowner") {
    await page.evaluate(async () => { await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "testowner", password: "test-owner-pass" }) }); });
  } else {
    await page.evaluate(async ({ name }) => {
      const r = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: "password123" }) });
      if (!r.ok) throw new Error(await r.text());
    }, { name });
  }
  // a brand-new visitor: nothing saved from before (the first load above wrote settings)
  if (Object.keys(extra).length) await page.evaluate((x) => { localStorage.removeItem("wvm.settings.v1"); Object.entries(x).forEach(([k, v]) => localStorage.setItem(k, v)); }, extra);
  await page.reload();
  await page.waitForFunction(() => typeof chatMeAccount !== "undefined" && chatMeAccount === true, null, { timeout: 15000 });
  return { ctx, page, name };
}
const owner = await person("testowner");
const ann = await person(`ann${stamp}`);
const bob = await person(`bob${stamp}`, { "wvm.tour.test": "1" });

/* ---- the welcome tour ---- */
ok(await bob.page.waitForSelector(".tour-card", { timeout: 5000 }).then(() => true, () => false), "a first visit gets the welcome tour");
await bob.page.click(".tour-next");
await bob.page.waitForTimeout(300);
const step2 = await bob.page.evaluate(() => ({ t: document.querySelector(".tour-card h3").textContent, center: document.querySelector(".tour-hole").classList.contains("center"), w: document.querySelector(".tour-hole").offsetWidth, tb: !!document.querySelector("#tb-browser")?.offsetParent }));
ok(step2.t === "The browser" && !step2.center && step2.w > 20, "…which points at the real buttons", JSON.stringify(step2));
await bob.page.keyboard.press("Escape");
ok(!(await bob.page.$(".tour-card")) && await bob.page.evaluate(() => localStorage.getItem("wvm.tour.v1")) === "1", "Escape skips it, and it doesn't come back");
await bob.page.evaluate(() => { localStorage.setItem("wvm.news.seen", "1"); window.tour.greet(); });
ok(await bob.page.$eval(".news-card", (n) => /Send pictures to the AI/.test(n.textContent)).catch(() => false), "someone who's been before sees what's new instead");
await bob.page.click(".news-ok");
ok(!(await bob.page.$(".news-card")), "…until they close it");
ok(!(await ann.page.$(".tour-card")), "test browsers don't get the tour unless they ask for it");

/* ---- chat: messages to find ---- */
const openChat = async (p) => { await p.page.evaluate(() => { openChat(); dcOpen("general"); }); await p.page.waitForTimeout(400); };
for (const p of [owner, ann, bob]) await openChat(p);
const word = `zebra${stamp}`;
await ann.page.evaluate((w) => dcSend({ type: "msg", channel: "general", text: `the ${w} crossed the road` }), word);
await ann.page.evaluate(() => dcSend({ type: "msg", channel: "general", text: "something else entirely" }));
await bob.page.waitForTimeout(500);

await bob.page.keyboard.press("Control+f");
ok(await bob.page.$eval("#dc-find", (f) => !f.hidden), "Ctrl+F in chat opens search");
await bob.page.fill("#dc-find-q", word);
await bob.page.waitForSelector("#dc-find-list .dc-hit", { timeout: 5000 }).catch(() => {});
const hits = await bob.page.$$eval("#dc-find-list .dc-hit", (h) => h.map((x) => x.textContent));
ok(hits.length === 1 && hits[0].includes("crossed the road") && await bob.page.$eval("#dc-find-list mark", (m) => m.textContent.toLowerCase()).catch(() => "") === word, "searching finds the message and highlights the word", JSON.stringify(hits));
await bob.page.fill("#dc-find-q", `from:ann${stamp}`);
await bob.page.press("#dc-find-q", "Enter");
await bob.page.waitForTimeout(600);
ok(await bob.page.$$eval("#dc-find-list .dc-hit", (h) => h.length) === 2, "from:name finds what one person said");
// DMs stay private
await owner.page.evaluate((b) => dcSend({ type: "dm.open", name: b }), bob.name);
await owner.page.waitForTimeout(400);
const dmCh = await owner.page.evaluate(() => dcActive);
ok(dmCh.startsWith("dm:"), "the owner opens a DM with Bob", dmCh);
await owner.page.evaluate(({ ch, w }) => dcSend({ type: "msg", channel: ch, text: `secret ${w}` }), { ch: dmCh, w: word });
await owner.page.waitForTimeout(400);
const search = (p, q) => p.page.evaluate((q) => new Promise((res) => { const prev = window.dcFindResults; window.dcFindResults = (d) => { window.dcFindResults = prev; res(d.results.map((m) => m.text)); }; dcFindMode = "search"; dcSend({ type: "search", q }); }), q);
ok((await search(bob, word)).some((t) => t.startsWith("secret")), "your own DMs are searched");
ok(!(await search(ann, word)).some((t) => t.startsWith("secret")), "…but nobody else's");
await bob.page.keyboard.press("Escape");

/* ---- pins ---- */
await owner.page.evaluate(() => dcOpen("general"));
await owner.page.waitForTimeout(400);
const target = await ann.page.evaluate((w) => dcMessages.find((m) => m.text.includes(w))?.id, word);
await ann.page.evaluate((id) => dcSend({ type: "pin", id, on: true }), target);
await ann.page.waitForTimeout(300);
ok(!(await ann.page.evaluate((id) => dcMessages.find((m) => m.id === id).pinned, target)), "a member can't pin in a channel");
await owner.page.evaluate((id) => dcSend({ type: "pin", id, on: true }), target);
await bob.page.waitForFunction((id) => dcMessages.find((m) => m.id === id)?.pinned, target, { timeout: 4000 }).catch(() => {});
ok(await bob.page.evaluate((id) => dcMessages.find((m) => m.id === id)?.pinned, target) && await bob.page.$(`#dc-msgs .dc-m.pinned[data-id="${target}"]`), "the owner pins it and everyone sees it pinned");
await bob.page.click("#dc-pins");
await bob.page.waitForSelector("#dc-find-list .dc-hit", { timeout: 4000 }).catch(() => {});
ok((await bob.page.$$eval("#dc-find-list .dc-hit", (h) => h.map((x) => x.textContent))).some((t) => t.includes("crossed the road")), "the pins button lists it");
await bob.page.click("#dc-find-close");

/* ---- unread counts, mentions and muting ---- */
await owner.page.evaluate(() => dcSend({ type: "channel.create", name: `quiet${Date.now().toString(36).slice(-4)}` }));
await owner.page.waitForTimeout(500);
const quiet = await bob.page.evaluate(() => dcChannels.find((c) => c.slug.startsWith("quiet"))?.slug);
ok(!!quiet, "a second channel to talk in", quiet);
await ann.page.evaluate((ch) => { dcSend({ type: "msg", channel: ch, text: "one" }); dcSend({ type: "msg", channel: ch, text: "two" }); }, quiet);
await bob.page.waitForTimeout(500);
ok(await bob.page.$eval(`#dc-channels .dc-ch.unread .cnt`, (c) => c.textContent).catch(() => "") === "2", "an unread channel shows how many");
await ann.page.evaluate(({ ch, b }) => dcSend({ type: "msg", channel: ch, text: `hey @${b}` }), { ch: quiet, b: bob.name });
await bob.page.waitForTimeout(500);
ok(await bob.page.$eval(`#dc-channels .dc-ch .cnt.hot`, (c) => c.textContent).catch(() => "") === "@1", "an @mention shows red with an @");
await bob.page.evaluate((ch) => dcOpen(ch), quiet);
await bob.page.waitForTimeout(300);
ok(!(await bob.page.$("#dc-channels .dc-ch .cnt")), "opening the channel clears it");
await bob.page.click("#dc-mute");
ok(await bob.page.evaluate((ch) => JSON.parse(localStorage.getItem("dcMuted"))[ch] === 1, quiet) && await bob.page.$eval("#dc-mute", (b) => b.classList.contains("on")), "the bell mutes a channel");
await bob.page.evaluate(() => dcOpen("general"));
await bob.page.waitForTimeout(300);
await bob.page.evaluate(() => { window.__pings = 0; const prev = chatPing; window.chatPing = () => { window.__pings++; }; chatPing = (...a) => { window.__pings++; }; });
await ann.page.evaluate((ch) => dcSend({ type: "msg", channel: ch, text: "chatter" }), quiet);
await bob.page.waitForTimeout(500);
ok(await bob.page.$eval(`#dc-channels .dc-ch.muted`, (c) => !c.querySelector(".cnt") && !c.classList.contains("unread")).catch(() => false) && await bob.page.evaluate(() => window.__pings) === 0, "a muted channel stays quiet");
await ann.page.evaluate(({ ch, b }) => dcSend({ type: "msg", channel: ch, text: `@${b} you there?` }), { ch: quiet, b: bob.name });
await bob.page.waitForTimeout(500);
ok(await bob.page.evaluate(() => window.__pings) === 1 && await bob.page.$eval(`#dc-channels .dc-ch.muted .cnt.hot`, (c) => c.textContent).catch(() => "") === "@1", "…but an @mention still gets through");

/* ---- the error log ---- */
const report = (p, body) => p.page.evaluate(async (body) => (await fetch("/api/stats/error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status, body);
ok(await report(ann, { kind: "movie", msg: "vidsrc player didn't load", place: "Bones" }) === 204 && await report(bob, { kind: "movie", msg: "vidsrc player didn't load", place: "Bones" }) === 204, "pages report what broke");
ok(await report(ann, { kind: "hack", msg: "x" }) === 400, "…only known kinds");
await ann.page.evaluate(() => setTimeout(() => { throw new Error("test boom from our page"); }));
await ann.page.waitForTimeout(500);
ok(await ann.page.evaluate(async () => (await fetch("/api/stats/errors")).status) === 403, "only the owner reads the log");
const log = (await owner.page.evaluate(async () => (await fetch("/api/stats/errors")).json())).errors;
const movie = log.find((e) => e.kind === "movie");
ok(movie?.n === 2 && movie.people === 2 && movie.place === "Bones", "the same problem is counted, with how many people hit it", JSON.stringify(movie));
ok(log.some((e) => e.kind === "js" && e.msg.includes("test boom")), "our own script errors are caught and reported", JSON.stringify(log.map((e) => e.msg)));
ok(!JSON.stringify(log).includes(ann.name), "the log never names anyone");
await owner.page.evaluate(() => openAdmin());
await owner.page.waitForSelector("#ad-errors .ad-err", { timeout: 5000 }).catch(() => {});
ok(await owner.page.$$eval("#ad-errors .ad-err", (e) => e.some((x) => /vidsrc player/.test(x.textContent) && /2×/.test(x.textContent))), "the admin panel lists them");

/* ---- backups ---- */
const dl = await owner.page.evaluate(async () => { const r = await fetch("/api/admin/backup"); return { status: r.status, cd: r.headers.get("content-disposition"), body: await r.json() }; });
ok(dl.status === 200 && /attachment; filename="willies-vm-backup-/.test(dl.cd) && dl.body.app === "willies-vm", "the owner downloads a backup");
ok(dl.body.tables.users.some((u) => u.username === ann.name) && dl.body.tables.messages.some((m) => m.text.includes(word) && m.pinned === 1), "…with the accounts and the messages (pins too)");
ok(await ann.page.evaluate(async () => (await fetch("/api/admin/backup")).status) === 403, "nobody else can");
// something changes after the backup, then the backup is restored
await ann.page.evaluate(() => dcSend({ type: "msg", channel: "general", text: "after the backup" }));
await ann.page.waitForTimeout(300);
const bad = await owner.page.evaluate(async () => { const r = await fetch("/api/admin/backup", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ app: "nope" }) }); return r.status; });
ok(bad === 400, "a file that isn't a backup is refused");
const closed = ann.page.evaluate(() => new Promise((res) => { const ws = chatWS; ws.addEventListener("close", (e) => res(e.code)); setTimeout(() => res(0), 5000); }));
const res = await owner.page.evaluate(async (body) => { const r = await fetch("/api/admin/backup", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() }; }, dl.body);
ok(res.status === 200 && res.j.counts.users === dl.body.tables.users.length, "restoring it works", JSON.stringify(res));
ok(await closed === 4005, "…and everyone in chat reconnects");
const after = await owner.page.evaluate(async () => (await fetch("/api/admin/backup")).json());
ok(!after.tables.messages.some((m) => m.text === "after the backup") && after.tables.messages.some((m) => m.text.includes(word)), "…putting the database back as it was");

ok(!errors.filter((e) => !e.includes("test boom")).length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
