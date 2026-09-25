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
