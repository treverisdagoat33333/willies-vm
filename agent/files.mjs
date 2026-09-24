/*!
 * william's vm — remote desktop agent: file transfer
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 *
 * Browse, download and upload files on this PC for the Remote PC viewer.
 * Only a viewer that already holds REMOTE_KEY (and owns the site) can reach
 * this, and it could drive the mouse and keyboard anyway.
 *
 * Binary frames in both directions are "WVF1" + uint32 LE transfer id + bytes.
 * Both sides acknowledge bytes as they land and keep at most WINDOW bytes in
 * flight, so a slow side never makes the other buffer a whole file.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const FILE_MAGIC = Buffer.from("WVF1");
const CHUNK = 256 * 1024;
const WINDOW = 4 * 1024 * 1024;
const ACK_EVERY = 1024 * 1024;
const STALL_MS = 60_000;
const MAX_ENTRIES = 1500;
export const MAX_FILE = 4 * 1024 * 1024 * 1024; // 4 GB

export function isFileFrame(buf) {
  return buf.length >= 8 && buf[0] === 0x57 && buf[1] === 0x56 && buf[2] === 0x46 && buf[3] === 0x31;
}

function frame(id, data) {
  const out = Buffer.allocUnsafe(8 + data.length);
  FILE_MAGIC.copy(out, 0);
  out.writeUInt32LE(id >>> 0, 4);
  data.copy(out, 8);
  return out;
}

/* Windows refuses these characters and names; keep uploads saveable. */
export function safeName(name) {
  let n = path.basename(String(name || "").replace(/\\/g, "/"));
  n = n.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = "_" + n;
  if (n.length > 180) {
    const ext = path.extname(n).slice(0, 20);
    n = n.slice(0, 180 - ext.length) + ext;
  }
  return n || "upload";
}

async function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 0; i < 1000; i++) {
    const p = path.join(dir, i ? `${base} (${i})${ext}` : name);
    try {
      await fsp.access(p);
    } catch (_) {
      return p;
    }
  }
  throw new Error("Too many files with that name.");
}

function quickLinks() {
  const home = os.homedir();
  const out = [{ name: "Home", path: home }];
  for (const d of ["Desktop", "Downloads", "Documents", "Pictures", "Music", "Videos"]) {
    const p = path.join(home, d);
    if (fs.existsSync(p)) out.push({ name: d, path: p });
  }
  return out;
}

function roots() {
  if (process.platform !== "win32") return [{ name: "/", dir: true, path: "/" }];
  const out = [];
  for (let c = 67; c <= 90; c++) { // C: to Z:, skipping floppy letters
    const p = String.fromCharCode(c) + ":\\";
    try {
      fs.accessSync(p);
      out.push({ name: p, dir: true, path: p });
    } catch (_) {}
  }
  return out;
}

export function createFileService({ send, sendBinary, bufferedAmount = () => 0 }) {
  const downloads = new Map(); // id -> { acked, sent, cancelled, wake, fh }
  const uploads = new Map(); // id -> { stream, path, size, got, written, lastAck, failed }

  const err = (id, e) => send({ t: "file.err", id, error: String(e?.message || e) });

  async function list(p) {
    p = String(p || "");
    if (!p) return send({ t: "fs.list", path: "", parent: null, entries: roots(), quick: quickLinks() });
    if (!path.isAbsolute(p)) return send({ t: "fs.list", path: p, error: "Use a full path." });
    try {
      const dirents = await fsp.readdir(p, { withFileTypes: true });
      dirents.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
      const entries = [];
      for (const d of dirents.slice(0, MAX_ENTRIES)) {
        const full = path.join(p, d.name);
        let size = 0;
        let mtime = 0;
        let dir = d.isDirectory();
        try {
          const st = await fsp.stat(full); // follows links, so a shortcut to a folder opens it
          size = st.size;
          mtime = st.mtimeMs;
          dir = st.isDirectory();
        } catch (_) {
          if (!d.isFile() && !dir) continue; // broken link or locked system file
        }
        entries.push({ name: d.name, dir, size: dir ? 0 : size, mtime: Math.round(mtime) });
      }
      const parent = path.dirname(p) === p ? "" : path.dirname(p);
      send({ t: "fs.list", path: p, parent, entries, truncated: dirents.length > MAX_ENTRIES, quick: quickLinks() });
    } catch (e) {
      send({ t: "fs.list", path: p, error: e.code === "EACCES" || e.code === "EPERM" ? "Access denied." : e.code === "ENOENT" ? "That folder doesn't exist." : e.message });
    }
  }

  async function download(id, p) {
    if (downloads.has(id)) return;
    let fh = null;
    const t = { acked: 0, sent: 0, cancelled: false, wake: null, lastAckAt: Date.now() };
    downloads.set(id, t);
    try {
      if (!path.isAbsolute(String(p || ""))) throw new Error("Use a full path.");
      const st = await fsp.stat(p);
      if (!st.isFile()) throw new Error("That's not a file.");
      if (st.size > MAX_FILE) throw new Error("Files over 4 GB can't be sent.");
      fh = await fsp.open(p, "r");
      send({ t: "file.start", id, name: path.basename(p), size: st.size });
      const buf = Buffer.allocUnsafe(CHUNK);
      for (;;) {
        while (!t.cancelled && (t.sent - t.acked > WINDOW || bufferedAmount() > WINDOW)) {
          if (Date.now() - t.lastAckAt > STALL_MS) throw new Error("The viewer stopped responding.");
          await new Promise((r) => {
            t.wake = r;
            setTimeout(r, 50);
          });
        }
        if (t.cancelled) return;
        const { bytesRead } = await fh.read(buf, 0, CHUNK, null);
        if (!bytesRead) break;
        sendBinary(frame(id, buf.subarray(0, bytesRead)));
        t.sent += bytesRead;
      }
      send({ t: "file.end", id });
    } catch (e) {
      if (!t.cancelled) err(id, e.code === "EACCES" || e.code === "EPERM" || e.code === "EBUSY" ? "The file is locked or access is denied." : e);
    } finally {
      downloads.delete(id);
      await fh?.close().catch(() => {});
    }
  }

  async function startUpload(m) {
    const id = m.id >>> 0;
    if (uploads.has(id)) return;
    const u = { stream: null, path: "", size: Math.max(0, Number(m.size) || 0), got: 0, written: 0, lastAck: 0, failed: false, ended: false };
    uploads.set(id, u); // chunks may arrive before the file is open; they queue in the stream
    try {
      const dir = String(m.dir || "");
      if (!path.isAbsolute(dir)) throw new Error("Pick a folder to upload into.");
      if (!(await fsp.stat(dir)).isDirectory()) throw new Error("That's not a folder.");
      if (u.size > MAX_FILE) throw new Error("Files over 4 GB can't be sent.");
      u.path = await uniquePath(dir, safeName(m.name));
      u.stream = fs.createWriteStream(u.path, { flags: "wx" });
      u.stream.on("error", (e) => failUpload(id, e));
      for (const chunk of u.early || []) writeChunk(id, u, chunk);
      u.early = null;
      if (u.ended) finishUpload(id);
    } catch (e) {
      failUpload(id, e.code === "EACCES" || e.code === "EPERM" ? "Can't write to that folder." : e);
    }
  }

  function writeChunk(id, u, data) {
    u.stream.write(data, (e) => {
      if (e) return;
      u.written += data.length;
      if (u.written - u.lastAck >= ACK_EVERY || u.written === u.size) {
        u.lastAck = u.written;
        send({ t: "file.ack", id, bytes: u.written });
      }
    });
  }

  function onChunk(id, data) {
    const u = uploads.get(id);
    if (!u || u.failed) return;
    u.got += data.length;
    if (u.got > u.size) return failUpload(id, "Got more data than the file's size.");
    if (!u.stream) (u.early ||= []).push(Buffer.from(data));
    else writeChunk(id, u, data);
  }

  function finishUpload(id) {
    const u = uploads.get(id);
    if (!u || u.failed) return;
    u.ended = true;
    if (!u.stream) return; // still opening; startUpload finishes it
    u.stream.end(() => {
      if (u.failed) return;
      uploads.delete(id);
      if (u.written !== u.size) {
        fs.unlink(u.path, () => {});
        return err(id, "The upload was cut short.");
      }
      send({ t: "file.saved", id, path: u.path });
    });
  }

  function failUpload(id, e) {
    const u = uploads.get(id);
    if (!u || u.failed) return;
    u.failed = true;
    uploads.delete(id);
    if (u.stream) u.stream.destroy();
    if (u.path) fs.unlink(u.path, () => {});
    err(id, e);
  }

  function cancel(id) {
    const d = downloads.get(id);
    if (d) {
      d.cancelled = true;
      d.wake?.();
    }
    const u = uploads.get(id);
    if (u) {
      u.failed = true;
      uploads.delete(id);
      u.stream?.destroy();
      if (u.path) fs.unlink(u.path, () => {});
    }
  }

  return {
    /* JSON messages from the viewer; returns true if it was a file message */
    handle(m) {
      const id = m.id >>> 0;
      switch (m.t) {
        case "fs.list": list(m.path); return true;
        case "file.get": download(id, String(m.path || "")); return true;
        case "file.ack": {
          const d = downloads.get(id);
          if (d) {
            d.acked = Math.max(d.acked, Number(m.bytes) || 0);
            d.lastAckAt = Date.now();
            d.wake?.();
          }
          return true;
        }
        case "file.put": startUpload(m); return true;
        case "file.put.end": finishUpload(id); return true;
        case "file.cancel": cancel(id); return true;
      }
      return false;
    },
    /* binary upload chunks */
    onBinary(buf) {
      if (!isFileFrame(buf)) return false;
      onChunk(buf.readUInt32LE(4), buf.subarray(8));
      return true;
    },
    /* nobody is watching any more: stop everything */
    cancelAll() {
      for (const id of [...downloads.keys(), ...uploads.keys()]) cancel(id);
    },
  };
}
