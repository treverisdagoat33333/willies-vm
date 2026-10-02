/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import express from "express";
import db from "./db.js";

/*
|--------------------------------------------------------------------------
| Owner tools (Admin panel)
|
| View as: the owner signs in as someone else to see what they see. The
| session is read-only (viewOnly() below, and chat refuses anything but
| reading), the owner's own session waits in the `wvm_back` cookie, and the
| person is told the next time they visit.
|--------------------------------------------------------------------------
*/

db.exec(`
  CREATE TABLE IF NOT EXISTS owner_views (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    by       TEXT NOT NULL,
    at       INTEGER NOT NULL,
    told     INTEGER NOT NULL DEFAULT 0
  )
`);

export const VIEW_MS = 2 * 3_600_000; // a view-as session lasts two hours at most
export const BACK_COOKIE = "wvm_back";

/* While viewing as someone, only reading is allowed: these few writes keep the page working. */
const VIEW_OK = new Set(["/api/auth/viewas/stop", "/api/auth/logout", "/api/live/beat", "/api/stats/event", "/api/stats/error"]);
export function viewOnly(session, req) {
  return !!session?.viewedBy && req.method !== "GET" && req.method !== "HEAD" && !VIEW_OK.has(req.path);
}

/* Views the person hasn't been told about yet; telling them marks them. */
export function untoldViews(username) {
  const rows = db.prepare("SELECT at FROM owner_views WHERE username = ? AND told = 0 ORDER BY at").all(username);
  if (rows.length) db.prepare("UPDATE owner_views SET told = 1 WHERE username = ?").run(username);
  return rows.map((r) => r.at);
}

export function ownerToolsRouter({ requireOwner, getUser, getSession, verifyToken, createToken, tokenVersion, cookieOptions, logEvent }) {
  const router = express.Router();

  /* ---- view as ---- */
  router.post("/api/admin/viewas/:username", requireOwner, (req, res) => {
    const name = String(req.params.username || "").toLowerCase();
    const u = getUser(name);
    if (!u) return res.status(404).json({ error: "No such account." });
    if (u.role === "owner") return res.status(400).json({ error: "That's you." });
    const me = req.vmSession.username;
    res.cookie(BACK_COOKIE, req.cookies.vm_session, { ...cookieOptions(), maxAge: VIEW_MS });
    res.cookie("vm_session", createToken({ type: "account", username: name, tv: tokenVersion(name) ?? 0, viewedBy: me }, "2h"), { ...cookieOptions(), maxAge: VIEW_MS });
    db.prepare("INSERT INTO owner_views (username, by, at) VALUES (?, ?, ?)").run(name, me, Date.now());
    logEvent("admin", `${me} is viewing the site as ${name}`);
    res.json({ ok: true });
  });
  router.post("/api/auth/viewas/stop", (req, res) => {
    const back = req.cookies[BACK_COOKIE];
    const s = back ? verifyToken(back) : null;
    res.clearCookie(BACK_COOKIE, cookieOptions());
    // only ever back to an owner session; anything else is just signed out
    if (s?.type === "account" && getUser(s.username)?.role === "owner") res.cookie("vm_session", back, cookieOptions());
    else res.clearCookie("vm_session", cookieOptions());
    res.json({ ok: true });
  });

  return router;
}
