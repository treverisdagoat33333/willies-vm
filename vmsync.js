/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import fs from "node:fs";
import path from "node:path";
import { DRIVE_DIR, driveDb } from "./db.js";
import { saveToDrive } from "./drive.js";

/*
|--------------------------------------------------------------------------
| Files ↔ VM #4 (server.js)
|
| The owner's Files app shows up on the VM's desktop as a "Files" folder: it's
| copied in when the VM starts, and anything added or changed in it goes back
| every minute. When the VM closes (or its time runs out), everything made in
| its home folder is saved to Files › VM #4 too, since the VM itself is wiped.
| Deleting a file in the VM doesn't delete it from Files.
|--------------------------------------------------------------------------
*/

export const FILES_DIR = "/home/user/Desktop/Files";
const HOME = "/home/user";
const PULL_MAX = 150 * 1024 * 1024; // what's copied into the VM at start
const PUSH_FILES = 200;             // files saved back per sync
const MARK = "/tmp/.wvm-files-mark", START = "/tmp/.wvm-start-mark";
// what a home-folder save leaves out: settings, caches, installed packages, the Files folder itself
const SKIP = ["*/.*", "*/node_modules/*", "*/__pycache__/*", "*/venv/*", "*/site-packages/*", "*/target/*", "*/Desktop/*.desktop", FILES_DIR + "/*"];

const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const run = (box, cmd, ms = 30_000) => box.commands.run(cmd, { timeoutMs: ms }).catch((e) => e);

/* Copies the owner's Files into the VM. Newest first, up to PULL_MAX, so a full Files
   doesn't hold up the start; then marks the time, so only later changes go back. */
export async function pullFiles(box, user) {
  await run(box, `mkdir -p ${q(FILES_DIR)}`);
  const files = driveDb.list(user).sort((a, b) => b.updated_at - a.updated_at);
  let total = 0;
  const batch = [];
  for (const f of files) {
    if (total + f.size > PULL_MAX) continue;
    let data;
    try { data = await fs.promises.readFile(path.join(DRIVE_DIR, f.id)); } catch (_) { continue; }
    total += f.size;
    const dir = f.folder === "/" ? FILES_DIR : FILES_DIR + f.folder;
    batch.push({ path: `${dir}/${f.name}`, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
    if (batch.length >= 20) await box.files.write(batch.splice(0)).catch(() => {});
  }
  if (batch.length) await box.files.write(batch).catch(() => {});
  await run(box, `touch ${MARK} ${START}`);
  return { copied: files.length, bytes: total };
}

/* Saves files under `src` changed since `mark` into Files under `dest`, same sub-folders. */
async function push(box, user, src, dest, mark, skip) {
  // the next mark is set before looking, so a file written mid-sync is caught next time
  await run(box, `touch ${mark}.next`);
  const not = skip.map((p) => `-not -path ${q(p)}`).join(" ");
  const r = await run(box, `[ -d ${q(src)} ] && find ${q(src)} -type f -newer ${mark} -size -25M ${not} -printf '%P\\n' 2>/dev/null | head -n ${PUSH_FILES}`);
  const saved = [];
  for (const rel of String(r?.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean)) {
    try {
      const bytes = await box.files.read(`${src}/${rel}`, { format: "bytes" });
      const parts = rel.split("/"), name = parts.pop();
      // Files folders go 6 deep at most
      const folder = (dest === "/" ? "" : dest) + (parts.length ? "/" + parts.slice(0, dest === "/" ? 6 : 5).join("/") : "") || "/";
      await saveToDrive(user, folder, name, Buffer.from(bytes));
      saved.push(rel);
    } catch (_) { /* too big, Files full, or gone already */ }
  }
  await run(box, `mv -f ${mark}.next ${mark}`);
  return saved;
}

// the desktop Files folder, back into Files (every minute while the VM runs)
export const pushFiles = (box, user) => push(box, user, FILES_DIR, "/", MARK, ["*/.*"]);
// everything else made in the home folder since the VM started, into Files › VM #4 (on close)
export const saveHome = (box, user) => push(box, user, HOME, "/VM #4", START, SKIP);
