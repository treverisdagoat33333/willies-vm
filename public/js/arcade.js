/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * The Arcade: the game library (public/data/arcade.json) with search,
 * categories, favourites and recently played, and each game in its own window.
 * Games come from /play/arcade/<file> (arcade.js on the server) and run in a
 * sandbox without allow-same-origin, so they can't reach our cookies or
 * storage. Their saves come back by postMessage and live here, per game, in
 * IndexedDB `wvm-arcade`; the next launch hands them back in the address's
 * #arcade= part. Covers are drawn here as SVG: the collection has no pictures.
 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const LS = 'arcade';
  const me = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (_) { return {}; } })();
  me.fav ||= []; me.recent ||= [];
  const keep = () => { try { localStorage.setItem(LS, JSON.stringify(me)); } catch (_) {} };

  let games = null;
  /* everything in one place: the collection, the site's original game list
     (now.gg cloud games and game hubs, opened in the browser as before) and
     your own games from public/games/ */
  const load = async () => {
    if (games) return games;
    const [list, mine] = await Promise.all([fetch('/data/arcade.json').then((r) => r.json()).catch(() => []), window.apps?.games?.().catch(() => []) || []]);
    const extra = typeof GAMES !== 'undefined' ? GAMES.map((g) => ({ f: `ext:${g.name}`, t: g.name, c: 'Cloud & web', img: g.img, ext: g })) : [];
    const own = (mine || []).map((g) => ({ f: `mine:${g.id}`, t: g.title, c: 'My games', img: g.cover, mine: g }));
    return (games = [...own, ...extra, ...list]);
  };

  /* ---- saves, per game ---- */
  let dbp = null;
  const db = () => (dbp ||= new Promise((res, rej) => { const q = indexedDB.open('wvm-arcade', 1); q.onupgradeneeded = () => q.result.createObjectStore('saves'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
  const getSave = async (f) => { try { const d = await db(); return await new Promise((res) => { const q = d.transaction('saves').objectStore('saves').get(f); q.onsuccess = () => res(q.result || {}); q.onerror = () => res({}); }); } catch (_) { return {}; } };
  const putSave = async (f, v) => { if (S?.incognito) return; try { const d = await db(); d.transaction('saves', 'readwrite').objectStore('saves').put(v, f); } catch (_) {} };

  /* ---- covers ---- */
  const CAT_ICON = {
    Horror: '<path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 3L12 19l2.5 3L17 19l3 3V10a8 8 0 0 0-8-8z"/>',
    Racing: '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M5 12h14"/>',
    Sports: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 5h-5L8 10z"/>',
    Shooter: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    'Idle & Tycoon': '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.6 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
    Puzzle: '<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3h7z"/>',
    Platformer: '<path d="M3 20h6v-4h6v-4h6"/><circle cx="8" cy="7" r="2"/><path d="m8 9-1 4 3 1"/>',
    Multiplayer: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5"/>',
    Strategy: '<path d="M6 21h12M8 21V11l-2-2V5h3v2h2V5h2v2h2V5h3v4l-2 2v10"/>',
    Adventure: '<path d="m3 20 6-14 4 8 3-4 5 10z"/><path d="M14 4h4l-2 3z"/>',
    Arcade: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M7 12.5h4M9 10.5v4M15.5 11.5h.01M17.5 13.5h.01"/>',
  };
  const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  function lines(t) {
    const words = t.split(' '), out = [];
    let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > 15 && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) out.push(cur);
    if (out.length > 3) { out.length = 3; out[2] = out[2].slice(0, 13) + '…'; }
    return out;
  }
  function cover(g) {
    if (g.img) return `<img src="${esc(g.img)}" alt="" loading="lazy" decoding="async">`;
    const h = hash(g.t), a = h % 360, b = (a + 40 + (h >> 8) % 60) % 360;
    const ls = lines(g.t), size = ls.some((l) => l.length > 12) ? 26 : ls.length > 2 ? 26 : 30;
    const y0 = 182 - (ls.length - 1) * (size + 4);
    return `<svg viewBox="0 0 320 200" aria-hidden="true"><defs><linearGradient id="g${h}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a} 70% 52%)"/><stop offset="1" stop-color="hsl(${b} 75% 30%)"/></linearGradient><linearGradient id="s${h}" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>`
      + `<rect width="320" height="200" fill="url(#g${h})"/><circle cx="${260 + (h % 40)}" cy="${30 + (h % 30)}" r="${70 + (h % 40)}" fill="#fff" opacity=".08"/>`
      + `<g transform="translate(196 18) scale(5)" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".28">${CAT_ICON[g.c] || CAT_ICON.Arcade}</g>`
      + `<rect width="320" height="200" fill="url(#s${h})"/>`
      + ls.map((l, i) => `<text x="16" y="${y0 + i * (size + 4)}" fill="#fff" font-size="${size}" font-weight="800" font-family="system-ui,-apple-system,Segoe UI,sans-serif" letter-spacing="-.5">${esc(l)}</text>`).join('')
      + `</svg>`;
  }

  /* ---- playing ---- */
  async function play(g) {
    if (g.ext) { try { closeAllPanels(); } catch (_) {} return launchGame(g.ext); }
    if (g.mine) return window.apps.play(g.mine);
    const id = `arcade:${g.f}`;
    me.recent = [g.f, ...me.recent.filter((x) => x !== g.f)].slice(0, 30); keep();
    try { track('app', 'games'); } catch (_) {}
    const saved = await getSave(g.f);
    window.apps.win({ id, title: g.t, app: { icon: '🎮', color: `hsl(${hash(g.t) % 360} 70% 45%)` }, w: 1000, h: 680, build: (win) => {
      win.body.classList.add('aw-web');
      win.body.innerHTML = '<div class="aw-load">Loading the game…</div>';
      win.extra.innerHTML = `<button title="${me.fav.includes(g.f) ? 'Unfavourite' : 'Favourite'}" class="ar-favbtn${me.fav.includes(g.f) ? ' on' : ''}">★</button><button title="Restart">⟳</button><button title="Fullscreen">⛶</button>`;
      const f = document.createElement('iframe');
      f.className = 'aw-frame';
      // no allow-same-origin: the game gets an origin of its own, never ours
      f.setAttribute('sandbox', 'allow-scripts allow-pointer-lock allow-forms allow-popups allow-modals allow-downloads allow-orientation-lock');
      f.allow = 'fullscreen; autoplay; gamepad; clipboard-write';
      // the save rides in the address's #part, which the game's page reads before anything else runs
      const start = () => { let h = ''; try { const j = JSON.stringify(saved); if (j !== '{}' && j.length < 1.5e6) h = '#arcade=' + encodeURIComponent(j); } catch (_) {} f.src = `/play/arcade/${encodeURIComponent(g.f)}${h}`; };
      f.addEventListener('load', () => $('.aw-load', win.body)?.remove());
      const onMsg = (e) => {
        if (e.source !== f.contentWindow || !e.data || typeof e.data.arcadeSave !== 'object') return;
        const v = e.data.arcadeSave;
        if (JSON.stringify(v).length > 5e6) return; // one game can't fill the disk
        Object.keys(saved).forEach((k) => delete saved[k]); Object.assign(saved, v);
        putSave(g.f, v);
      };
      addEventListener('message', onMsg);
      win.cleanup.push(() => { removeEventListener('message', onMsg); f.src = 'about:blank'; });
      win.body.appendChild(f);
      const [fav, again, full] = win.extra.querySelectorAll('button');
      fav.onclick = () => { toggleFav(g.f); fav.classList.toggle('on', me.fav.includes(g.f)); };
      again.onclick = start;
      full.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : win.el.requestFullscreen()).catch?.(() => {});
      win.el.addEventListener('pointerdown', () => setTimeout(() => f.focus(), 0));
      start();
      setTimeout(() => f.focus(), 400);
    } });
  }
  function toggleFav(f) { me.fav = me.fav.includes(f) ? me.fav.filter((x) => x !== f) : [f, ...me.fav]; keep(); lib?.refreshCounts(); }

  /* ---- the library ---- */
  const PAGE = 72;
  let lib = null;
  function build(win) {
    win.body.classList.add('ar');
    win.body.innerHTML = `<div class="ar-top"><div class="ar-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input class="field ar-q" type="search" placeholder="Search 1,700+ games" autocomplete="off"></div><select class="field ar-sort" title="Sort"><option value="az">A–Z</option><option value="za">Z–A</option><option value="shuffle">Shuffle</option></select><button class="btn sm ar-random" title="Play a random game">🎲 Random</button></div><div class="ar-cats"></div><div class="ar-head"><b class="ar-title">All games</b><small class="ar-n"></small></div><div class="ar-grid"></div><div class="ar-more"></div>`;
    const q = $('.ar-q', win.body), grid = $('.ar-grid', win.body), cats = $('.ar-cats', win.body), sort = $('.ar-sort', win.body);
    let cat = 'All', list = [], shown = 0, seed = Math.random();
    const counts = () => {
      const c = { All: games.length, Favourites: me.fav.length, Recent: me.recent.length };
      for (const g of games) c[g.c] = (c[g.c] || 0) + 1;
      c.Flash = games.filter((g) => g.fl).length;
      return c;
    };
    const ORDER = ['All', 'Favourites', 'Recent', 'My games', 'Cloud & web', 'Arcade', 'Platformer', 'Shooter', 'Racing', 'Sports', 'Puzzle', 'Horror', 'Idle & Tycoon', 'Adventure', 'Strategy', 'Multiplayer', 'Flash'];
    const drawCats = () => { const c = counts(); cats.innerHTML = ORDER.filter((k) => c[k] || ['All', 'Favourites', 'Recent'].includes(k)).map((k) => `<button class="chip${k === cat ? ' active' : ''}" data-c="${esc(k)}">${esc(k)} <span>${c[k] || 0}</span></button>`).join(''); };
    const card = (g) => `<button class="ar-card" data-f="${esc(g.f)}" title="${esc(g.t)}"><span class="ar-cover">${cover(g)}</span><span class="ar-meta"><b>${esc(g.t)}</b><small>${esc(g.c === 'Cloud & web' ? (g.ext?.tag === 'nowgg' ? 'Cloud · opens in the browser' : 'Web · opens in the browser') : g.c)}${g.fl ? ' · Flash' : ''}</small></span><span class="ar-star${me.fav.includes(g.f) ? ' on' : ''}" data-star="${esc(g.f)}" title="Favourite">★</span></button>`;
    const more = () => { const next = list.slice(shown, shown + PAGE); grid.insertAdjacentHTML('beforeend', next.map(card).join('')); shown += next.length; };
    const filter = () => {
      const s = q.value.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ''), byF = new Map(games.map((g) => [g.f, g]));
      let l = cat === 'Favourites' ? me.fav.map((f) => byF.get(f)).filter(Boolean) : cat === 'Recent' ? me.recent.map((f) => byF.get(f)).filter(Boolean) : cat === 'All' ? games : cat === 'Flash' ? games.filter((g) => g.fl) : games.filter((g) => g.c === cat);
      if (s) { const words = s.split(' ').filter(Boolean); l = l.filter((g) => { const t = g.t.toLowerCase().replace(/[^a-z0-9 ]/g, ''); return words.every((w) => t.includes(w)); }); }
      if (!['Favourites', 'Recent'].includes(cat)) {
        if (sort.value === 'za') l = [...l].reverse();
        else if (sort.value === 'shuffle') l = [...l].sort((a, b) => (hash(a.f + seed) % 997) - (hash(b.f + seed) % 997));
      }
      list = l; shown = 0; grid.innerHTML = '';
      $('.ar-title', win.body).textContent = s ? `Results for “${q.value.trim()}”` : cat === 'All' ? 'All games' : cat;
      $('.ar-n', win.body).textContent = `${l.length} game${l.length === 1 ? '' : 's'}`;
      if (!l.length) grid.innerHTML = `<div class="ar-empty">${cat === 'Favourites' ? 'No favourites yet. Hover a game and tap the ★.' : cat === 'Recent' ? 'Games you play show up here.' : 'No games match that.'}</div>`;
      more();
    };
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && shown < list.length) more(); }, { root: win.body, rootMargin: '600px' });
    io.observe($('.ar-more', win.body));
    win.cleanup.push(() => { io.disconnect(); lib = null; });
    let t;
    q.oninput = () => { clearTimeout(t); t = setTimeout(filter, 120); };
    q.onkeydown = (e) => { if (e.key === 'Enter' && list[0]) play(list[0]); };
    sort.onchange = () => { seed = Math.random(); filter(); };
    cats.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; drawCats(); filter(); win.body.scrollTop = 0; };
    $('.ar-random', win.body).onclick = () => { const l = list.length ? list : games; play(l[Math.floor(Math.random() * l.length)]); };
    grid.onclick = (e) => {
      const st = e.target.closest('[data-star]');
      if (st) { e.stopPropagation(); toggleFav(st.dataset.star); st.classList.toggle('on', me.fav.includes(st.dataset.star)); if (cat === 'Favourites') filter(); return; }
      const c = e.target.closest('.ar-card'); if (!c) return;
      const g = games.find((x) => x.f === c.dataset.f); if (g) play(g);
    };
    lib = { refreshCounts: drawCats };
    grid.innerHTML = '<div class="ar-empty">Loading games…</div>';
    load().then(() => { drawCats(); filter(); setTimeout(() => q.focus(), 50); });
  }

  const open = () => window.apps?.tool('arcade');
  // the launcher's Games tile counts everything here, once the desktop has settled
  setTimeout(() => load().then((l) => { const c = $('#games-count'); if (c && l.length) c.textContent = `${l.length.toLocaleString()} games`; }), 1500);
  window.apps?.addTool({ id: 'arcade', name: 'Arcade', icon: '🕹️', color: '#ff2d55', desc: '1,700+ games, right here', w: 1180, h: 760, build, glyph: { from: '#ff5f6d', to: '#c2185b', svg: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M7 12.5h4M9 10.5v4"/><circle cx="15.5" cy="11.5" r=".9" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".9" fill="currentColor"/>' } });
  window.arcade = { open, play: (f) => load().then(() => { const g = games.find((x) => x.f === f); if (g) play(g); }), list: load, cover };
})();
