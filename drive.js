/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { DRIVE_DIR, driveDb } from "./db.js";

/*
|--------------------------------------------------------------------------
| Files: every account's own cloud storage (the Files app, js/files-app.js)
|
|   GET    /api/drive                  -> {files, folders, used, quota}
|   POST   /api/drive?name=&folder=    (the file is the body)
|   GET    /api/drive/<id>[?download=1]
|   PATCH  /api/drive/<id>             {name?, folder?}  rename or move
|   DELETE /api/drive/<id>
|   POST   /api/drive/folders          {path}
|   DELETE /api/drive/folders?path=    (and everything in it)
|
| Only the account that uploaded a file can see it. What a file is comes from
| its first bytes: pictures, sound, video and plain text show in place; the rest
| download. Every file is sent with nosniff and a sandboxing CSP, so nothing in
| anyone's Files can run as a page on our site. The bytes live in DATA_DIR/drive
| (wiped with the database on Render's free plan).
|--------------------------------------------------------------------------
*/

const QUOTA = Number(process.env.DRIVE_QUOTA_MB || 200) * 1024 * 1024;
const MAX_FILE = 25 * 1024 * 1024;
const ID_RE = /^[a-f0-9]{24}$/;
const fileOf = (id) => path.join(DRIVE_DIR, id);

function sniff(b) {
  const s = (a, z) => b.toString("latin1", a, z);
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && /^GIF8[79]a$/.test(s(0, 6))) return "image/gif";
  if (b.length >= 12 && s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 12 && s(0, 4) === "RIFF" && s(8, 12) === "WAVE") return "audio/wav";
  if (b.length >= 4 && s(0, 4) === "OggS") return "audio/ogg";
  if (b.length >= 3 && (s(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return "audio/mpeg";
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3) return "video/webm";
  if (b.length >= 12 && s(4, 8) === "ftyp") return /^(M4A |M4B )/.test(s(8, 12)) ? "audio/mp4" : "video/mp4";
  if (b.length >= 5 && s(0, 5) === "%PDF-") return "application/pdf";
  // text: valid UTF-8 with no control characters in the first part
  const head = b.subarray(0, 4096);
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(head.length < b.length ? head.subarray(0, head.length - 4) : head);
    if (!/[\u0000-\u0008\u000e-\u001f]/.test(t)) return "text/plain";
  } catch (_) {}
  return "application/octet-stream";
}
const cleanName = (raw) => {
  let n = path.basename(String(raw || "").replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f"<>/]/g, "").trim().slice(0, 120);
  return !n || n === "." || n === ".." ? "file" : n;
};
// "/School/Maths": slash-separated names, no dots or empty parts, at most 6 deep
const cleanFolder = (raw) => {
  const parts = String(raw || "/").split("/").map((p) => p.replace(/[\u0000-\u001f\u007f"<>\\]/g, "").trim().slice(0, 60)).filter((p) => p && p !== "." && p !== "..");
  return parts.length > 6 ? null : "/" + parts.join("/");
};
const shape = (f) => ({ id: f.id, name: f.name, folder: f.folder, type: f.type, size: f.size, createdAt: f.created_at, updatedAt: f.updated_at });

export function driveRouter({ requireAccount, limiter }) {
  const router = express.Router();
  const me = (req) => req.vmSession.username;

  router.get("/", requireAccount, (req, res) => {
    const u = me(req);
    res.set("Cache-Control", "no-store").json({ files: driveDb.list(u).map(shape), folders: driveDb.folders(u), used: driveDb.used(u), quota: QUOTA });
  });

  router.post("/folders", requireAccount, express.json(), (req, res) => {
    const p = cleanFolder(req.body?.path);
    if (!p || p === "/") return res.status(400).json({ error: "That isn't a folder name." });
    // every folder above it too, so it shows in the tree
    const parts = p.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) driveDb.addFolder(me(req), "/" + parts.slice(0, i).join("/"));
    res.json({ path: p });
  });

  router.delete("/folders", requireAccount, (req, res) => {
    const p = cleanFolder(req.query.path);
    if (!p || p === "/") return res.status(400).json({ error: "That folder can't be deleted." });
    const u = me(req);
    for (const id of driveDb.inFolder(u, p)) { driveDb.remove(u, id); fs.rm(fileOf(id), { force: true }, () => {}); }
    driveDb.removeFolder(u, p);
    res.json({ ok: true });
  });

  router.post("/", requireAccount, limiter, express.raw({ type: () => true, limit: MAX_FILE }), (req, res) => {
    const u = me(req);
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const folder = cleanFolder(req.query.folder);
    if (!folder) return res.status(400).json({ error: "That folder is too deep." });
    if (!body.length) return res.status(400).json({ error: "That file is empty." });
    if (driveDb.used(u) + body.length > QUOTA) return res.status(507).json({ error: `Your Files are full (${Math.round(QUOTA / 1048576)} MB). Delete something first.` });
    const id = crypto.randomBytes(12).toString("hex");
    const f = { id, username: u, name: cleanName(req.query.name), folder, type: sniff(body), size: body.length };
    fs.writeFile(fileOf(id), body, (err) => {
      if (err) return res.status(500).json({ error: "Couldn't save the file." });
      if (folder !== "/") { const parts = folder.split("/").filter(Boolean); for (let i = 1; i <= parts.length; i++) driveDb.addFolder(u, "/" + parts.slice(0, i).join("/")); }
      driveDb.add(f);
      res.json(shape(driveDb.get(u, id)));
    });
  });

  router.get("/:id", requireAccount, (req, res) => {
    const id = String(req.params.id || "");
    const f = ID_RE.test(id) ? driveDb.get(me(req), id) : null;
    if (!f) return res.status(404).json({ error: "That file isn't here." });
    const shown = /^(image|audio|video)\//.test(f.type) || f.type === "text/plain";
    const inline = shown && req.query.download == null;
    res.set({
      "Content-Type": shown ? (f.type === "text/plain" ? "text/plain; charset=utf-8" : f.type) : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "private, no-cache",
    });
    res.sendFile(fileOf(f.id), (err) => { if (err && !res.headersSent) res.status(404).json({ error: "That file isn't here." }); });
  });

  router.patch("/:id", requireAccount, express.json(), (req, res) => {
    const u = me(req), id = String(req.params.id || "");
    const f = ID_RE.test(id) ? driveDb.get(u, id) : null;
    if (!f) return res.status(404).json({ error: "That file isn't here." });
    const name = req.body?.name != null ? cleanName(req.body.name) : f.name;
    const folder = req.body?.folder != null ? cleanFolder(req.body.folder) : f.folder;
    if (!folder) return res.status(400).json({ error: "That folder is too deep." });
    driveDb.update(u, id, name, folder);
    if (folder !== "/") driveDb.addFolder(u, folder);
    res.json(shape(driveDb.get(u, id)));
  });

  router.delete("/:id", requireAccount, (req, res) => {
    const u = me(req), id = String(req.params.id || "");
    if (!ID_RE.test(id) || !driveDb.get(u, id)) return res.status(404).json({ error: "That file isn't here." });
    driveDb.remove(u, id);
    fs.rm(fileOf(id), { force: true }, () => {});
    res.json({ ok: true });
  });

  router.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ error: `Files can be up to ${MAX_FILE / 1048576} MB each.` });
    res.status(400).json({ error: "Couldn't read that." });
  });
  return router;
}

/* an account deleted: its files go too */
export function forgetDrive(username) {
  for (const id of driveDb.all(username)) fs.rm(fileOf(id), { force: true }, () => {});
  driveDb.forget(username);
}
