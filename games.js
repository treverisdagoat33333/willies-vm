/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * Your own HTML games: anything in public/games/ shows up in the Games panel
 * and the Apps launcher, and plays in a window on the desktop.
 *
 *   public/games/<name>/index.html   a game with its own files next to it
 *   public/games/<name>.html         a game that's one file
 *
 * A folder may also hold a cover picture (cover, thumbnail, icon or logo; png,
 * jpg, webp or gif) and a game.json with {"title", "description"}. Without
 * them the title comes from the page's <title>, or the folder's name.
 *
 * Games are served with COEP credentialless instead of require-corp, so one
 * that loads its scripts or pictures from another site (a CDN) still works.
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";

const COVERS = ["cover", "thumbnail", "thumb", "icon", "logo", "preview"];
const IMG = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

const pretty = (s) => s.replace(/\.html?$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
const titleOf = (file) => {
  try {
    const head = fs.readFileSync(file, "utf8").slice(0, 20000);
    const t = head.match(/<title[^>]*>([^<]{1,80})<\/title>/i)?.[1];
    return t ? t.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim() : "";
  } catch { return ""; }
};

export function scanGames(dir) {
  let names;
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const games = [];
  for (const d of names) {
    if (d.name.startsWith(".") || d.name.startsWith("_")) continue;
    if (d.isFile() && /\.html?$/i.test(d.name)) {
      const file = path.join(dir, d.name);
      games.push({ id: d.name, title: titleOf(file) || pretty(d.name), url: `/games/${encodeURIComponent(d.name)}`, cover: null, description: "" });
      continue;
    }
    if (!d.isDirectory()) continue;
    const folder = path.join(dir, d.name);
    let files;
    try { files = fs.readdirSync(folder); } catch { continue; }
    const index = files.find((f) => /^index\.html?$/i.test(f)) || files.find((f) => /\.html?$/i.test(f));
    if (!index) continue;
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(folder, "game.json"), "utf8")) || {}; } catch {}
    const cover = COVERS.flatMap((c) => IMG.map((e) => c + e)).find((c) => files.some((f) => f.toLowerCase() === c));
    const coverFile = cover && files.find((f) => f.toLowerCase() === cover);
    const base = `/games/${encodeURIComponent(d.name)}/`;
    games.push({
      id: d.name,
      title: String(meta.title || "").slice(0, 80) || titleOf(path.join(folder, index)) || pretty(d.name),
      description: String(meta.description || "").slice(0, 200),
      url: base + encodeURIComponent(index),
      cover: coverFile ? base + encodeURIComponent(coverFile) : null,
    });
  }
  return games.sort((a, b) => a.title.localeCompare(b.title));
}

export function gamesRouter(dir) {
  const r = express.Router();
  r.get("/api/games/local", (_req, res) => res.set("Cache-Control", "no-cache").json({ games: scanGames(dir) }));
  // the games themselves: other sites' files allowed (without cookies), see above
  r.use("/games/", (_req, res, next) => { res.setHeader("Cross-Origin-Embedder-Policy", "credentialless"); next(); });
  return r;
}
