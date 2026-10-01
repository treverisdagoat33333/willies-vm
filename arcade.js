/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * The Arcade: about 1,800 single-file HTML games from the bubbls/ugs-singlefile
 * collection (the list is public/data/arcade.json; console games running ROMs
 * were left out). jsDelivr serves them as text/plain, so they can't be framed
 * from there; /play/arcade/<file> fetches one, adds a small storage shim, and
 * serves it as a page.
 *
 * These are other people's pages, so they never run as our site: the desktop
 * frames them sandboxed without allow-same-origin, which gives them an opaque
 * origin with no access to our cookies, storage or signed-in APIs. Browsers
 * refuse localStorage to such a page, so the shim gives it one in memory,
 * seeded from the address's #arcade= part (a sandboxed frame's window.name is
 * wiped on the way in) and saved back to the desktop by postMessage
 * (js/arcade.js keeps it per game in IndexedDB).
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";

const UPSTREAM = process.env.ARCADE_UPSTREAM || "https://cdn.jsdelivr.net/gh/bubbls/ugs-singlefile/UGS-Files/";
const CACHE_MAX = 48 * 1024 * 1024;

/* runs first in every game: storage that works without an origin */
const SHIM = `<script>(()=>{let d={};const h=location.hash;if(h.startsWith("#arcade=")){try{d=JSON.parse(decodeURIComponent(h.slice(8)))||{}}catch(e){}try{history.replaceState(history.state,"",location.href.split("#")[0])}catch(e){}}
const mk=(keep)=>{const m=new Map(keep?Object.entries(d).map(([k,v])=>[k,String(v)]):[]);let t=0;
const save=()=>{if(!keep)return;clearTimeout(t);t=setTimeout(()=>{try{parent.postMessage({arcadeSave:Object.fromEntries(m)},"*")}catch(e){}},300)};
const s={getItem:k=>m.has(String(k))?m.get(String(k)):null,setItem:(k,v)=>{m.set(String(k),String(v));save()},removeItem:k=>{m.delete(String(k));save()},clear:()=>{m.clear();save()},key:i=>[...m.keys()][i]??null,get length(){return m.size}};
return new Proxy(s,{get:(o,k)=>k in o?(typeof o[k]==="function"?o[k].bind(o):o[k]):typeof k==="string"?o.getItem(k):undefined,set:(o,k,v)=>{o.setItem(k,v);return true},deleteProperty:(o,k)=>{o.removeItem(k);return true},has:(o,k)=>m.has(String(k)),ownKeys:()=>[...m.keys()],getOwnPropertyDescriptor:(o,k)=>m.has(k)?{value:m.get(k),enumerable:true,configurable:true,writable:true}:undefined})};
for(const[n,keep]of[["localStorage",1],["sessionStorage",0]])try{Object.defineProperty(window,n,{value:mk(keep),configurable:true})}catch(e){}
let ck="";try{Object.defineProperty(document,"cookie",{configurable:true,get:()=>ck,set:v=>{const p=String(v).split(";")[0].trim(),k=p.split("=")[0];ck=ck.split("; ").filter(x=>x&&x.split("=")[0]!==k).concat(p).join("; ")}})}catch(e){}
})();</script>`;

function inject(html) {
  // after <head> if there is one, else after the doctype, so quirks mode isn't triggered
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.slice(0, head.index + head[0].length) + SHIM + html.slice(head.index + head[0].length);
  const dt = html.match(/<!doctype[^>]*>/i);
  if (dt) return html.slice(0, dt.index + dt[0].length) + SHIM + html.slice(dt.index + dt[0].length);
  return SHIM + html;
}

export function arcadeRouter({ catalog, limiter = (_q, _s, n) => n() }) {
  let files = new Set();
  try { files = new Set(JSON.parse(fs.readFileSync(catalog, "utf8")).map((g) => g.f)); } catch (e) { console.warn("arcade: no catalog", e.message); }
  const cache = new Map(); // file -> Buffer, oldest first
  let bytes = 0;
  const pending = new Map();

  async function load(f) {
    if (cache.has(f)) { const b = cache.get(f); cache.delete(f); cache.set(f, b); return b; }
    if (pending.has(f)) return pending.get(f);
    const p = (async () => {
      const r = await fetch(UPSTREAM + encodeURIComponent(f + ".html"), { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw Object.assign(new Error(`upstream ${r.status}`), { status: r.status === 404 ? 404 : 502 });
      const buf = Buffer.from(inject(await r.text()), "utf8");
      while (bytes + buf.length > CACHE_MAX && cache.size) { const [k, v] = cache.entries().next().value; cache.delete(k); bytes -= v.length; }
      if (buf.length < CACHE_MAX / 4) { cache.set(f, buf); bytes += buf.length; }
      return buf;
    })().finally(() => pending.delete(f));
    pending.set(f, p);
    return p;
  }

  const r = express.Router();
  r.get("/play/arcade/:file", limiter, async (req, res) => {
    const f = req.params.file;
    if (!files.has(f)) return res.status(404).type("text/plain").send("No such game.");
    try {
      const buf = await load(f);
      res.set({
        "Content-Type": "text/html; charset=utf-8",
        // the game's own scripts and pictures come from other sites: allowed, without cookies
        "Cross-Origin-Embedder-Policy": "credentialless",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      });
      res.send(buf);
    } catch (e) {
      res.status(e.status || 502).type("text/plain").send("This game couldn't be loaded right now.");
    }
  });
  return r;
}

export const ARCADE_CATALOG = (publicDir) => path.join(publicDir, "data", "arcade.json");
