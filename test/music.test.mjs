/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Music plays through our server: search, the audio stream (whole file, ranges,
// HLS pieces stitched together, links that ran out), and the player itself.
// SoundCloud, Deezer and Audius are the test site's pretend ones (/sc/, /dz/, /au/).
// YouTube can't be faked here: its songs play in YouTube's own embedded player.
import { chromium } from "playwright";
const BASE = process.env.BASE, SITE = process.env.SITE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("/");
await page.click("#guest-button");
await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });
const mock = async () => (await fetch(`${SITE}/sc-test/stats`)).json();
const { size } = await mock();
const grab = (url, range) => page.evaluate(async ({ url, range }) => {
  const r = await fetch(url, { headers: range ? { Range: range } : {} });
  const b = new Uint8Array(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get("content-type"), range: r.headers.get("content-range"), len: b.length, head: [...b.subarray(0, 4)] };
}, { url, range });
const stats = () => page.evaluate(() => window.music.stats());
const until = (fn, arg, timeout = 10000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

// ---- search: only songs we can stream
const found = await page.evaluate(async () => (await (await fetch("/api/music/search?q=test%20song")).json()).tracks.map((t) => t.id));
ok(JSON.stringify(found) === "[101,102,105,104]", "search leaves out DRM-locked label uploads, previews last", JSON.stringify(found));

// ---- the stream
let r = await grab("/api/music/stream/101");
ok(r.status === 200 && r.type === "audio/mpeg" && r.len === size && r.head[0] === 0xff, "a song's MP3 comes from our site", JSON.stringify(r));
r = await grab("/api/music/stream/101", "bytes=1000-1999");
ok(r.status === 206 && r.len === 1000 && r.range === `bytes 1000-1999/${size}`, "…with ranges, so seeking works", JSON.stringify(r));
let calls = (await mock()).mediaCalls;
ok(calls["101:progressive:mp3_1_0"] >= 1 && !calls["101:hls:mp3_1_0"], "the whole MP3 file is picked over HLS pieces", JSON.stringify(calls));
r = await grab("/api/music/stream/102");
ok(r.status === 200 && r.type === "audio/mpeg" && r.len === size, "a song only in HLS pieces is stitched into one file", JSON.stringify(r));
r = await grab("/api/music/stream/102", "bytes=0-9");
ok(r.status === 206 && r.len === 10 && r.range === `bytes 0-9/${size}`, "…which seeks too", JSON.stringify(r));
calls = (await mock()).mediaCalls;
ok(calls["102:hls:mp3_1_0"] === 1 && !calls["102:hls:aac_160k"], "…MP3 pieces before AAC, fetched once", JSON.stringify(calls));
r = await grab("/api/music/stream/105");
calls = (await mock()).mediaCalls;
ok(r.status === 200 && r.len === size && calls["105:progressive:mp3_1_0"] === 2, "a link that ran out is asked for again", JSON.stringify({ r, calls }));
ok((await grab("/api/music/stream/103")).status === 404, "a DRM-locked song is a clean 404");
ok((await grab("/api/music/stream/999999")).status === 404, "…and so is one that doesn't exist");
ok((await grab("/api/music/stream/abc")).status === 400, "…and nonsense ids are refused");
ok((await fetch(`${BASE}/api/music/stream/101`)).status === 401, "no session, no music");

// ---- the player
await page.evaluate(() => window.music.open());
await page.fill("#mu-q", "test song");
await page.press("#mu-q", "Enter");
await page.waitForSelector("#mu-body .mu-row", { timeout: 10000 });
await page.click("#mu-body .mu-row");
ok(await until(() => { const s = window.music.stats(); return s.playing && s.pos > 0.5; }), "clicking a song plays it", JSON.stringify(await stats()));
let s = await stats();
ok(new URL(s.src).origin === new URL(BASE).origin && new URL(s.src).pathname === "/api/music/stream/101", "…from our own site", s.src);
ok(Math.abs(s.dur - 10) < 0.5, "…and knows how long it is", String(s.dur));
ok(await page.evaluate(() => navigator.mediaSession?.metadata?.title) === "Test Song", "the media keys and lock screen know what's playing");

await page.evaluate(() => { const k = document.querySelector("#mu-seek"); k.value = 600; k.dispatchEvent(new Event("input")); k.dispatchEvent(new Event("change")); });
ok(await until(() => window.music.stats().pos >= 6), "seeking jumps ahead", JSON.stringify(await stats()));
await page.click("#mu-play");
ok(await until(() => window.music.stats().paused && !window.music.stats().playing), "pause pauses");
await page.click("#mu-play");
ok(await until(() => window.music.stats().playing), "…and play plays");
await page.evaluate(() => { const v = document.querySelector("#mu-vol"); v.value = 30; v.dispatchEvent(new Event("input")); });
ok(Math.abs((await stats()).volume - 0.3) < 0.01, "the volume slider works");

// ---- the end of a song plays the next (the stitched one)
await page.evaluate(() => { const k = document.querySelector("#mu-seek"); k.value = 960; k.dispatchEvent(new Event("change")); });
ok(await until(() => { const s = window.music.stats(); return s.id === 102 && s.playing && s.pos > 0.3; }, null, 15000), "when a song ends the next one plays", JSON.stringify(await stats()));

// ---- a chart song is matched to an upload and played
await page.evaluate(() => window.music.play([{ key: "dz1", title: "Test Song", artist: "Test Artist", duration: 10, chart: true }]));
ok(await until(() => { const s = window.music.stats(); return s.id === 101 && s.playing; }), "a chart song finds its upload and plays", JSON.stringify(await stats()));

// ---- a song that won't play is skipped
await page.evaluate(() => window.music.play([{ id: 999999, title: "Gone" }, { id: 105, title: "Test Song Stale" }]));
ok(await until(() => { const s = window.music.stats(); return s.id === 105 && s.playing; }), "a song that can't play is skipped", JSON.stringify(await stats()));
ok(await page.evaluate(() => [...document.querySelectorAll("#toasts *, .toast")].some((t) => /Skipping/.test(t.textContent))), "…and it says so");

// ---- other sources: Audius streams through us, Deezer is a catalogue
const api = (path) => page.evaluate(async (path) => { const r = await fetch(path); return { status: r.status, body: await r.json().catch(() => null) }; }, path);
let a = await api("/api/music/search?q=test&source=au");
ok(JSON.stringify(a.body.tracks.map((t) => t.id)) === '["au:A1","au:A3"]' && a.body.tracks[0].src === "au", "Audius search leaves out members-only tracks", JSON.stringify(a.body));
r = await grab("/api/music/stream/au:A1");
ok(r.status === 200 && r.type === "audio/mpeg" && r.len === size, "an Audius song streams from our site, through its redirects", JSON.stringify(r));
r = await grab("/api/music/stream/au:A1", "bytes=100-199");
ok(r.status === 206 && r.len === 100 && r.range === `bytes 100-199/${size}`, "…and seeks", JSON.stringify(r));
ok((await grab("/api/music/stream/au:A3")).status === 502, "an Audius link into a private network is refused");
ok((await grab("/api/music/stream/au:NOPE")).status === 404, "…and a missing Audius track is a 404");
a = await api("/api/music/charts?genre=116&source=au");
ok(a.body.tracks.length === 2 && a.body.tracks[0].id === "au:A1", "Audius has its own trending chart", JSON.stringify(a.body.tracks));
a = await api("/api/music/search?q=test%20song&source=dz");
ok(a.body.tracks.length === 1 && a.body.tracks[0].key === "dz7" && a.body.tracks[0].chart, "Deezer search is its catalogue, played like a chart song", JSON.stringify(a.body));
ok((await api("/api/music/search?q=test&source=nope")).body.tracks.some((t) => t.id === 101), "an unknown source falls back to SoundCloud");

// ---- the switch
ok(await page.$eval("#mu-src .on", (e) => e.dataset.src) === "sc", "SoundCloud is the default source");
await page.click('#mu-src [data-src="au"]');
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("music")).source) === "au", "the pick is saved with the library");
await page.fill("#mu-q", "test");
await page.press("#mu-q", "Enter");
ok(await until(() => [...document.querySelectorAll("#mu-body .mu-row .src.au")].length === 2), "searching now searches Audius, marked as such");
await page.click("#mu-body .mu-row");
ok(await until(() => { const s = window.music.stats(); return s.source === "au" && s.playing && s.pos > 0.3; }), "an Audius song plays", JSON.stringify(await stats()));
ok(decodeURIComponent(new URL((await stats()).src).pathname) === "/api/music/stream/au:A1", "…from our own site", (await stats()).src);
await page.click('#mu-src [data-src="dz"]');
ok(await until(() => [...document.querySelectorAll("#mu-body .mu-row")].length === 1), "switching sources runs the search again");
await page.click("#mu-body .mu-row");
ok(await until(() => { const s = window.music.stats(); return s.id === 101 && s.playing; }, null, 15000), "a Deezer song finds its full upload (YouTube can't be reached here, so SoundCloud)", JSON.stringify(await stats()));
await page.click('#mu-src [data-src="sc"]');

ok(!errors.length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
