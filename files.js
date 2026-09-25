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
import { FILES_DIR, addFile, getFile, messageAlive, staleFiles, oldestFiles, fileBytes, deleteFileRecord } from "./db.js";
import { censor } from "./profanity.js";

/*
|--------------------------------------------------------------------------
| Pictures and files in chat
|
|   POST /api/chat/files?channel=<slug>&name=<file name>   (the file is the body)
|        -> {id, name, size, image, w, h}; then a chat message carries {file: id}
|   GET  /api/chat/files/<id>[?download=1]
|
| Accounts upload, into a channel they may post in; anyone who may read the
| channel (only the two people, for a DM) may fetch it. What the file *is* is
| read from its first bytes, never trusted from its name: only PNG, JPEG, GIF
| and WebP show as pictures, and everything else is served as a download
| (octet-stream, nosniff, a sandboxing CSP), so nothing uploaded can run as a
| page on our site. Program files aren't taken at all.
|
| The bytes live in DATA_DIR/files/<id> (wiped with the database on Render's
| free plan). A sweep clears uploads never sent and files whose message was
| deleted, and the oldest files go once they add up to MAX_TOTAL.
|--------------------------------------------------------------------------
*/

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL = 400 * 1024 * 1024;
const PER_HOUR = 60 * 1024 * 1024; // bytes one person may upload in an hour
const UNSENT_MS = 15 * 60_000; // an upload not sent in a message by then is dropped
const BLOCKED = /\.(exe|msi|bat|cmd|com|scr|pif|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|jar|apk|dll|lnk|reg|cpl|msc|app|dmg|pkg|sh)$/i;
const ID_RE = /^[a-f0-9]{24}$/;

/* The picture type from the first bytes, or null. */
function sniffImage(b) {
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString("latin1", 0, 6))) return "image/gif";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/* Width and height, so the chat can leave the right space before the picture loads. */
function imageSize(b, type) {
  try {
    if (type === "image/png") return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (type === "image/gif") return [b.readUInt16LE(6), b.readUInt16LE(8)];
    if (type === "image/webp") {
      const kind = b.toString("latin1", 12, 16);
      if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
      if (kind === "VP8L") { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
      if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    }
    if (type === "image/jpeg") {
      for (let i = 2; i + 9 < b.length; ) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (_) {}
  return [null, null];
}

function cleanName(raw) {
  let name = path.basename(String(raw || "").replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f"<>]/g, "").trim().slice(0, 100);
  if (!name || name === "." || name === "..") name = "file";
  return censor(name).text;
}

const fileOf = (id) => path.join(FILES_DIR, id);
function removeFile(id) {
  deleteFileRecord(id);
  fs.rm(fileOf(id), { force: true }, () => {});
}
/* never-sent uploads, files of deleted messages, and the oldest past the total */
export function sweepFiles() {
  for (const id of staleFiles(Date.now() - UNSENT_MS)) removeFile(id);
  let total = fileBytes();
  while (total > MAX_TOTAL) {
    const batch = oldestFiles();
    if (!batch.length) break;
    for (const f of batch) {
      if (total <= MAX_TOTAL) break;
      removeFile(f.id);
      total -= f.size;
    }
  }
}

export function filesRouter({ requireSession, requireAccount, limiter, mayPost, mayRead }) {
  const router = express.Router();
  const hourly = new Map(); // username -> { at, bytes }
  const sweep = setInterval(sweepFiles, 60_000);
  sweep.unref?.();

  router.post(
    "/",
    requireAccount,
    limiter,
    express.raw({ type: () => true, limit: MAX_BYTES }),
    (req, res) => {
      const username = req.vmSession.username;
      const channel = String(req.query.channel || "");
      const name = cleanName(req.query.name);
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!mayPost(username, channel)) return res.status(403).json({ error: "You can't post in that channel." });
      if (!body.length) return res.status(400).json({ error: "That file is empty." });
      if (BLOCKED.test(name)) return res.status(415).json({ error: "Programs and scripts can't be shared here." });
      const now = Date.now();
      let h = hourly.get(username);
      if (!h || now - h.at > 3_600_000) hourly.set(username, (h = { at: now, bytes: 0 }));
      if (h.bytes + body.length > PER_HOUR) return res.status(429).json({ error: "You've shared a lot of files this hour. Try again later." });
      h.bytes += body.length;

      const image = sniffImage(body);
      const [w, hgt] = image ? imageSize(body, image) : [null, null];
      const id = crypto.randomBytes(12).toString("hex");
      fs.writeFile(fileOf(id), body, (err) => {
        if (err) return res.status(500).json({ error: "Couldn't save the file." });
        addFile({ id, username, channel, name, type: image || "application/octet-stream", size: body.length, width: w, height: hgt });
        if (fileBytes() > MAX_TOTAL) sweepFiles();
        res.json({ id, name, size: body.length, image: !!image, w, h: hgt });
      });
    }
  );

  router.get("/:id", requireSession, (req, res) => {
    const id = String(req.params.id || "");
    const f = ID_RE.test(id) ? getFile(id) : null;
    const mine = req.vmSession.type === "account" && f?.username === req.vmSession.username;
    // not sent yet: only the person who uploaded it; sent: whoever can read the channel, while the message lives
    if (!f || !mayRead(req.vmSession, f.channel) || (f.message_id == null ? !mine : !messageAlive(f.message_id))) {
      return res.status(404).json({ error: "That file isn't available." });
    }
    const inline = f.type.startsWith("image/") && req.query.download == null;
    res.set({
      "Content-Type": f.type.startsWith("image/") ? f.type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "private, no-cache", // asked again each time (a cheap 304), so a deleted file is gone for everyone
    });
    res.sendFile(fileOf(f.id), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "That file isn't available." });
    });
  });

  // a file over the size limit (express.raw), in words
  router.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ error: `Files can be up to ${MAX_BYTES / 1024 / 1024} MB.` });
    res.status(400).json({ error: "Couldn't read that upload." });
  });
  return router;
}
