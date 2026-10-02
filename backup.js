/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * Owner backups. Render's free plan wipes the database on every deploy, so
 * the owner can download everything that matters as one JSON file and load
 * it back after a wipe. Uploaded file bytes aren't included (they'd make the
 * backup huge); messages keep their text and lose the attachment.
 */
import express from "express";
import db from "./db.js";

// in restore order: messages before the reactions that point at them
const TABLES = ["users", "channels", "messages", "reactions", "sanctions", "user_settings", "stats"];
const VERSION = 1;

const exists = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
const columns = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

export function exportBackup() {
  const tables = {};
  for (const t of TABLES) {
    if (!exists(t)) continue;
    let rows = db.prepare(`SELECT * FROM ${t}`).all();
    if (t === "messages") {
      rows = rows.filter((m) => !m.deleted && String(m.text || "").trim()).map((m) => ({ ...m, file_id: null }));
    }
    tables[t] = rows;
  }
  return { app: "willies-vm", version: VERSION, at: Date.now(), tables };
}

/* Replaces those tables with the backup's rows, all or nothing. Only columns
   the current database has are written, so an older backup still loads. */
export function restoreBackup(data) {
  if (!data || data.app !== "willies-vm" || typeof data.tables !== "object") throw new Error("That isn't a Willie OS backup.");
  if (data.version > VERSION) throw new Error("That backup is from a newer version of the site.");
  const counts = {};
  db.exec("BEGIN");
  try {
    for (const t of [...TABLES].reverse()) if (exists(t) && Array.isArray(data.tables[t])) db.exec(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      const rows = data.tables[t];
      if (!exists(t) || !Array.isArray(rows)) continue;
      const have = new Set(columns(t));
      let n = 0;
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const cols = Object.keys(row).filter((c) => have.has(c));
        if (!cols.length) continue;
        const vals = cols.map((c) => {
          const v = row[c];
          return v === null || typeof v === "number" || typeof v === "string" ? v : JSON.stringify(v);
        });
        db.prepare(`INSERT OR REPLACE INTO ${t} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals);
        n++;
      }
      counts[t] = n;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw new Error(`Restore failed, nothing was changed: ${e.message}`);
  }
  return counts;
}

export function backupRouter({ requireOwner, onRestored = () => {} }) {
  const r = express.Router();
  r.get("/", requireOwner, (_req, res) => {
    const day = new Date().toISOString().slice(0, 10);
    res.set("Content-Disposition", `attachment; filename="willies-vm-backup-${day}.json"`);
    res.set("Cache-Control", "no-store");
    res.type("application/json").send(JSON.stringify(exportBackup()));
  });
  // sent as text so the site-wide JSON parser (100 KB) leaves it alone
  r.post("/", requireOwner, express.text({ type: "text/plain", limit: "60mb" }), (req, res) => {
    let data;
    try { data = JSON.parse(req.body); } catch { return res.status(400).json({ error: "That file isn't valid JSON." }); }
    try {
      const counts = restoreBackup(data);
      onRestored();
      res.json({ ok: true, counts });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  return r;
}
