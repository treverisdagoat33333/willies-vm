/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import express from "express";
import { MUSIC_DIR } from "./db.js";

/*
|--------------------------------------------------------------------------
| Music
|
| Songs are found on SoundCloud and played through this server, so the
| browser only ever talks to our site (school filters that block SoundCloud
| don't matter, and any browser can play it):
|   - search goes to SoundCloud's web API. SOUNDCLOUD_CLIENT_ID is used when
|     set; otherwise the public id soundcloud.com's own pages use is looked
|     up and cached, and looked up again if SoundCloud rotates it.
|   - /stream/<track id> is the audio. A track's plain MP3 is passed through
|     as it downloads (Range requests too, so seeking works). A track that
|     only comes in HLS pieces is fetched whole, stitched into one file and
|     kept in DATA_DIR/music (oldest cleared past MAX_CACHE). Signed links
|     that run out are asked for again. Label uploads are DRM-locked
|     (encrypted HLS only), so they're left out of search.
|   - "Top hits" are Deezer's public charts, which need no key. A chart song
|     is matched to a full-length SoundCloud upload when someone plays it.
|   - artwork is re-served from our origin, because the page's COEP header
|     blocks third-party images that don't send CORP.
| SOUNDCLOUD_API and DEEZER_API exist only so the tests can point these at
| a pretend SoundCloud and Deezer.
|--------------------------------------------------------------------------
*/

const SC_API = process.env.SOUNDCLOUD_API || "https://api-v2.soundcloud.com";
const DEEZER_API = process.env.DEEZER_API || "https://api.deezer.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ART_HOST = /(^|\.)(sndcdn\.com|dzcdn\.net)$/i;
const TIMEOUT_MS = 8000;
// where SoundCloud's API may send us for the audio itself (plus the pretend SoundCloud in the tests)
const MEDIA_HOST = /(^|\.)(sndcdn\.com|soundcloud\.cloud|soundcloud\.com)$/i;
const TEST_HOST = process.env.SOUNDCLOUD_API ? new URL(process.env.SOUNDCLOUD_API).host : null;
const MAX_CACHE = 300 * 1024 * 1024; // stitched songs kept on disk
const MAX_SONG = 40 * 1024 * 1024;

// Deezer genre charts shown as chips on the home page
export const GENRES = [
  { id: 0, name: "Top hits" },
  { id: 116, name: "Hip-hop" },
  { id: 132, name: "Pop" },
  { id: 165, name: "R&B" },
  { id: 113, name: "Dance" },
  { id: 152, name: "Rock" },
  { id: 197, name: "Latin" },
  { id: 84, name: "Country" },
  { id: 85, name: "Alternative" },
];

/* A small TTL cache that forgets its oldest entries past `max`. */
function cache(ttlMs, max = 500) {
  const map = new Map();
  return {
    get(k) {
      const e = map.get(k);
      if (!e) return undefined;
      if (e.exp < Date.now()) {
        map.delete(k);
        return undefined;
      }
      return e.v;
    },
    delete(k) {
      map.delete(k);
    },
    set(k, v) {
      map.delete(k);
      map.set(k, { v, exp: Date.now() + ttlMs });
      while (map.size > max) map.delete(map.keys().next().value);
    },
  };
}

const searchCache = cache(30 * 60_000);
const resolveCache = cache(12 * 60 * 60_000, 2000);
const chartCache = cache(60 * 60_000, 50);
// track id -> where its audio is; SoundCloud's signed links outlast this
const streamCache = cache(20 * 60_000, 1000);

async function get(url, as = "json") {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: as === "json" ? "application/json" : "*/*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) {
    const err = new Error(`${new URL(url).hostname} answered ${r.status}`);
    err.status = r.status;
    throw err;
  }
  if (as === "bytes") return Buffer.from(await r.arrayBuffer());
  return as === "json" ? r.json() : r.text();
}

/* ---- SoundCloud client id ---- */

let clientId = process.env.SOUNDCLOUD_CLIENT_ID || "";
let clientIdPromise = null;

async function discoverClientId() {
  const html = await get("https://soundcloud.com/", "text");
  // the id sits in one of the app bundles, usually one of the last ones
  const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/[^"]+\.sndcdn\.com\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const src of scripts.reverse()) {
    try {
      const js = await get(src, "text");
      const m = /client_id\s*[:=]\s*"([0-9a-zA-Z]{32})"/.exec(js) || /[?&]client_id=([0-9a-zA-Z]{32})/.exec(js);
      if (m) return m[1];
    } catch (_) {}
  }
  throw new Error("couldn't find SoundCloud's client id");
}

function freshClientId() {
  clientIdPromise ||= discoverClientId()
    .then((id) => {
      clientId = id;
      console.log("SoundCloud client id refreshed");
      return id;
    })
    .finally(() => {
      clientIdPromise = null;
    });
  return clientIdPromise;
}

/* Call the SoundCloud API, looking the client id up (again) when needed.
   `path` may also be a full link the API handed out (a track's media links). */
async function sc(path, params = "") {
  if (!clientId) await freshClientId();
  const base = /^https?:\/\//.test(path) ? path : SC_API + path;
  if (new URL(base).host !== new URL(SC_API).host) throw new Error("not a SoundCloud API link");
  const url = (id) => `${base}${base.includes("?") ? "&" : "?"}client_id=${id}&app_locale=en${params}`;
  try {
    return await get(url(clientId));
  } catch (err) {
    if (err.status !== 401 && err.status !== 403) throw err;
    return get(url(await freshClientId()));
  }
}

/* ---- shaping ---- */

function bigArt(u) {
  // SoundCloud serves "-large" (100px) by default; t300x300 is the same image, bigger
  return u ? String(u).replace(/-large(\.\w+)$/, "-t300x300$1") : "";
}

/* The ways a track's audio can come, best first: one MP3 file (starts at once, seeks
   anywhere), the same MP3 in HLS pieces, then AAC in HLS pieces. Label uploads are
   DRM-locked (encrypted HLS), and the plain-looking MP3 they list doesn't answer. */
const KINDS = [
  (p, m) => p === "progressive" && m.startsWith("audio/mpeg"),
  (p, m) => p === "hls" && m.startsWith("audio/mpeg"),
  (p, m) => p === "hls" && m.startsWith("audio/mp4"),
];
const QUALITY = { hq: 0, sq: 1, lq: 2 };
function streamsOf(t) {
  const list = t?.media?.transcodings || [];
  if (list.some((x) => /encrypted/.test(x.format?.protocol || ""))) return [];
  const kind = (x) => KINDS.findIndex((f) => f(x.format?.protocol || "", x.format?.mime_type || ""));
  return list
    .filter((x) => x.url && kind(x) >= 0)
    .sort((a, b) => kind(a) - kind(b) || (QUALITY[a.quality] ?? 1) - (QUALITY[b.quality] ?? 1));
}

function playable(t) {
  return t && t.kind === "track" && t.policy !== "BLOCK" && t.streamable !== false && streamsOf(t).length > 0;
}

function shapeTrack(t) {
  return {
    id: t.id,
    title: String(t.title || ""),
    artist: String(t.publisher_metadata?.artist || t.user?.username || ""),
    uploader: String(t.user?.username || ""),
    artwork: bigArt(t.artwork_url || t.user?.avatar_url),
    duration: Math.round((t.full_duration || t.duration || 0) / 1000),
    url: String(t.permalink_url || ""),
    // "SNIP" tracks are 30-second previews for people without SoundCloud Go+
    preview: t.policy === "SNIP",
    plays: t.playback_count || 0,
  };
}

async function searchTracks(q) {
  const key = q.toLowerCase();
  const hit = searchCache.get(key);
  if (hit) return hit;
  const data = await sc(`/search/tracks?q=${encodeURIComponent(q)}&limit=40&linked_partitioning=1`);
  const tracks = (data.collection || []).filter(playable).map(shapeTrack);
  // full songs first, previews after; SoundCloud's relevance order otherwise
  const out = [...tracks.filter((t) => !t.preview), ...tracks.filter((t) => t.preview)];
  searchCache.set(key, out);
  return out;
}

/* ---- matching a chart song to a SoundCloud upload ---- */

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\((feat|ft|with)[^)]*\)|\[(feat|ft|with)[^\]]*\]|\b(feat|ft)\.? .*$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const JUNK = /\b(cover|remix|sped ?up|slowed|nightcore|8d|instrumental|karaoke|reverb|live|lyrics? video|acapella|mashup|edit)\b/i;

export function scoreMatch(t, want) {
  const title = norm(t.title);
  const wantTitle = norm(want.title);
  const artist = norm(want.artist);
  const hay = `${title} ${norm(t.artist)} ${norm(t.uploader)}`;
  let score = 0;
  if (wantTitle && title.includes(wantTitle)) score += 3;
  else if (wantTitle && wantTitle.split(" ").every((w) => title.includes(w))) score += 2;
  const firstArtistWord = artist.split(" ")[0];
  if (artist && hay.includes(artist)) score += 3;
  else if (firstArtistWord && hay.includes(firstArtistWord)) score += 1;
  if (want.duration && t.duration) {
    const diff = Math.abs(t.duration - want.duration);
    if (diff <= 6) score += 3;
    else if (diff <= 20) score += 1;
    else if (diff > 60) score -= 2;
  }
  if (JUNK.test(t.title) && !JUNK.test(want.title)) score -= 4;
  if (t.preview) score -= 5;
  score += Math.min(2, Math.log10((t.plays || 0) + 1) / 3);
  return score;
}

async function resolveSong(want) {
  const key = `${norm(want.artist)}|${norm(want.title)}`;
  const hit = resolveCache.get(key);
  if (hit !== undefined) return hit;
  const results = await searchTracks(`${want.artist} ${norm(want.title)}`.trim());
  let best = null;
  let bestScore = -Infinity;
  for (const t of results) {
    const s = scoreMatch(t, want);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  const found = best && bestScore >= 4 ? best : null;
  resolveCache.set(key, found);
  return found;
}

/* ---- charts (Deezer) ---- */

async function chart(genre) {
  const hit = chartCache.get(genre);
  if (hit) return hit;
  const data = await get(`${DEEZER_API}/chart/${genre}/tracks?limit=50`);
  if (data.error) throw new Error(data.error.message || "Deezer error");
  const out = (data.data || []).map((t) => ({
    key: `dz${t.id}`,
    title: String(t.title_short || t.title || ""),
    artist: String(t.artist?.name || ""),
    artwork: String(t.album?.cover_medium || t.album?.cover || ""),
    duration: t.duration || 0,
    chart: true,
  }));
  chartCache.set(genre, out);
  return out;
}

/* ---- the audio ---- */

const fail404 = (msg) => Object.assign(new Error(msg), { status: 404, final: true });

function mediaUrl(u, base) {
  const url = new URL(u, base);
  const ok = (url.protocol === "https:" && MEDIA_HOST.test(url.hostname)) || url.host === TEST_HOST;
  if (!ok) throw new Error(`unexpected media host ${url.hostname}`);
  return url.href;
}

/* An HLS playlist -> the links of its pieces (the init piece first, for AAC). */
async function playlist(url, nested = false) {
  const lines = (await get(url, "text")).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U") throw new Error("not a playlist");
  const variant = lines.findIndex((l) => l.startsWith("#EXT-X-STREAM-INF"));
  if (variant >= 0) {
    const next = lines.slice(variant + 1).find((l) => !l.startsWith("#"));
    if (nested || !next) throw new Error("bad playlist");
    return playlist(mediaUrl(next, url), true);
  }
  const locked = lines.some((l) => /^#EXT-X-(SESSION-)?KEY:/.test(l) && !/METHOD=NONE/.test(l));
  if (locked || lines.some((l) => l.startsWith("#EXT-X-BYTERANGE"))) throw new Error("unsupported playlist");
  const map = lines.map((l) => /^#EXT-X-MAP:.*URI="([^"]+)"/.exec(l)).find(Boolean);
  const parts = lines.filter((l) => !l.startsWith("#")).map((l) => mediaUrl(l, url));
  if (!parts.length || parts.length > 3000) throw new Error("bad playlist");
  return map ? [mediaUrl(map[1], url), ...parts] : parts;
}

/* Where a track's audio is right now: {id, preset, type, file} or {id, preset, type, parts}. */
const resolving = new Map();
function resolveStream(id, fresh = false) {
  const hit = !fresh && streamCache.get(id);
  if (hit) return Promise.resolve(hit);
  if (resolving.has(id)) return resolving.get(id);
  const p = (async () => {
    let t;
    try {
      t = await sc(`/tracks/${id}`);
    } catch (err) {
      if (err.status === 404) throw fail404("no such track");
      throw err;
    }
    if (!playable(t)) throw fail404("not streamable");
    let last = null;
    for (const x of streamsOf(t)) {
      try {
        const { url } = await sc(x.url, `&track_authorization=${encodeURIComponent(t.track_authorization || "")}`);
        const out = { id, preset: String(x.preset || "x").replace(/\W/g, ""), type: x.format.mime_type.startsWith("audio/mp4") ? "audio/mp4" : "audio/mpeg" };
        if (x.format.protocol === "progressive") out.file = mediaUrl(url);
        else out.parts = await playlist(mediaUrl(url));
        streamCache.set(id, out);
        return out;
      } catch (err) {
        last = err;
      }
    }
    throw fail404(`no stream answered${last ? ` (${last.message})` : ""}`);
  })().finally(() => resolving.delete(id));
  resolving.set(id, p);
  return p;
}

/* A track in HLS pieces, fetched whole and stitched into one file on disk (so the
   browser gets one file it can seek in). Pieces are fetched 6 at a time. */
const building = new Map();
const songFile = (s) => path.resolve(MUSIC_DIR, `${s.id}-${s.preset}.${s.type === "audio/mp4" ? "m4a" : "mp3"}`);
function stitched(s) {
  const file = songFile(s);
  if (fs.existsSync(file)) {
    lastUsed.set(file, Date.now());
    return Promise.resolve(file);
  }
  if (building.has(file)) return building.get(file);
  const p = (async () => {
    const bufs = new Array(s.parts.length);
    let next = 0;
    let total = 0;
    let broken = false;
    const worker = async () => {
      while (next < s.parts.length && !broken) {
        const i = next++;
        try {
          bufs[i] = await get(s.parts[i], "bytes");
        } catch (err) {
          broken = true;
          throw err;
        }
        if ((total += bufs[i].length) > MAX_SONG) {
          broken = true;
          throw new Error("song too big");
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, s.parts.length) }, worker));
    const tmp = `${file}.${process.pid}-${Date.now()}.part`;
    await fsp.writeFile(tmp, Buffer.concat(bufs));
    await fsp.rename(tmp, file);
    lastUsed.set(file, Date.now());
    trimCache();
    return file;
  })().finally(() => building.delete(file));
  building.set(file, p);
  return p;
}

/* keep the stitched songs under MAX_CACHE, dropping the ones played longest ago */
const lastUsed = new Map(); // file -> when it was last played (this run)
async function trimCache() {
  try {
    const names = await fsp.readdir(MUSIC_DIR);
    const files = [];
    for (const n of names) {
      const f = path.join(MUSIC_DIR, n);
      const st = await fsp.stat(f).catch(() => null);
      if (!st) continue;
      if (n.endsWith(".part")) {
        if (Date.now() - st.mtimeMs > 10 * 60_000) fsp.rm(f, { force: true }).catch(() => {});
        continue;
      }
      files.push({ f, size: st.size, at: lastUsed.get(f) || st.mtimeMs });
    }
    let total = files.reduce((a, x) => a + x.size, 0);
    for (const x of files.sort((a, b) => a.at - b.at)) {
      if (total <= MAX_CACHE) break;
      await fsp.rm(x.f, { force: true }).catch(() => {});
      lastUsed.delete(x.f);
      total -= x.size;
    }
  } catch (_) {}
}

/* A track's MP3 file, passed through as it downloads, Range requests included. */
async function passThrough(req, res, s) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS); // only until SoundCloud answers
  res.on("close", () => ac.abort());
  const headers = { "User-Agent": UA };
  if (/^bytes=\d*-\d*$/.test(req.headers.range || "")) headers.Range = req.headers.range;
  let up;
  try {
    up = await fetch(s.file, { headers, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!up.ok && up.status !== 416) {
    up.body?.cancel().catch(() => {});
    throw Object.assign(new Error(`audio answered ${up.status}`), { status: up.status });
  }
  res.status(up.status).set({ "Content-Type": s.type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400" });
  for (const h of ["content-length", "content-range"]) {
    const v = up.headers.get(h);
    if (v) res.set(h, v);
  }
  if (!up.body || req.method === "HEAD") {
    up.body?.cancel().catch(() => {});
    return res.end();
  }
  Readable.fromWeb(up.body)
    .on("error", () => res.destroy())
    .pipe(res);
}

/* ---- routes ---- */

export function musicRouter({ requireSession, limiter, streamLimiter }) {
  const r = express.Router();
  const fail = (res, err, what) => {
    console.error(`music ${what} failed:`, err.message);
    res.status(502).json({ error: `Couldn't reach the music service. Try again in a bit.` });
  };

  r.get("/search", requireSession, limiter, async (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 120);
    if (!q) return res.json({ tracks: [] });
    try {
      res.json({ tracks: await searchTracks(q) });
    } catch (err) {
      fail(res, err, "search");
    }
  });

  r.get("/charts", requireSession, async (req, res) => {
    const genre = Number(req.query.genre) || 0;
    if (!GENRES.some((g) => g.id === genre)) return res.status(400).json({ error: "Unknown genre." });
    try {
      res.json({ genres: GENRES, tracks: await chart(genre) });
    } catch (err) {
      fail(res, err, "charts");
    }
  });

  r.get("/resolve", requireSession, limiter, async (req, res) => {
    const want = {
      title: String(req.query.title || "").slice(0, 200),
      artist: String(req.query.artist || "").slice(0, 200),
      duration: Number(req.query.duration) || 0,
    };
    if (!want.title) return res.status(400).json({ error: "Missing title." });
    try {
      const track = await resolveSong(want);
      if (!track) return res.status(404).json({ error: "No full version of that song on SoundCloud." });
      res.json({ track });
    } catch (err) {
      fail(res, err, "resolve");
    }
  });

  // album art, host-locked to SoundCloud's and Deezer's image CDNs
  r.get("/art", requireSession, async (req, res) => {
    let url;
    try {
      url = new URL(String(req.query.u || ""));
    } catch (_) {
      return res.status(400).end();
    }
    if (url.protocol !== "https:" || !ART_HOST.test(url.hostname)) return res.status(403).end();
    try {
      const upstream = await fetch(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!upstream.ok) return res.status(upstream.status).end();
      const type = upstream.headers.get("content-type") || "image/jpeg";
      if (!type.startsWith("image/")) return res.status(415).end();
      res.set("Content-Type", type);
      res.set("Cache-Control", "public, max-age=604800, immutable");
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (_) {
      res.status(502).end();
    }
  });

  // the audio: ?warm=1 gets it ready (the next song in the queue) without sending it
  r.get("/stream/:id", requireSession, streamLimiter, async (req, res) => {
    const id = String(req.params.id || "");
    if (!/^\d{1,15}$/.test(id)) return res.status(400).json({ error: "Bad song id." });
    for (let attempt = 0; ; attempt++) {
      try {
        const s = await resolveStream(id, attempt > 0);
        if (req.query.warm != null) {
          if (s.parts) await stitched(s);
          return res.status(204).end();
        }
        if (s.file) return await passThrough(req, res, s);
        const file = await stitched(s);
        res.type(s.type).set("Cache-Control", "private, max-age=86400");
        // no ETag or Last-Modified: the file can be rebuilt, and a changed validator would break seeking
        return res.sendFile(file, { etag: false, lastModified: false }, (err) => {
          if (err && !res.headersSent) res.status(404).end();
        });
      } catch (err) {
        if (res.headersSent) return res.destroy();
        // a signed link ran out (or SoundCloud moved the file): ask for a fresh one, once
        if (attempt === 0 && !err.final && [401, 403, 404, 410].includes(err.status)) continue;
        if (err.status === 404) return res.status(404).json({ error: "SoundCloud won't stream that one." });
        return fail(res, err, "stream");
      }
    }
  });

  return r;
}
