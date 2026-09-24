/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import express from "express";

/*
|--------------------------------------------------------------------------
| Music
|
| Songs play in SoundCloud's own embedded player, in the page. This server
| only finds them:
|   - search goes to SoundCloud's web API. SOUNDCLOUD_CLIENT_ID is used when
|     set; otherwise the public id soundcloud.com's own pages use is looked
|     up and cached, and looked up again if SoundCloud rotates it.
|   - "Top hits" are Deezer's public charts, which need no key. A chart song
|     is matched to a full-length SoundCloud upload when someone plays it.
|   - artwork and SoundCloud's widget script are re-served from our origin,
|     because the page's COEP header blocks third-party files that don't
|     send CORP.
|--------------------------------------------------------------------------
*/

const SC_API = "https://api-v2.soundcloud.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ART_HOST = /(^|\.)(sndcdn\.com|dzcdn\.net)$/i;
const TIMEOUT_MS = 8000;

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
let widgetJs = null; // { body, exp }

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

/* Call the SoundCloud API, looking the client id up (again) when needed. */
async function sc(path) {
  if (!clientId) await freshClientId();
  const url = (id) => `${SC_API}${path}${path.includes("?") ? "&" : "?"}client_id=${id}&app_locale=en`;
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

function playable(t) {
  return (
    t &&
    t.kind === "track" &&
    t.policy !== "BLOCK" &&
    t.streamable !== false &&
    (t.embeddable_by == null || t.embeddable_by === "all")
  );
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
  const data = await get(`https://api.deezer.com/chart/${genre}/tracks?limit=50`);
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

/* ---- routes ---- */

export function musicRouter({ requireSession, limiter }) {
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

  // SoundCloud's widget API script, from our origin
  r.get("/widget.js", async (_req, res) => {
    try {
      if (!widgetJs || widgetJs.exp < Date.now()) {
        widgetJs = { body: await get("https://w.soundcloud.com/player/api.js", "text"), exp: Date.now() + 24 * 60 * 60_000 };
      }
      res.type("application/javascript").set("Cache-Control", "public, max-age=3600").send(widgetJs.body);
    } catch (err) {
      if (widgetJs) return res.type("application/javascript").send(widgetJs.body); // stale beats nothing
      fail(res, err, "widget");
    }
  });

  return r;
}
