/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { EMOJI_DIR, listEmojis, getEmoji, addEmoji, removeEmoji, getUser, RANK, rankOf } from "./db.js";
import { tellEveryone } from "./chat.js";
import { censor } from "./profanity.js";

/*
|--------------------------------------------------------------------------
| Custom emoji
|
|   GET    /api/emoji            -> [{name, by, createdAt}]
|   GET    /api/emoji/<name>     the picture
|   POST   /api/emoji?name=<n>   (admins and the owner; the picture is the body)
|   DELETE /api/emoji/<name>     (admins and the owner)
|
| Used in chat as :name: in messages and as reactions. Only small PNG, GIF,
| WebP and JPEG pictures, read from their first bytes; everyone connected is
| told when the list changes.
|--------------------------------------------------------------------------
*/

const MAX_BYTES = 256 * 1024;
const MAX_EMOJI = 200;
const NAME_RE = /^[a-z0-9_]{2,32}$/;

function sniff(b) {
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString("latin1", 0, 6))) return "image/gif";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}
const fileOf = (name) => path.join(EMOJI_DIR, name);

export function emojiRouter({ requireSession, requireAccount }) {
  const router = express.Router();
  const mayManage = (req) => rankOf(getUser(req.vmSession.username)?.role) >= RANK.admin;
  const changed = () => tellEveryone({ type: "emojis", emojis: listEmojis() });

  router.get("/", requireSession, (_req, res) => res.json(listEmojis()));

  router.get("/:name", (req, res) => {
    const name = String(req.params.name || "");
    const e = NAME_RE.test(name) ? getEmoji(name) : null;
    if (!e) return res.status(404).end();
    res.set({ "Content-Type": e.type, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "public, max-age=300" });
    res.sendFile(fileOf(name), (err) => { if (err && !res.headersSent) res.status(404).end(); });
  });

  router.post("/", requireAccount, express.raw({ type: () => true, limit: MAX_BYTES }), (req, res) => {
    if (!mayManage(req)) return res.status(403).json({ error: "Only admins can add emoji." });
    const name = String(req.query.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!NAME_RE.test(name)) return res.status(400).json({ error: "Names are 2 to 32 letters, numbers or _." });
    if (censor(name.replace(/_/g, " ")).hit) return res.status(400).json({ error: "Pick a different name." });
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const type = sniff(body);
    if (!type) return res.status(415).json({ error: "Emoji must be a PNG, GIF, WebP or JPEG picture." });
    if (!getEmoji(name) && listEmojis().length >= MAX_EMOJI) return res.status(400).json({ error: `There can be up to ${MAX_EMOJI} emoji.` });
    fs.writeFile(fileOf(name), body, (err) => {
      if (err) return res.status(500).json({ error: "Couldn't save it." });
      addEmoji(name, type, req.vmSession.username);
      changed();
      res.json({ name });
    });
  });

  router.delete("/:name", requireAccount, (req, res) => {
    if (!mayManage(req)) return res.status(403).json({ error: "Only admins can remove emoji." });
    const name = String(req.params.name || "");
    if (!NAME_RE.test(name) || !removeEmoji(name)) return res.status(404).json({ error: "No emoji by that name." });
    fs.rm(fileOf(name), { force: true }, () => {});
    changed();
    res.json({ ok: true });
  });

  router.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Emoji pictures can be up to 256 KB." });
    res.status(400).json({ error: "Couldn't read that upload." });
  });
  return router;
}
