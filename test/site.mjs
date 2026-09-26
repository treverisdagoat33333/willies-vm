/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// The site the proxy tests load, on 127.0.0.1: pages, CSS, images, scripts,
// fetch with a cookie, a WebSocket echo, and the compatibility pages under /t/.
// /bench/ is a heavy page (60 files, each delayed like a far-away server).
// /hits lists every request it has seen.
import http from "node:http";
import { WebSocketServer } from "ws";
const PORT = +process.env.SITE_PORT || 8931;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const hits = [];
const html = (body, title) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="/style.css"></head><body>${body}</body></html>`;
function handler(req, res) {
  hits.push(req.method === "GET" ? req.url : req.method + " " + req.url);
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html", "set-cookie": "wvmtest=hello; Path=/" });
    return res.end(html(`<h1 id="h">Proxy test home</h1><img id="img" src="/pic.png"><p id="fetched">waiting</p><p id="ws">waiting</p><p id="loc"></p><a id="next" href="/page2">next</a><script>document.body.dataset.inline="1"</script><script src="/app.js"></script>`, "Proxy Test"));
  }
  if (u.pathname === "/page2") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html(`<h1 id="h">Page two</h1>`, "Page Two")); }
  if (u.pathname === "/style.css") { res.writeHead(200, { "content-type": "text/css" }); return res.end("body{background:rgb(1, 2, 3);color:#eee}"); }
  if (u.pathname === "/pic.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end(PNG); }
  if (u.pathname === "/app.js") {
    res.writeHead(200, { "content-type": "application/javascript" });
    return res.end(`document.getElementById("loc").textContent=location.href;
fetch("/api").then(r=>r.json()).then(j=>{document.getElementById("fetched").textContent="cookie="+j.cookie}).catch(e=>{document.getElementById("fetched").textContent="error "+e});
try{const ws=new WebSocket("ws://"+location.host+"/ws");ws.onopen=()=>ws.send("ping");ws.onmessage=e=>{document.getElementById("ws").textContent=e.data};ws.onerror=()=>{document.getElementById("ws").textContent="ws error"}}catch(e){document.getElementById("ws").textContent="ws threw "+e}`);
  }
  if (u.pathname === "/api") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ cookie: req.headers.cookie || "" })); }
  if (u.pathname === "/hits") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(hits)); }
  const page = (title, body) => { res.writeHead(200, { "content-type": "text/html" }); res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><pre id="r">waiting</pre><script>const R={};const done=()=>{document.getElementById("r").textContent=JSON.stringify(R)};</script>${body}</body></html>`); };
  const js = (code, extra = {}) => { res.writeHead(200, { "content-type": "application/javascript", ...extra }); res.end(code); };
  if (u.pathname.startsWith("/bench/")) return bench(u, res);
  if (u.pathname.startsWith("/t/c/")) return chunk(u, res);
  if (u.pathname.startsWith("/v1/")) return aiMock(req, res, u);
  if (/^\/(sc\/|sc-|dz\/|au\/|au-node\/)/.test(u.pathname)) return musicMock(req, res, u);
  switch (u.pathname) {
    case "/t/iframe": return page("iframe", `<iframe id="f" src="/t/child"></iframe><iframe id="b"></iframe><script>
      const b=document.getElementById("b");b.contentDocument.open();b.contentDocument.write("<p id=w>written</p>");b.contentDocument.close();
      R.blank=b.contentDocument.getElementById("w")?.textContent;
      document.getElementById("f").onload=()=>{try{R.child=document.getElementById("f").contentDocument.getElementById("c").textContent;R.childHost=document.getElementById("f").contentWindow.location.host}catch(e){R.child="err "+e}done()};</script>`);
    case "/t/child": return page("child", `<p id="c">child ok</p>`);
    case "/t/history": return page("history", `<script>const here=()=>location.pathname+location.search+location.hash;
      history.replaceState({key:1},"");R.omitted=here();
      history.pushState({key:2},"",null);R.nulled=here();
      history.replaceState({key:3},"","?q=1#h");R.given=here();R.state=history.state.key;done()</script>`);
    case "/t/chunks": return page("chunks", `<script src="/t/c/main.js"></script>`);
    case "/t/modules": return page("modules", `<script type="module" src="/t/c/m0.mjs"></script>`);
    case "/t/ads": return page("ads", `<ins class="adsbygoogle" id="slot" style="display:block;height:90px"></ins>
      <script>let n=0;const fin=()=>{if(++n===4){R.hidden=getComputedStyle(document.getElementById("slot")).display==="none";R.ga=typeof window.adsbygoogle;done()}};setTimeout(()=>{if(n<4){R.timeout=true;n=3;fin()}},6000)</script>
      <script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" onload="R.script='loaded';fin()" onerror="R.script='error';fin()"></script>
      <img src="https://ad.doubleclick.net/ddm/px.gif" onload="R.img=this.naturalWidth;fin()" onerror="R.img='error';fin()">
      <iframe id="adf" src="https://googleads.g.doubleclick.net/pagead/ads?client=x" width="300" height="250" onload="fin()"></iframe>
      <script>fetch("https://www.google-analytics.com/g/collect?v=2",{method:"POST",body:"x"}).then(r=>{R.beacon=r.status}).catch(()=>{R.beacon="error"}).finally(fin)</script>`);
    case "/t/adlink": return page("adlink", `<a id="l" href="https://www.googletagmanager.com/">a tracker's own site</a><script>R.ready=true;done()</script>`);
    case "/t/login": { // a sign-in form; ?fail keeps the form up with "Wrong password"
      const ok = !u.searchParams.has("fail");
      return page("login", `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password"><button id="go">Sign in</button></form><p id="msg"></p>
      <script>document.getElementById("f").onsubmit=(e)=>{e.preventDefault();${ok ? `const n=document.getElementById("u").value;document.getElementById("f").remove();document.getElementById("msg").textContent="Welcome "+n` : `document.getElementById("msg").textContent="Wrong password"`}};R.ready=true;done()</script>`);
    }
    case "/t/undef": return page("undef", `<p>about to go somewhere undefined</p><script src="/t/undef.js"></script>`);
    case "/undefined": return page("undefined", `<h1>nothing here</h1>`);
    case "/t/undef.js": return js(`const cfg = {};\nsetTimeout(function goNext() { location.href = "/" + cfg.next; }, 300);`);
    case "/t/cf": // acts like Cloudflare turning away our server's own (fast mode) fetches, told apart by their Accept-Encoding
      if (req.headers["accept-encoding"] === "gzip, deflate, br") { res.writeHead(403, { "content-type": "text/html", "cf-mitigated": "challenge" }); return res.end("<title>Just a moment...</title>"); }
      return page("cf", `<script>R.ok=true;done()</script>`);
    case "/t/bigheaders": {
      const cookies = Array.from({ length: 40 }, (_, i) => `big${i}=${"x".repeat(900)}; Path=/; Max-Age=3`);
      res.writeHead(200, { "content-type": "text/html", "set-cookie": cookies });
      return res.end(`<!doctype html><html><head><title>big</title></head><body><pre id="r">waiting</pre><script>document.getElementById("r").textContent=JSON.stringify({n:document.cookie.split("; ").filter(c=>c.startsWith("big")).length})</script></body></html>`);
    }
    case "/t/blank": res.writeHead(200, { "content-type": "text/html" }); return res.end(`<!doctype html><html><head><title>blank</title></head><body><script>for(let i=0;i<3;i++)setTimeout(()=>{throw new Error("broken "+i)},10)</script></body></html>`);
    case "/t/worker": return page("worker", `<script>const w=new Worker("/t/w.js");w.onmessage=e=>{R.worker=e.data;done()};w.onerror=e=>{R.worker="error "+e.message;done()}</script>`);
    case "/t/w.js": return js(`fetch("/api").then(r=>r.json()).then(j=>postMessage("fetched:"+location.host)).catch(e=>postMessage("err "+e))`);
    case "/t/form": return page("form", `<form id="fm" method="POST" action="/t/echo"><input name="who" value="william"><input name="n" value="42"></form><script>setTimeout(()=>document.getElementById("fm").submit(),50)</script>`);
    case "/t/echo": {
      const reply = (b) => page("echo", `<script>R.method=${JSON.stringify(req.method)};R.body=${JSON.stringify(b)};done()</script>`);
      if (req.h2cBody) return req.h2cBody.then(reply);
      let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => reply(b)); return;
    }
    case "/t/redirect": res.writeHead(302, { location: "/t/landed" }); return res.end();
    case "/t/landed": return page("landed", `<script>R.landed=location.pathname;done()</script>`);
    case "/t/jscookie": return page("jscookie", `<script>document.cookie="jsc=yes; path=/";R.read=document.cookie.includes("jsc=yes");fetch("/api").then(r=>r.json()).then(j=>{R.sent=j.cookie.includes("jsc=yes");done()})</script>`);
    case "/t/storage": return page("storage", `<script>localStorage.setItem("k","v");R.ls=localStorage.getItem("k");R.host=location.host;R.origin=origin;R.url=new URL("/x",location.href).href;done()</script>`);
    case "/t/dynamic": return page("dynamic", `<script>const s=document.createElement("script");s.src="/t/dyn.js";document.head.appendChild(s);import("/t/mod.mjs").then(m=>{R.mod=m.v;if(R.dyn)done()}).catch(e=>{R.mod="err "+e;done()})</script>`);
    case "/t/dyn.js": return js(`R.dyn="dyn ok";if(R.mod)done()`);
    case "/t/mod.mjs": return js(`export const v="module ok";`);
    case "/t/xhr": return page("xhr", `<script>const x=new XMLHttpRequest();x.open("GET","/api");x.onload=()=>{R.xhr=x.status+" "+JSON.parse(x.responseText).cookie.length;done()};x.onerror=()=>{R.xhr="err";done()};x.send()</script>`);
    case "/t/sse": return page("sse", `<script>const es=new EventSource("/t/events");const got=[];es.onmessage=e=>{got.push(e.data);if(got.length===2){es.close();R.sse=got.join(",");done()}};es.onerror=()=>{if(!R.sse){R.sse="error";done()}}</script>`);
    case "/t/events": res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" }); res.write("data: one\n\n"); setTimeout(() => { res.write("data: two\n\n"); }, 300); setTimeout(() => res.end(), 1500); return;
    case "/t/big": return page("big", `<script src="/t/big.js"></script><script>R.big=typeof bigValue==="number"?bigValue:"missing";done()</script>`);
    case "/t/big.js": { let code = "var bigValue=0;"; for (let i = 0; i < 20000; i++) code += `function f${i}(a){return a+${i}}bigValue+=f${i}(1)-${i};\n`; return js(code); }
  }
  res.writeHead(404); res.end("nope");
}
/* A pretend OpenAI-compatible API for the AI app (ai.test.mjs): the server is
   started with AI_BASE_URL pointing here and AI_API_KEY=test-ai-key. It streams
   "Hello **there**" plus a code block and what you said; "fail" in your message
   gets a 500, "slow" streams slowly. /v1/_last shows the last request it got. */
let aiLast = null;
/* ---- a pretend SoundCloud (/sc/ API, /sc-cdn/ audio), Deezer (/dz/) and Audius (/au/ API,
   /au-node/ its content servers) for the music tests ---- */
// 10 s of silent MP3 (MPEG-1 layer III, 128 kb/s, 44.1 kHz): 383 frames of 417 bytes
const MP3_FRAME = Buffer.alloc(417);
MP3_FRAME.set([0xff, 0xfb, 0x90, 0x64]);
const MP3 = Buffer.concat(Array.from({ length: 383 }, () => MP3_FRAME));
const PIECES = [0, 96, 192, 288, 383].map((f) => f * 417); // the HLS version: 4 pieces on frame boundaries
const mediaCalls = {};
function musicMock(req, res, u) {
  const origin = `http://${req.headers.host}`;
  const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const tc = (id, protocol, mime, extra = {}) => {
    const preset = mime.includes("mp4") ? "aac_160k" : "mp3_1_0";
    return { url: `${origin}/sc/media/${id}/${protocol}/${preset}`, preset, format: { protocol, mime_type: mime }, quality: "sq", snipped: false, ...extra };
  };
  const track = (id, title, transcodings, extra = {}) => ({ kind: "track", id, title, duration: 10000, full_duration: 10000, policy: "ALLOW", streamable: true, permalink_url: `https://soundcloud.com/test/${id}`, user: { username: "Test Artist" }, playback_count: 1000, track_authorization: `auth-${id}`, media: { transcodings }, ...extra });
  const TRACKS = {
    101: track(101, "Test Song", [tc(101, "hls", "audio/mpeg"), tc(101, "progressive", "audio/mpeg")]),
    102: track(102, "Test Song Pieces", [tc(102, "hls", "audio/mp4; codecs=\"mp4a.40.2\""), tc(102, "hls", "audio/mpeg")]),
    103: track(103, "Test Song Label Version", [tc(103, "ctr-encrypted-hls", "audio/mp4; codecs=\"mp4a.40.2\""), tc(103, "hls", "audio/mpeg")], { policy: "MONETIZE" }),
    104: track(104, "Test Song Preview", [tc(104, "progressive", "audio/mpeg", { snipped: true })], { policy: "SNIP" }),
    105: track(105, "Test Song Stale", [tc(105, "progressive", "audio/mpeg")]),
  };
  if (u.pathname === "/sc-test/stats") return json(200, { mediaCalls, size: MP3.length });
  if (u.pathname === "/dz/search") return json(200, { data: /test/i.test(u.searchParams.get("q") || "") ? [{ id: 7, title: "Test Song", title_short: "Test Song", artist: { name: "Test Artist" }, album: { cover_medium: "" }, duration: 10 }] : [] });
  if (u.pathname.startsWith("/au/")) {
    if (u.searchParams.get("app_name") !== "williesvm") return json(400, { error: "app_name required" });
    const au = (id, title, extra = {}) => ({ id, title, duration: 10, permalink: `/test/${id}`, user: { name: "Audius Artist", handle: "audiusartist" }, artwork: { "480x480": "" }, is_streamable: true, is_stream_gated: false, play_count: 50, ...extra });
    const list = [au("A1", "Test Audius Song"), au("A2", "Test Audius Members Only", { is_stream_gated: true }), au("A3", "Test Audius Sneaky")];
    if (u.pathname === "/au/tracks/search") return json(200, { data: /test/i.test(u.searchParams.get("query") || "") ? list : [] });
    if (u.pathname === "/au/tracks/trending") return json(200, { data: list });
    const m = /^\/au\/tracks\/(\w+)\/stream$/.exec(u.pathname);
    if (!m || !list.some((t) => t.id === m[1])) return json(404, {});
    // A3's content server points into a private network; the real ones redirect once more to the file
    res.writeHead(302, { location: m[1] === "A3" ? "https://127.0.0.1:9/secret.mp3" : `${origin}/au-node/${m[1]}` });
    return res.end();
  }
  if (/^\/au-node\/\w+$/.test(u.pathname)) { res.writeHead(302, { location: `${u.pathname}.mp3?sig=ok` }); return res.end(); }
  if (/^\/au-node\/\w+\.mp3$/.test(u.pathname)) return sendMp3(req, res);
  if (u.pathname.startsWith("/dz/chart/")) return json(200, { data: [{ id: 1, title: "Test Song", title_short: "Test Song", artist: { name: "Test Artist" }, album: { cover_medium: "" }, duration: 10 }] });
  if (u.pathname.startsWith("/sc/")) {
    if (u.searchParams.get("client_id") !== "test-client-id") return json(401, {});
    if (u.pathname === "/sc/search/tracks") return json(200, { collection: /test/i.test(u.searchParams.get("q") || "") ? Object.values(TRACKS) : [] });
    let m = /^\/sc\/tracks\/(\d+)$/.exec(u.pathname);
    if (m) return TRACKS[m[1]] ? json(200, TRACKS[m[1]]) : json(404, {});
    m = /^\/sc\/media\/(\d+)\/([\w-]+)\/(\w+)$/.exec(u.pathname);
    if (!m || !TRACKS[m[1]]) return json(404, {});
    const [, id, protocol, preset] = m;
    if (u.searchParams.get("track_authorization") !== `auth-${id}`) return json(404, {});
    const key = `${id}:${protocol}:${preset}`; // which of a track's streams the server asked for
    mediaCalls[key] = (mediaCalls[key] || 0) + 1;
    if (id === "103") return json(404, {}); // like a label upload: its plain MP3 doesn't answer
    if (preset === "aac_160k") return json(404, {}); // (the MP3 should be picked first anyway)
    const exp = id === "105" && mediaCalls[key] === 1 ? 1 : Date.now() + 3_600_000; // 105's first link has already run out
    return json(200, { url: `${origin}/sc-cdn/${id}.${protocol === "progressive" ? "mp3" : "m3u8"}?exp=${exp}` });
  }
  // the CDN: links carry an expiry, like SoundCloud's signed ones
  if (+u.searchParams.get("exp") < Date.now()) { res.writeHead(403); return res.end("expired"); }
  let m = /^\/sc-cdn\/(\d+)\.m3u8$/.exec(u.pathname);
  if (m) {
    const exp = u.searchParams.get("exp");
    res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
    // the first piece's link is absolute, the rest relative
    return res.end(["#EXTM3U", "#EXT-X-VERSION:6", "#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-TARGETDURATION:3",
      ...PIECES.slice(1).flatMap((_, i) => ["#EXTINF:2.5,", `${i ? "" : origin + "/sc-cdn/"}${m[1]}-p${i}.mp3?exp=${exp}`]), "#EXT-X-ENDLIST"].join("\n"));
  }
  m = /^\/sc-cdn\/(\d+)-p(\d)\.mp3$/.exec(u.pathname);
  if (m) { res.writeHead(200, { "content-type": "audio/mpeg" }); return res.end(MP3.subarray(PIECES[+m[2]], PIECES[+m[2] + 1])); }
  if (/^\/sc-cdn\/\d+\.mp3$/.test(u.pathname)) return sendMp3(req, res);
  res.writeHead(404); res.end();
}
function sendMp3(req, res) {
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (!r) { res.writeHead(200, { "content-type": "audio/mpeg", "content-length": MP3.length, "accept-ranges": "bytes" }); return res.end(MP3); }
  const start = r[1] ? +r[1] : MP3.length - +r[2], end = r[1] && r[2] ? Math.min(+r[2], MP3.length - 1) : MP3.length - 1;
  if (start >= MP3.length) { res.writeHead(416, { "content-range": `bytes */${MP3.length}` }); return res.end(); }
  res.writeHead(206, { "content-type": "audio/mpeg", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${MP3.length}`, "accept-ranges": "bytes" });
  res.end(MP3.subarray(start, end + 1));
}

function aiMock(req, res, u) {
  const json = (status, o) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (u.pathname === "/v1/_last") return json(200, aiLast);
  if (req.headers.authorization !== "Bearer test-ai-key") return json(401, { error: { message: "bad key" } });
  if (u.pathname === "/v1/models") return json(200, { data: [{ id: "text-embedding-3-small" }, { id: "gpt-4o" }, { id: "gpt-4o-mini" }] });
  if (u.pathname !== "/v1/chat/completions" || req.method !== "POST") return json(404, { error: { message: "no" } });
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const b = JSON.parse(body || "{}");
    aiLast = { auth: req.headers.authorization, ...b };
    const said = b.messages?.[b.messages.length - 1]?.content || "";
    if (/fail/.test(said)) return json(500, { error: { message: "mock failure" } });
    res.writeHead(200, { "content-type": "text/event-stream" });
    // replies that act on the site (public/js/ai.js carries the actions out); the
    // chat log comes back as "(From the site…", and what it answers mustn't act
    const act = (o) => `\n[[action ${JSON.stringify(o)}]]`;
    const ACTS = [
      [/play the test song/, ["On it.", act({ do: "music.play", query: "test song" })]],
      [/go synth/, ["Done!", act({ do: "theme.preset", id: "synth" }), act({ do: "todo.add", text: "water plants" }), act({ do: "nope.x" })]],
      [/catch me up/, ["Reading the chat.", act({ do: "chat.read" })]],
      [/think it over/, ["<think>They might like ", `ember${act({ do: "theme.preset", id: "ember" })}`, "\n</think>", "Thought about it."]],
      [/^\(From the site/, [`Summary of ${said.split("\n").length - 1} messages.`, act({ do: "theme.preset", id: "ember" })]],
    ];
    const hit = ACTS.find(([re]) => re.test(said));
    const parts = hit ? hit[1] : /slow/.test(said) ? Array.from({ length: 20 }, (_, i) => `word${i} `) : ["Hello ", "**there**", "\n\n```js\nconsole.log(1)\n```\n", `You said: ${said}`];
    let i = 0;
    const tick = () => {
      if (res.destroyed) return;
      if (i >= parts.length) { res.write("data: [DONE]\n\n"); return res.end(); }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
      setTimeout(tick, /slow/.test(said) ? 300 : 20);
    };
    tick();
  });
}

/* A site whose scripts load more scripts, like a webpack app: main.js adds a1-a2
   and each of those adds its b, so the browser only finds them one level at a
   time (five files, so all fit in the 6 connections allowed to one HTTP/1.1 site). The modules m0-m3 import each other. Nothing is cacheable and every
   file takes CHUNK_DELAY ms, so the waterfall shows (preloading tests). */
const CHUNK_DELAY = +process.env.CHUNK_DELAY || 150;
function chunk(u, res) {
  const name = u.pathname.slice("/t/c/".length);
  const code = {
    "main.js": `window.C=[];for(let i=1;i<=2;i++){const s=document.createElement("script");s.src="/t/c/a"+i+".js";document.head.appendChild(s)}`,
    "m0.mjs": `import {a} from "./m1.mjs";import {b} from "./m2.mjs";R.mods=a+b;R.t=Math.round(performance.now());done();`,
    "m1.mjs": `import {c} from "./m3.mjs";export const a="a"+c;`,
    "m2.mjs": `export const b="b";`,
    "m3.mjs": `export const c="c";`,
  }[name] ?? (/^a[12]\.js$/.test(name) ? `C.push("${name}");{const s=document.createElement("script");s.src="/t/c/b${name.slice(1)}";document.head.appendChild(s)}`
    : /^b[12]\.js$/.test(name) ? `C.push("${name}");if(C.length===4){R.n=C.length;R.t=Math.round(performance.now());done()}` : null);
  if (code == null) { res.writeHead(404); return res.end(); }
  setTimeout(() => { res.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" }); res.end(code); }, CHUNK_DELAY);
}
/* A heavy page for timing: 30 scripts, 10 stylesheets, 20 images, each
   delayed like a real server far away. Assets are cacheable for an hour. */
const DELAY = +process.env.BENCH_DELAY || 60;
const benchJs = (i) => { let c = `window.B=(window.B||0);`; for (let k = 0; k < 400; k++) c += `function b${i}_${k}(x){const o={a:x,b:[x,x+1],c:"s${k}"};return o.a+o.b.length+(o.c.length>0?1:0)}window.B+=b${i}_${k}(${k})>=0?1:0;\n`; return c; };
function bench(u, res) {
  const cache = { "cache-control": "public, max-age=3600" };
  const send = (type, body, extra = {}) => setTimeout(() => { res.writeHead(200, { "content-type": type, ...extra }); res.end(body); }, DELAY);
  const m = u.pathname.match(/^\/bench\/(\w+)(\d*)\.(\w+)$/);
  if (u.pathname === "/bench/" || u.pathname === "/bench/index.html") {
    let h = `<!doctype html><html><head><meta charset="utf-8"><title>bench</title>`;
    for (let i = 0; i < 10; i++) h += `<link rel="stylesheet" href="/bench/s${i}.css">`;
    h += `</head><body><h1>bench</h1>`;
    for (let i = 0; i < 20; i++) h += `<img src="/bench/i${i}.png" width="8" height="8">`;
    for (let i = 0; i < 30; i++) h += `<script src="/bench/j${i}.js"></script>`;
    h += `<script>addEventListener("load",()=>{const d=document.createElement("div");d.id="done";d.textContent=String(window.B);document.body.appendChild(d)})</script></body></html>`;
    return send("text/html", h, { "cache-control": "no-cache" });
  }
  if (m && m[3] === "js") return send("application/javascript", benchJs(m[2]), cache);
  if (m && m[3] === "css") return send("text/css", `.c${m[2]}{color:red}` + ".x{margin:0}".repeat(2000), cache);
  if (m && m[3] === "png") return send("image/png", PNG, cache);
  res.writeHead(404); res.end();
}
const srv = http.createServer(handler);
// libcurl asks for "Upgrade: h2c" on plain http; only real WebSocket upgrades go to ws
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws) => ws.on("message", (m) => ws.send("echo:" + m)));
srv.on("upgrade", (req, sock, head) => {
  if (String(req.headers.upgrade).toLowerCase() === "websocket" && req.url === "/ws") return wss.handleUpgrade(req, sock, head, (ws) => wss.emit("connection", ws, req));
  // an h2c upgrade request's body arrives in `head` and on the socket, not as req data
  const want = Number(req.headers["content-length"] || 0);
  req.h2cBody = new Promise((resolve) => {
    let buf = Buffer.from(head || []);
    if (buf.length >= want) return resolve(buf.toString());
    sock.on("data", (d) => { buf = Buffer.concat([buf, d]); if (buf.length >= want) resolve(buf.toString()); });
  });
  const res = new http.ServerResponse(req);
  res.shouldKeepAlive = false;
  res.assignSocket(sock);
  res.on("finish", () => sock.end());
  handler(req, res);
});
srv.listen(PORT, "127.0.0.1", () => console.log("site on", PORT));
