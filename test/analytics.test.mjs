/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// The owner's analytics (analytics.js, js/stats.js): the page reports visits,
// apps, songs and movies, the server counts the rest, only the owner can see
// the report, and the dashboard draws it.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

ok((await fetch(BASE + "/api/stats/event", { method: "POST", headers: { "content-type": "application/json" }, body: '{"kind":"visit"}' })).status === 401, "reporting needs a session");

// a guest uses the site
const g = await (await browser.newContext({ baseURL: BASE })).newPage();
const errors = [];
g.on("pageerror", (e) => errors.push(e.message));
await g.goto("/");
await g.click("#guest-button");
await g.waitForSelector("#auth-wrap.hidden", { state: "attached" });
const post = (p, body) => p.evaluate(async (body) => (await fetch("/api/stats/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status, body);
await g.click('#icons .dicon[data-app="music"]');
await g.waitForTimeout(300);
ok(await post(g, { kind: "song", name: "Test Song · Test Artist" }) === 204, "the page can report a song");
ok(await post(g, { kind: "app", name: "not-an-app" }) === 400 && await post(g, { kind: "vm", name: "x" }) === 400, "…but not an unknown app, or something only the server counts");
ok((await g.evaluate(async () => (await fetch("/api/stats/report")).status)) === 403, "a guest can't see the report");

// the owner looks
const o = await (await browser.newContext({ baseURL: BASE, viewport: { width: 1366, height: 900 } })).newPage();
o.on("pageerror", (e) => errors.push(e.message));
await o.goto("/");
ok(await o.evaluate(async () => (await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "testowner", password: "test-owner-pass" }) })).status) === 200, "the owner signs in");
await o.reload();
await o.waitForFunction(() => document.documentElement.dataset.owner === "on", null, { timeout: 10000 });
const rep = await o.evaluate(async () => (await fetch("/api/stats/report?days=7")).json());
const today = rep.days.at(-1);
ok(rep.days.length === 7 && today.visitors >= 2 && rep.totals.visitors >= 2, "unique visitors are counted per day (the guest and the owner)", JSON.stringify(today));
ok(rep.top.app.some((a) => a.name === "music") && rep.top.song.some((s) => s.name === "Test Song · Test Artist"), "…and which apps were opened and which songs played", JSON.stringify(rep.top));
ok(!JSON.stringify(rep).includes("guest-") && !JSON.stringify(rep).includes("testowner"), "the report never names anyone");
ok(rep.hours.some((h) => h.n > 0), "…and when, by hour", JSON.stringify(rep.hours.slice(0, 3)));

// the dashboard
await o.evaluate(() => openAdmin());
await o.waitForFunction(() => document.querySelectorAll("#an-kpis .an-kpi").length === 10, null, { timeout: 10000 }).catch(() => {});
ok(await o.$$eval("#an-kpis .an-kpi", (k) => k.length) === 10, "the admin panel shows the headline numbers");
ok(await o.$$eval("#an-visitors svg path.line", (p) => p.length) === 1 && await o.$$eval("#an-social svg path.line", (p) => p.length) === 3 && await o.$$eval("#an-heat .c", (c) => c.length) === 168, "…the visitor line, the chat/AI/calls lines and the busy-times grid");
ok(await o.$$eval("#an-apps .an-bar", (b) => b.some((x) => /Music/.test(x.textContent))), "…and the apps list");
const hit = await o.$("#an-visitors svg .hit"), hb = await hit.boundingBox();
await o.mouse.move(hb.x + hb.width - 3, hb.y + hb.height / 2);
ok(await o.$eval("#an-tip", (t) => !t.hidden && /Visitors:/.test(t.textContent)), "hovering the chart shows that day's numbers");
await o.click('#an-range [data-d="90"]');
await o.waitForFunction(() => window.adStats.data?.days.length === 90, null, { timeout: 5000 }).catch(() => {});
ok(await o.evaluate(() => window.adStats.data?.days.length) === 90, "the range switch reloads it");
await o.click("#an-visitors ~ .an-data summary");
ok(await o.$$eval("#an-visitors ~ .an-data tbody tr", (r) => r.length) === 90, "every chart over time can be read as a table");

ok(!errors.length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
