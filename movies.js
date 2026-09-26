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
| Movies & TV
|
| Listings come from Cinemeta, Stremio's public catalogue, which needs no
| key and hands back IMDB ids. The video itself is vidsrc.ir, which the
| browser embeds straight by IMDB id (in a credentialless frame, because
| of our COEP header) - none of the video ever touches this server. We
| only proxy:
|   - the catalogue (popular movies, popular shows, anime, search), so a
|     school filter that blocks strem.io doesn't matter and answers are
|     cached here for everyone;
|   - a show's episode list (Cinemeta's meta endpoint);
|   - the posters, because the page's COEP header blocks third-party
|     images that don't send CORP.
| CINEMETA_API exists only so the tests can point this at a pretend
| Cinemeta.
|--------------------------------------------------------------------------
*/

const CINEMETA = process.env.CINEMETA_API || "https://v3-cinemeta.strem.io";
const TIMEOUT_MS = 10_000;
// where Cinemeta's posters and backgrounds live
const ART_HOST = /(^|\.)(metahub\.space|media-amazon\.com)$/i;
const TEST_HOST = process.env.CINEMETA_API ? new URL(process.env.CINEMETA_API).host : null;

// the rows the front end can ask for -> Cinemeta catalogue paths
const ROWS = {
  movies: { type: "movie", extra: "" },
  shows: { type: "series", extra: "" },
  // Cinemeta has no "anime" genre; its Animation chart is Japanese anime almost to the top
  anime: { type: "series", extra: "/genre=Animation" },
};
// the genres Cinemeta's top catalogues can be filtered by (movies and shows only)
export const GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western"];

/* A small TTL cache that forgets its oldest entries past `max`. */
function cache(ttlMs, max = 300) {
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

const listCache = cache(30 * 60_000, 100);
const searchCache = cache(30 * 60_000);
const metaCache = cache(6 * 60 * 60_000, 500);

async function get(url) {
  // Cinemeta redirects its charts to a CDN host; fetch follows that itself
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return r.json();
}

/* Only what the grid needs; Cinemeta's entries are much bigger. */
function shapeItem(m, type) {
  const id = String(m.imdb_id || m.id || "");
  if (!/^tt\d{1,12}$/.test(id)) return null;
  return {
    id,
    type: m.type === "movie" || m.type === "series" ? m.type : type,
    name: String(m.name || ""),
    poster: String(m.poster || ""),
    year: String(m.releaseInfo || m.year || "").replace(/–$/, "–"),
    rating: String(m.imdbRating || ""),
    genres: (m.genres || m.genre || []).slice(0, 3).map(String),
    // for the hero banner at the top of the grid
    background: String(m.background || ""),
    description: String(m.description || "").slice(0, 300),
  };
}

async function catalog(type, extra, skip) {
  const page = skip ? `/skip=${skip}` : "";
  const data = await get(`${CINEMETA}/catalog/${type}/top${extra}${page}.json`);
  return (data.metas || []).map((m) => shapeItem(m, type)).filter(Boolean);
}

async function searchAll(q) {
  const key = q.toLowerCase();
  const hit = searchCache.get(key);
  if (hit) return hit;
  const enc = encodeURIComponent(q);
  const [movies, series] = await Promise.all([
    get(`${CINEMETA}/catalog/movie/top/search=${enc}.json`).catch(() => ({})),
    get(`${CINEMETA}/catalog/series/top/search=${enc}.json`).catch(() => ({})),
  ]);
  // movies and shows woven together, so neither buries the other
  const a = (movies.metas || []).map((m) => shapeItem(m, "movie")).filter(Boolean);
  const b = (series.metas || []).map((m) => shapeItem(m, "series")).filter(Boolean);
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < 60; i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  searchCache.set(key, out);
  return out;
}

/* A title's details; for a show, the episode list grouped by season. */
async function meta(type, id) {
  const key = `${type}:${id}`;
  const hit = metaCache.get(key);
  if (hit) return hit;
  const { meta: m = {} } = await get(`${CINEMETA}/meta/${type}/${id}.json`);
  const out = {
    ...shapeItem({ ...m, imdb_id: id }, type),
    description: String(m.description || ""),
    background: String(m.background || ""),
    runtime: String(m.runtime || ""),
  };
  if (type === "series") {
    const seasons = new Map();
    for (const v of m.videos || []) {
      const s = Number(v.season);
      const e = Number(v.episode ?? v.number);
      if (!Number.isInteger(s) || !Number.isInteger(e) || e < 1) continue;
      if (!seasons.has(s)) seasons.set(s, []);
      seasons.get(s).push({ episode: e, name: String(v.name || v.title || ""), released: v.released ? String(v.released).slice(0, 10) : "" });
    }
    // season 0 is specials; shown last
    out.seasons = [...seasons.entries()]
      .sort((x, y) => (x[0] || 1e9) - (y[0] || 1e9))
      .map(([season, episodes]) => ({ season, episodes: episodes.sort((x, y) => x.episode - y.episode) }));
  }
  metaCache.set(key, out);
  return out;
}

/* ---- routes ---- */

export function moviesRouter({ requireSession, limiter }) {
  const r = express.Router();
  const fail = (res, err, what) => {
    console.error(`movies ${what} failed:`, err.message);
    res.status(502).json({ error: "Couldn't reach the movie catalogue. Try again in a bit." });
  };

  r.get("/browse", requireSession, limiter, async (req, res) => {
    const row = ROWS[String(req.query.row || "")];
    if (!row) return res.status(400).json({ error: "Unknown row." });
    const genre = String(req.query.genre || "");
    // the anime row already is a genre filter; Cinemeta can't stack two
    if (genre && (row.extra || !GENRES.includes(genre))) return res.status(400).json({ error: "Unknown genre." });
    const skip = Math.min(500, Math.max(0, Number(req.query.skip) || 0));
    const key = `${req.query.row}:${genre}:${skip}`;
    try {
      let items = listCache.get(key);
      if (!items) {
        items = await catalog(row.type, genre ? `/genre=${genre}` : row.extra, skip);
        listCache.set(key, items);
      }
      res.json({ items });
    } catch (err) {
      fail(res, err, "browse");
    }
  });

  r.get("/search", requireSession, limiter, async (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 120);
    if (!q) return res.json({ items: [] });
    try {
      res.json({ items: await searchAll(q) });
    } catch (err) {
      fail(res, err, "search");
    }
  });

  r.get("/meta", requireSession, limiter, async (req, res) => {
    const type = String(req.query.type || "");
    const id = String(req.query.id || "");
    if (!["movie", "series"].includes(type) || !/^tt\d{1,12}$/.test(id)) return res.status(400).json({ error: "Bad title." });
    try {
      res.json({ meta: await meta(type, id) });
    } catch (err) {
      fail(res, err, "meta");
    }
  });

  // posters, host-locked to Cinemeta's image CDNs
  r.get("/art", requireSession, async (req, res) => {
    let url;
    try {
      url = new URL(String(req.query.u || ""));
    } catch (_) {
      return res.status(400).end();
    }
    const ok = (url.protocol === "https:" && ART_HOST.test(url.hostname)) || url.host === TEST_HOST;
    if (!ok) return res.status(403).end();
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

  return r;
}
