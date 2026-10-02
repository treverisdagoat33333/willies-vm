/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import crypto from "node:crypto";
import db from "./db.js";

/*
|--------------------------------------------------------------------------
| Site bans (Admin panel)
|
| A ban is on an IP address, an account or a device, and is either the whole
| site or only making new accounts ("signup"). A device is a random id in the
| long-lived httpOnly `wvm_dev` cookie; clearing cookies gets rid of it, so a
| device ban is best paired with an IP ban. Bans can run out (`until`).
|
| The checks are in-process and cheap: the active list is kept in memory and
| refreshed when it changes.
|--------------------------------------------------------------------------
*/

db.exec(`
  CREATE TABLE IF NOT EXISTS site_bans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,
    value      TEXT NOT NULL,
    scope      TEXT NOT NULL DEFAULT 'site',
    until      INTEGER,
    reason     TEXT NOT NULL DEFAULT '',
    label      TEXT NOT NULL DEFAULT '',
    by         TEXT,
    created_at INTEGER NOT NULL
  )
`);
// where each account was last seen, so the owner can ban the IP or device behind it
for (const [col, decl] of [["last_ip", "TEXT"], ["last_device", "TEXT"]]) {
  if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${decl}`);
}

export const KINDS = ["ip", "user", "device"];
export const SCOPES = ["site", "signup"];
let active = [];
function reload() {
  db.prepare("DELETE FROM site_bans WHERE until IS NOT NULL AND until <= ?").run(Date.now());
  active = db.prepare("SELECT * FROM site_bans ORDER BY id DESC").all();
}
reload();
setInterval(reload, 60_000).unref?.(); // timed bans run out

export function listBans() {
  reload();
  return active.map((b) => ({ id: b.id, kind: b.kind, value: b.value, scope: b.scope, until: b.until, reason: b.reason, label: b.label, by: b.by, createdAt: b.created_at }));
}
export function addBan({ kind, value, scope = "site", hours = null, reason = "", label = "", by }) {
  if (!KINDS.includes(kind) || !SCOPES.includes(scope) || !value) return null;
  const until = hours ? Date.now() + hours * 3_600_000 : null;
  const row = db.prepare("INSERT INTO site_bans (kind, value, scope, until, reason, label, by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(kind, String(value), scope, until, String(reason).slice(0, 200), String(label).slice(0, 80), by, Date.now());
  reload();
  return Number(row.lastInsertRowid);
}
export function removeBan(id) {
  const n = db.prepare("DELETE FROM site_bans WHERE id = ?").run(Number(id)).changes;
  reload();
  return n > 0;
}

/* The ban that applies to this visitor, if any. `scope` "signup" also counts site bans. */
export function banFor({ ip, user, device }, scope = "site") {
  const now = Date.now();
  return active.find((b) => (b.until == null || b.until > now) && (scope === "signup" || b.scope === "site") &&
    ((b.kind === "ip" && b.value === ip) || (b.kind === "user" && user && b.value === user) || (b.kind === "device" && device && b.value === device))) || null;
}

/* Every visitor gets a device id cookie (two years). */
export const DEVICE_COOKIE = "wvm_dev";
const DEVICE_RE = /^[a-f0-9]{32}$/;
export function deviceOf(req, res) {
  let id = req.cookies?.[DEVICE_COOKIE];
  if (!DEVICE_RE.test(id || "")) {
    id = crypto.randomBytes(16).toString("hex");
    res?.cookie(DEVICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 2 * 365 * 86_400_000 });
  }
  return id;
}
export function deviceFromCookieHeader(header) {
  const m = /(?:^|;\s*)wvm_dev=([a-f0-9]{32})/.exec(header || "");
  return m ? m[1] : null;
}

export function seenAt(username, ip, device) {
  db.prepare("UPDATE users SET last_ip = ?, last_device = ? WHERE username = ?").run(ip, device, username);
}
export function lastSeenFrom(username) {
  const r = db.prepare("SELECT last_ip, last_device FROM users WHERE username = ?").get(username);
  return r ? { ip: r.last_ip, device: r.last_device } : null;
}

export const untilText = (b) => (b.until ? `until ${new Date(b.until).toUTCString()}` : "for good");
export function bannedPage(b) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banned</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#eee;font:16px system-ui,sans-serif}main{max-width:440px;padding:24px;text-align:center}h1{font-size:1.6em;margin:0 0 8px}p{color:#aaa;line-height:1.5}</style></head>
<body><main><h1>You're banned from Willie OS</h1><p>This ${b.kind === "ip" ? "network" : b.kind === "device" ? "device" : "account"} can't use the site ${untilText(b)}.</p>${b.reason ? `<p>Reason: ${String(b.reason).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</p>` : ""}</main></body></html>`;
}
