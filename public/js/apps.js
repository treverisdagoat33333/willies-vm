/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * Apps: the launcher (taskbar, desktop, Alt+P) and small windows on the desktop.
 * Two kinds: web apps (YouTube, Discord, …), which open the real site through
 * the proxy in a window of their own, with no tabs or address bar, and tools
 * built in here (calculator, notes, paint, …). Windows drag by their title bar
 * and resize from the corner; several can be open at once.
 * Notes, the calendar, favourites and the like live in localStorage `apps`.
 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const LS = 'apps';
  const data = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (_) { return {}; } })();
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(data)); } catch (_) {} };

  /* ---------- web apps: the real site, in a window ---------- */
  const WEB = [
    ['youtube', 'YouTube', 'https://www.youtube.com', '#ff0033', '▶'],
    ['tiktok', 'TikTok', 'https://www.tiktok.com', '#111', '♪'],
    ['discord', 'Discord', 'https://discord.com/app', '#5865f2', '💬'],
    ['spotify', 'Spotify', 'https://open.spotify.com', '#1db954', '🎧'],
    ['instagram', 'Instagram', 'https://www.instagram.com', '#e1306c', '📷'],
    ['reddit', 'Reddit', 'https://www.reddit.com', '#ff4500', '👽'],
    ['twitch', 'Twitch', 'https://www.twitch.tv', '#9146ff', '📺'],
    ['x', 'X', 'https://x.com', '#000', '𝕏'],
    ['chatgpt', 'ChatGPT', 'https://chatgpt.com', '#10a37f', '✦'],
    ['google', 'Google', 'https://www.google.com', '#4285f4', 'G'],
    ['gmail', 'Gmail', 'https://mail.google.com', '#ea4335', '✉'],
    ['docs', 'Google Docs', 'https://docs.google.com', '#4285f4', '📄'],
    ['wikipedia', 'Wikipedia', 'https://en.wikipedia.org', '#555', 'W'],
    ['pinterest', 'Pinterest', 'https://www.pinterest.com', '#e60023', 'P'],
    ['poki', 'Poki', 'https://poki.com', '#2b8af7', '🎮'],
    ['coolmath', 'Coolmath Games', 'https://www.coolmathgames.com', '#f6a21e', '➗'],
    ['duolingo', 'Duolingo', 'https://www.duolingo.com', '#58cc02', '🦉'],
    ['canva', 'Canva', 'https://www.canva.com', '#00c4cc', '🎨'],
    ['github', 'GitHub', 'https://github.com', '#24292f', '🐙'],
    ['soundcloud', 'SoundCloud', 'https://soundcloud.com', '#ff5500', '☁'],
  ].map(([id, name, url, color, icon]) => ({ id, name, url, color, icon, web: true, logo: `/icons/apps/${id}.png` }));

  /* a site's real logo on a white tile (icons/apps/, saved from each site, so
     they load from our origin under COEP); its letter tile if the file is missing */
  const iconHtml = (a) => (a.cover ? `<img src="${a.cover}" alt="" draggable="false">` : a.logo ? `<img src="${a.logo}" alt="" draggable="false" data-fallback="${esc(a.icon)}">` : a.glyph ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${a.glyph.svg}</svg>` : a.icon);
  const tileStyle = (a) => (a.cover ? `background:${a.color}` : a.logo ? 'background:#fff' : a.glyph ? `background:linear-gradient(160deg,${a.glyph.from},${a.glyph.to})` : `background:${a.color}`);
  const tileClass = (a) => (a.cover ? ' has-cover' : a.logo ? ' has-logo' : a.glyph ? ' has-glyph' : '');
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.dataset.fallback) return;
    const tile = img.parentNode;
    tile.style.background = [...WEB].find((a) => a.logo === img.getAttribute('src'))?.color || '#555';
    tile.classList.remove('has-logo');
    img.replaceWith(img.dataset.fallback);
  }, true);

  /* ---------- windows ---------- */
  let z = 61;
  const wins = new Map(); // id -> {el, cleanup:[]}
  function focus(w) { w.el.style.zIndex = ++z; }
  function openWin({ id, title, app = null, icon, color, w = 420, h = 480, build }) {
    if (wins.has(id)) { const o = wins.get(id); restore(id); return o; }
    const el = document.createElement('div');
    el.className = 'aw';
    el.dataset.win = id; // not data-app: that attribute launches apps on click (app.js), which reopened a window as you closed it
    const n = wins.size;
    const W = Math.min(w, innerWidth - 16), H = Math.min(h, innerHeight - 90);
    Object.assign(el.style, { width: `${W}px`, height: `${H}px`, left: `${Math.max(8, (innerWidth - W) / 2 + n * 26 - 60)}px`, top: `${Math.max(8, (innerHeight - H) / 2 + n * 26 - 70)}px`, zIndex: ++z });
    const a = app || { icon, color };
    el.innerHTML = `<div class="aw-bar"><span class="aw-ic${tileClass(a)}" style="${tileStyle(a)}">${iconHtml(a)}</span><b>${esc(title)}</b><span class="sp"></span><span class="aw-extra"></span><button class="aw-min" title="Minimize">–</button><button class="aw-max" title="Maximize">▢</button><button class="aw-x" title="Close">✕</button></div><div class="aw-body"></div>`;
    document.body.appendChild(el);
    const win = { el, body: $('.aw-body', el), extra: $('.aw-extra', el), cleanup: [] };
    wins.set(id, win);
    el.addEventListener('pointerdown', () => focus(win), true);
    $('.aw-x', el).onclick = () => close(id);
    $('.aw-max', el).onclick = () => el.classList.toggle('max');
    $('.aw-min', el).onclick = () => minimize(id);
    const bar = $('.aw-bar', el);
    bar.ondblclick = (e) => { if (!e.target.closest('button')) el.classList.toggle('max'); };
    bar.onpointerdown = (e) => {
      if (e.target.closest('button') || el.classList.contains('max')) return;
      const sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop;
      el.classList.add('dragging');
      const mv = (ev) => { el.style.left = `${Math.min(innerWidth - 80, Math.max(-el.offsetWidth + 80, ev.clientX - sx))}px`; el.style.top = `${Math.min(innerHeight - 40, Math.max(0, ev.clientY - sy))}px`; };
      const up = () => { el.classList.remove('dragging'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    };
    try { build(win); } catch (e) { win.body.textContent = `Couldn't open: ${e.message}`; }
    return win;
  }
  /* minimized windows wait as chips on the taskbar */
  function minimize(id) {
    const w = wins.get(id);
    if (!w) return;
    w.el.hidden = true;
    let tray = $('#tb-min');
    if (!tray) { tray = document.createElement('div'); tray.id = 'tb-min'; $('#tb-center')?.appendChild(tray); }
    const chip = document.createElement('button');
    chip.className = 'tb-chip';
    chip.dataset.win = id;
    chip.title = `${$('.aw-bar b', w.el).textContent} (minimized)`;
    chip.innerHTML = $('.aw-ic', w.el).outerHTML;
    chip.onclick = () => restore(id);
    tray.appendChild(chip);
  }
  function restore(id) {
    const w = wins.get(id);
    $(`#tb-min [data-win="${id}"]`)?.remove();
    if (w) { w.el.hidden = false; focus(w); }
  }
  function close(id) {
    $(`#tb-min [data-win="${id}"]`)?.remove();
    const w = wins.get(id);
    if (!w) return;
    for (const f of w.cleanup) { try { f(); } catch (_) {} }
    w.el.remove();
    wins.delete(id);
  }

  async function openWeb(app) {
    const id = `web-${app.id}`;
    if (wins.has(id)) return openWin({ id });
    const win = openWin({ id, title: app.name, app, w: 1100, h: 720, build: (w) => {
      w.body.classList.add('aw-web');
      w.body.innerHTML = '<div class="aw-load">Opening…</div>';
      w.extra.innerHTML = '<button title="Back">‹</button><button title="Reload">⟳</button><button title="Open in the browser">↗</button>';
    } });
    win.el.classList.add('max-ish');
    const f = document.createElement('iframe');
    f.className = 'aw-frame';
    f.allow = 'fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture';
    f.addEventListener('load', () => $('.aw-load', win.body)?.remove());
    win.body.appendChild(f);
    try {
      const px = (await proxyEngine(engineFor(app.url))).frame(f);
      const [back, reload, out] = win.extra.querySelectorAll('button');
      back.onclick = () => px.back?.();
      reload.onclick = () => px.reload?.();
      // carry on in the full browser, where it is now
      out.onclick = () => { let u = app.url; try { u = realUrl({ frame: f, url: app.url, engine: engineFor(app.url) }) || u; } catch (_) {} close(id); openBrowser(); setTimeout(() => navigate(u), 300); };
      px.go(app.url);
      win.cleanup.push(() => { try { f.src = 'about:blank'; } catch (_) {} });
    } catch (e) {
      $('.aw-load', win.body).textContent = `Couldn't start the proxy: ${e.message}`;
    }
  }

  /* ---------- your own HTML games (public/games/, games.js) ---------- */
  let myGames = null;
  async function loadGames(force) {
    if (myGames && !force) return myGames;
    try { myGames = (await (await fetch('/api/games/local', { cache: 'no-cache' })).json()).games || []; } catch (_) { myGames = myGames || []; }
    return myGames;
  }
  const HUES = ['#4f8cff', '#a855f7', '#ff375f', '#30d158', '#ff9f0a', '#0a84ff', '#bf5af2', '#ff453a'];
  const hueOf = (s) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  const gameApp = (g) => ({ id: `game:${g.id}`, name: g.title, desc: g.description || 'Your game', icon: esc(g.title[0] || '?'), color: hueOf(g.title), cover: g.cover, game: g });
  function openGame(g) {
    const a = gameApp(g);
    openWin({ id: a.id, title: g.title, app: a, w: 960, h: 640, build: (win) => {
      win.body.classList.add('aw-web');
      win.extra.innerHTML = '<button title="Restart">⟳</button><button title="Fullscreen">⛶</button>';
      const f = document.createElement('iframe');
      f.className = 'aw-frame';
      f.src = g.url;
      f.allow = 'fullscreen; autoplay; gamepad; clipboard-write';
      // no top navigation: a game can't send the whole site somewhere else
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-popups allow-modals allow-downloads');
      win.body.appendChild(f);
      const [again, full] = win.extra.querySelectorAll('button');
      again.onclick = () => { f.src = g.url; };
      full.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : win.el.requestFullscreen()).catch?.(() => {});
      win.el.addEventListener('pointerdown', () => setTimeout(() => f.focus(), 0));
      setTimeout(() => f.focus(), 300);
      win.cleanup.push(() => { f.src = 'about:blank'; });
    } });
    try { track('app', 'games'); } catch (_) {}
  }

  /* ---------- the tools ---------- */
  const T = [];
  /* the tools' icons: a gradient tile and a white line drawing, like a phone's apps */
  const GLYPH = {"calc": {"from": "#ffb340", "to": "#ff8a00", "svg": "<rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"2.5\"/><rect x=\"8\" y=\"6\" width=\"8\" height=\"3\" rx=\".6\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"8.6\" cy=\"13\" r=\".6\" fill=\"currentColor\"/><circle cx=\"12\" cy=\"13\" r=\".6\" fill=\"currentColor\"/><circle cx=\"15.4\" cy=\"13\" r=\".6\" fill=\"currentColor\"/><circle cx=\"8.6\" cy=\"17\" r=\".6\" fill=\"currentColor\"/><circle cx=\"12\" cy=\"17\" r=\".6\" fill=\"currentColor\"/><circle cx=\"15.4\" cy=\"17\" r=\".6\" fill=\"currentColor\"/>"}, "notes": {"from": "#ffe066", "to": "#f7b500", "svg": "<path d=\"M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z\"/><path d=\"M15 3v4h4\"/><path d=\"M8.5 11h7M8.5 14.5h7M8.5 18h4\"/>"}, "paint": {"from": "#ff6b8b", "to": "#e8265e", "svg": "<path d=\"M18.4 3.6a2 2 0 0 1 2.8 2.8l-8.5 8.5-3.4.6.6-3.4z\"/><path d=\"M8.2 15.1c-2.2 0-3.4 1.4-3.4 3.2 0 1.1-.6 1.9-1.6 2.2 4.3 1 7.6-.4 7.6-3.4\"/>"}, "code": {"from": "#3ddc84", "to": "#18a058", "svg": "<path d=\"m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14\"/>"}, "focus": {"from": "#ff7a6b", "to": "#e5342b", "svg": "<circle cx=\"12\" cy=\"13.5\" r=\"7.5\"/><path d=\"M12 9.5v4l2.5 2\"/><path d=\"M9.5 3h5M12 3v3\"/>"}, "stopwatch": {"from": "#5ad2ff", "to": "#1e90d6", "svg": "<circle cx=\"12\" cy=\"13.5\" r=\"7.5\"/><path d=\"M12 13.5 15 10.5\"/><path d=\"M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5\"/>"}, "calendar": {"from": "#ff6b6b", "to": "#e0302b", "svg": "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2.5\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/><path d=\"M8 14h2M12 14h2M16 14h.01M8 17.5h2M12 17.5h2\" />"}, "convert": {"from": "#8a87ff", "to": "#4c49d8", "svg": "<path d=\"M4 8h13l-3.5-3.5M20 16H7l3.5 3.5\"/>"}, "password": {"from": "#4fd27a", "to": "#1f9e4f", "svg": "<rect x=\"4.5\" y=\"10.5\" width=\"15\" height=\"10\" rx=\"2.2\"/><path d=\"M8 10.5V7.5a4 4 0 0 1 8 0v3\"/><circle cx=\"12\" cy=\"15.5\" r=\"1.4\" fill=\"currentColor\"/>"}, "dictionary": {"from": "#c77dff", "to": "#8e3fd9", "svg": "<path d=\"M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z\"/><path d=\"M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5\"/><path d=\"M9 8h7M9 11.5h5\"/>"}, "typing": {"from": "#4aa3ff", "to": "#1565d8", "svg": "<rect x=\"2.5\" y=\"6\" width=\"19\" height=\"12\" rx=\"2.2\"/><path d=\"M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 14h.01M18 14h.01M8.5 14h7\"/>"}, "camera": {"from": "#8e9aaf", "to": "#4b5568", "svg": "<path d=\"M4.5 7.5h3l1.8-2.5h5.4l1.8 2.5h3a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V9a1.5 1.5 0 0 1 1.5-1.5z\"/><circle cx=\"12\" cy=\"13.5\" r=\"3.6\"/>"}, "recorder": {"from": "#ff5577", "to": "#d6123c", "svg": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"13\" rx=\"2.2\"/><path d=\"M8 21h8M12 17v4\"/><circle cx=\"12\" cy=\"10.5\" r=\"2.8\" fill=\"currentColor\"/>"}, "soundboard": {"from": "#ffb340", "to": "#f06d00", "svg": "<path d=\"M11 5 6.5 9H3.5v6h3L11 19z\"/><path d=\"M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13\"/>"}, "clock": {"from": "#4cc9f0", "to": "#1a7fc1", "svg": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c2.6 2.5 4 5.6 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.6-4-9s1.4-6.5 4-9z\"/>"}, "words": {"from": "#c9a46b", "to": "#8d6a35", "svg": "<path d=\"M4 7V5h16v2M12 5v14M9 19h6\"/>"}, "color": {"from": "#ff5fb0", "to": "#d6247b", "svg": "<path d=\"M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-7.9-9-7.9z\"/><circle cx=\"7.5\" cy=\"11.5\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"10\" cy=\"7.3\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"14.6\" cy=\"7.3\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"17.2\" cy=\"11.2\" r=\"1.2\" fill=\"currentColor\"/>"}, "snake": {"from": "#3ddc84", "to": "#14873f", "svg": "<path d=\"M5 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7\"/><circle cx=\"17.5\" cy=\"7\" r=\"1.6\" fill=\"currentColor\"/><path d=\"M19 7h2\"/>"}};
  const tool = (id, name, icon, color, desc, w, h, build) => T.push({ id, name, icon, color, desc, w, h, build, glyph: GLYPH[id] });

  tool('calc', 'Calculator', '🧮', '#ff9f0a', 'Quick maths, with brackets and %', 320, 470, (win) => {
    win.body.innerHTML = `<div class="calc"><div class="calc-hist"></div><input class="calc-out" value="0" readonly><div class="calc-keys">${['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '%', '0', '.', '='].map((k) => `<button data-k="${k}" class="${/[÷×−+=]/.test(k) ? 'op' : k === 'C' ? 'fn' : ''}">${k}</button>`).join('')}</div></div>`;
    const out = $('.calc-out', win.body), hist = $('.calc-hist', win.body);
    let expr = '';
    const show = () => { out.value = expr || '0'; };
    const evalIt = () => {
      const js = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
      if (!/^[\d+\-*/().\s]+$/.test(js)) return 'Error';
      try { const v = Function(`"use strict";return(${js})`)(); return Number.isFinite(v) ? String(+v.toFixed(10)) : 'Error'; } catch (_) { return 'Error'; }
    };
    const press = (k) => {
      if (k === 'C') expr = '';
      else if (k === '=') { const r = evalIt(); hist.textContent = `${expr} =`; expr = r === 'Error' ? '' : r; out.value = r; return; }
      else if (k === '⌫') expr = expr.slice(0, -1);
      else expr += k;
      show();
    };
    win.body.addEventListener('click', (e) => { const k = e.target.closest('button')?.dataset.k; if (k) press(k); });
    const keys = (e) => {
      if (wins.get('calc')?.el.style.zIndex != z) return;
      const m = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C' };
      const k = m[e.key] || (/^[\d+().%]$/.test(e.key) ? e.key : null);
      if (k && !e.target.closest('input:not(.calc-out),textarea')) { e.preventDefault(); press(k); }
    };
    addEventListener('keydown', keys);
    win.cleanup.push(() => removeEventListener('keydown', keys));
  });

  tool('notes', 'Notes', '📝', '#ffd60a', 'Notes that save as you type', 640, 460, (win) => {
    data.notes ||= [{ id: Date.now(), title: 'My first note', text: '' }];
    let cur = data.notes[0].id;
    win.body.innerHTML = '<div class="notes"><aside><button class="btn sm primary n-new">+ New note</button><div class="n-list"></div></aside><div class="n-ed"><input class="field n-title" placeholder="Title"><textarea class="n-text" placeholder="Write something…"></textarea><div class="n-foot"><span class="n-saved"></span><button class="btn sm n-del">Delete</button></div></div></div>';
    const list = $('.n-list', win.body), ti = $('.n-title', win.body), tx = $('.n-text', win.body);
    const note = () => data.notes.find((n) => n.id === cur);
    const render = () => {
      list.innerHTML = data.notes.map((n) => `<button class="n-item${n.id === cur ? ' on' : ''}" data-id="${n.id}"><b>${esc(n.title || 'Untitled')}</b><small>${esc((n.text || '').slice(0, 40) || 'Empty')}</small></button>`).join('');
      const n = note(); ti.value = n?.title || ''; tx.value = n?.text || '';
    };
    list.onclick = (e) => { const b = e.target.closest('.n-item'); if (b) { cur = +b.dataset.id; render(); } };
    let t;
    const typed = () => { const n = note(); if (!n) return; n.title = ti.value; n.text = tx.value; clearTimeout(t); t = setTimeout(() => { save(); $('.n-saved', win.body).textContent = 'Saved'; const b = list.querySelector(`[data-id="${cur}"]`); if (b) b.innerHTML = `<b>${esc(n.title || 'Untitled')}</b><small>${esc(n.text.slice(0, 40) || 'Empty')}</small>`; }, 300); $('.n-saved', win.body).textContent = '…'; };
    ti.oninput = tx.oninput = typed;
    $('.n-new', win.body).onclick = () => { const n = { id: Date.now(), title: '', text: '' }; data.notes.unshift(n); cur = n.id; save(); render(); ti.focus(); };
    $('.n-del', win.body).onclick = () => { if (!confirm('Delete this note?')) return; data.notes = data.notes.filter((n) => n.id !== cur); if (!data.notes.length) data.notes.push({ id: Date.now(), title: '', text: '' }); cur = data.notes[0].id; save(); render(); };
    render();
  });

  tool('paint', 'Paint', '🖌️', '#ff375f', 'Draw, then save it as a picture', 760, 560, (win) => {
    win.body.innerHTML = `<div class="paint"><div class="p-bar"><input type="color" value="#4f8cff" class="p-col"><input type="range" min="1" max="40" value="6" class="p-size"><button class="btn sm p-pen on">Pen</button><button class="btn sm p-er">Eraser</button><span class="sp"></span><button class="btn sm p-clear">Clear</button><button class="btn sm primary p-save">Save</button></div><canvas></canvas></div>`;
    const c = $('canvas', win.body), ctx = c.getContext('2d');
    let erase = false, down = false, last = null;
    const fit = () => { const img = c.width ? ctx.getImageData(0, 0, c.width, c.height) : null; c.width = c.clientWidth; c.height = c.clientHeight; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); if (img) ctx.putImageData(img, 0, 0); };
    const ro = new ResizeObserver(fit); ro.observe(c); win.cleanup.push(() => ro.disconnect());
    const pt = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.onpointerdown = (e) => { down = true; last = pt(e); c.setPointerCapture(e.pointerId); c.onpointermove(e); };
    c.onpointermove = (e) => { if (!down) return; const p = pt(e); ctx.strokeStyle = erase ? '#fff' : $('.p-col', win.body).value; ctx.lineWidth = +$('.p-size', win.body).value * (erase ? 2 : 1); ctx.lineCap = ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; };
    c.onpointerup = () => { down = false; };
    $('.p-pen', win.body).onclick = (e) => { erase = false; e.target.classList.add('on'); $('.p-er', win.body).classList.remove('on'); };
    $('.p-er', win.body).onclick = (e) => { erase = true; e.target.classList.add('on'); $('.p-pen', win.body).classList.remove('on'); };
    $('.p-clear', win.body).onclick = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); };
    $('.p-save', win.body).onclick = () => { const a = document.createElement('a'); a.download = 'drawing.png'; a.href = c.toDataURL('image/png'); a.click(); };
  });

  tool('code', 'Code Playground', '💻', '#30d158', 'HTML, CSS and JavaScript with a live preview', 900, 600, (win) => {
    data.code ||= { html: '<h1>Hello!</h1>\n<button onclick="go()">Click me</button>', css: 'body{font-family:system-ui;padding:20px}\nh1{color:#4f8cff}', js: 'function go(){\n  document.querySelector("h1").textContent = "You clicked it!";\n}' };
    win.body.innerHTML = '<div class="code"><div class="c-eds"><label>HTML<textarea data-k="html" spellcheck="false"></textarea></label><label>CSS<textarea data-k="css" spellcheck="false"></textarea></label><label>JS<textarea data-k="js" spellcheck="false"></textarea></label></div><iframe sandbox="allow-scripts allow-modals" class="c-out"></iframe></div>';
    const out = $('.c-out', win.body);
    let t;
    const run = () => { out.srcdoc = `<!doctype html><style>${data.code.css}</style>${data.code.html}<script>${data.code.js.replace(/<\/script/gi, '<\\/script')}<\/script>`; };
    win.body.querySelectorAll('textarea').forEach((ta) => {
      ta.value = data.code[ta.dataset.k];
      ta.oninput = () => { data.code[ta.dataset.k] = ta.value; clearTimeout(t); t = setTimeout(() => { save(); run(); }, 400); };
      ta.onkeydown = (e) => { if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.oninput(); } };
    });
    run();
  });

  tool('focus', 'Focus Timer', '🍅', '#ff453a', 'Pomodoro: 25 minutes on, 5 off', 340, 400, (win) => {
    const MODES = { focus: 25, short: 5, long: 15 };
    let mode = 'focus', left = MODES.focus * 60, timer = null, done = 0;
    win.body.innerHTML = '<div class="pomo"><div class="seg pm-modes"><button data-m="focus" class="on">Focus</button><button data-m="short">Short break</button><button data-m="long">Long break</button></div><div class="pm-time">25:00</div><div class="pm-btns"><button class="btn primary pm-go">Start</button><button class="btn pm-reset">Reset</button></div><small class="pm-done">0 done today</small></div>';
    const time = $('.pm-time', win.body), go = $('.pm-go', win.body);
    const draw = () => { time.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; };
    const stop = () => { clearInterval(timer); timer = null; go.textContent = 'Start'; };
    const set = (m) => { stop(); mode = m; left = MODES[m] * 60; win.body.querySelectorAll('.pm-modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); draw(); };
    go.onclick = () => {
      if (timer) return stop();
      go.textContent = 'Pause';
      timer = setInterval(() => {
        if (--left > 0) return draw();
        stop(); beep();
        if (mode === 'focus') { done++; $('.pm-done', win.body).textContent = `${done} done today`; toast('Focus session done. Take a break!', 'ok'); set(done % 4 ? 'short' : 'long'); }
        else { toast('Break over. Back to it!', 'ok'); set('focus'); }
      }, 1000);
    };
    $('.pm-reset', win.body).onclick = () => set(mode);
    $('.pm-modes', win.body).onclick = (e) => { const m = e.target.dataset.m; if (m) set(m); };
    win.cleanup.push(stop);
  });

  tool('stopwatch', 'Stopwatch', '⏱️', '#64d2ff', 'Stopwatch with laps, and a countdown', 340, 440, (win) => {
    win.body.innerHTML = '<div class="sw"><div class="seg sw-tabs"><button data-t="sw" class="on">Stopwatch</button><button data-t="cd">Timer</button></div><div class="sw-time">00:00.00</div><div class="sw-cd" hidden><input class="field" type="number" min="0" max="999" value="5" class="sw-min"> min</div><div class="pm-btns"><button class="btn primary sw-go">Start</button><button class="btn sw-lap">Lap</button></div><ol class="sw-laps"></ol></div>';
    const time = $('.sw-time', win.body), go = $('.sw-go', win.body), lap = $('.sw-lap', win.body);
    let tab = 'sw', start = 0, acc = 0, raf = 0, running = false, target = 0;
    const fmt = (ms) => { ms = Math.max(0, ms); const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };
    const now = () => acc + (running ? performance.now() - start : 0);
    const tick = () => {
      if (tab === 'sw') time.textContent = fmt(now());
      else { const left = target - now(); time.textContent = fmt(left); if (left <= 0) { stop(); beep(); toast("Time's up!", 'ok'); return; } }
      raf = requestAnimationFrame(tick);
    };
    const stop = () => { if (running) acc += performance.now() - start; running = false; cancelAnimationFrame(raf); go.textContent = 'Start'; };
    go.onclick = () => { if (running) return stop(); if (tab === 'cd' && !acc) target = (+$('.sw-cd input', win.body).value || 1) * 60000; running = true; start = performance.now(); go.textContent = 'Pause'; tick(); };
    lap.onclick = () => { if (tab === 'sw' && running) { const li = document.createElement('li'); li.textContent = fmt(now()); $('.sw-laps', win.body).prepend(li); } else { stop(); acc = 0; $('.sw-laps', win.body).innerHTML = ''; time.textContent = tab === 'sw' ? fmt(0) : fmt((+$('.sw-cd input', win.body).value || 1) * 60000); } };
    $('.sw-tabs', win.body).onclick = (e) => { const t = e.target.dataset.t; if (!t) return; stop(); acc = 0; tab = t; win.body.querySelectorAll('.sw-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); $('.sw-cd', win.body).hidden = t !== 'cd'; lap.textContent = t === 'sw' ? 'Lap' : 'Reset'; time.textContent = t === 'sw' ? fmt(0) : fmt((+$('.sw-cd input', win.body).value || 1) * 60000); };
    win.cleanup.push(stop);
  });

  tool('calendar', 'Calendar', '📅', '#ff3b30', 'Your month, with events and reminders', 520, 520, (win) => {
    data.events ||= {};
    let view = new Date(); view.setDate(1);
    const key = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    let pick = key(new Date());
    const render = () => {
      const y = view.getFullYear(), m = view.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), today = key(new Date());
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<span></span>';
      for (let d = 1; d <= days; d++) { const k = `${y}-${m + 1}-${d}`; cells += `<button data-k="${k}" class="${k === today ? 'today ' : ''}${k === pick ? 'on ' : ''}${data.events[k]?.length ? 'has' : ''}">${d}</button>`; }
      const ev = data.events[pick] || [];
      win.body.innerHTML = `<div class="cal"><div class="cal-head"><button class="btn sm cal-prev">‹</button><b>${view.toLocaleDateString([], { month: 'long', year: 'numeric' })}</b><button class="btn sm cal-next">›</button></div><div class="cal-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<i>${d}</i>`).join('')}${cells}</div><div class="cal-day"><b>${new Date(...pick.split('-').map((n, i) => (i === 1 ? n - 1 : +n))).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</b>${ev.map((e, i) => `<div class="cal-ev"><span>${esc(e.time || '')}</span>${esc(e.text)}<button data-del="${i}">✕</button></div>`).join('') || '<small>Nothing planned.</small>'}<form class="cal-add"><input class="field" type="time"><input class="field" placeholder="Add an event" maxlength="80" required><button class="btn sm primary">Add</button></form></div></div>`;
    };
    win.body.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('cal-prev')) view.setMonth(view.getMonth() - 1);
      else if (b.classList.contains('cal-next')) view.setMonth(view.getMonth() + 1);
      else if (b.dataset.k) pick = b.dataset.k;
      else if (b.dataset.del) { data.events[pick].splice(+b.dataset.del, 1); save(); }
      else return;
      render();
    };
    win.body.onsubmit = (e) => { e.preventDefault(); const [t, x] = e.target.querySelectorAll('input'); (data.events[pick] ||= []).push({ time: t.value, text: x.value.trim() }); data.events[pick].sort((a, b) => (a.time || '').localeCompare(b.time || '')); save(); render(); };
    render();
  });

  tool('convert', 'Unit Converter', '📏', '#5e5ce6', 'Length, weight, temperature and more', 380, 380, (win) => {
    const U = {
      Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
      Weight: { kg: 1, g: 0.001, lb: 0.45359237, oz: 0.028349523, t: 1000 },
      Volume: { L: 1, mL: 0.001, gal: 3.785411784, qt: 0.946352946, cup: 0.2365882365, 'fl oz': 0.0295735296 },
      Speed: { 'km/h': 1, mph: 1.609344, 'm/s': 3.6, knot: 1.852 },
      Data: { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 },
      Temperature: { '°C': 'c', '°F': 'f', K: 'k' },
    };
    win.body.innerHTML = `<div class="conv"><select class="field cv-kind">${Object.keys(U).map((k) => `<option>${k}</option>`).join('')}</select><div class="cv-row"><input class="field cv-a" type="number" value="1"><select class="field cv-ua"></select></div><div class="cv-eq">=</div><div class="cv-row"><input class="field cv-b" type="number"><select class="field cv-ub"></select></div></div>`;
    const kind = $('.cv-kind', win.body), a = $('.cv-a', win.body), b = $('.cv-b', win.body), ua = $('.cv-ua', win.body), ub = $('.cv-ub', win.body);
    const toC = (v, u) => (u === 'c' ? v : u === 'f' ? (v - 32) * 5 / 9 : v - 273.15);
    const fromC = (v, u) => (u === 'c' ? v : u === 'f' ? v * 9 / 5 + 32 : v + 273.15);
    const conv = (v, from, to) => { const t = U[kind.value]; return kind.value === 'Temperature' ? fromC(toC(v, t[from]), t[to]) : v * t[from] / t[to]; };
    const fill = () => { const ks = Object.keys(U[kind.value]); ua.innerHTML = ub.innerHTML = ks.map((k) => `<option>${k}</option>`).join(''); ub.selectedIndex = 1; calc(); };
    const calc = (rev) => { const n = rev ? conv(+b.value, ub.value, ua.value) : conv(+a.value, ua.value, ub.value); (rev ? a : b).value = Number.isFinite(n) ? +n.toPrecision(8) : ''; };
    kind.onchange = fill; a.oninput = ua.onchange = ub.onchange = () => calc(); b.oninput = () => calc(true);
    fill();
  });

  tool('password', 'Password Maker', '🔐', '#34c759', 'Strong passwords, made on your device', 380, 360, (win) => {
    win.body.innerHTML = '<div class="pw"><div class="pw-out"><input class="field pw-val" readonly><button class="btn sm primary pw-copy">Copy</button></div><label>Length <b class="pw-n">16</b><input type="range" min="6" max="64" value="16" class="pw-len"></label><label><input type="checkbox" checked data-s="ABCDEFGHJKLMNPQRSTUVWXYZ"> Capitals</label><label><input type="checkbox" checked data-s="abcdefghijkmnopqrstuvwxyz"> Lowercase</label><label><input type="checkbox" checked data-s="23456789"> Numbers</label><label><input type="checkbox" checked data-s="!@#$%^&*-_=+?"> Symbols</label><button class="btn pw-new">Make another</button><small class="pw-str"></small></div>';
    const make = () => {
      const sets = [...win.body.querySelectorAll('[data-s]')].filter((c) => c.checked).map((c) => c.dataset.s);
      if (!sets.length) return;
      const len = +$('.pw-len', win.body).value, all = sets.join(''), r = new Uint32Array(len);
      crypto.getRandomValues(r);
      $('.pw-val', win.body).value = [...r].map((x) => all[x % all.length]).join('');
      $('.pw-n', win.body).textContent = len;
      const bits = Math.round(len * Math.log2(all.length));
      $('.pw-str', win.body).textContent = bits >= 80 ? `Very strong (${bits} bits)` : bits >= 60 ? `Strong (${bits} bits)` : `Weak (${bits} bits), make it longer`;
    };
    win.body.oninput = make; $('.pw-new', win.body).onclick = make;
    $('.pw-copy', win.body).onclick = () => navigator.clipboard?.writeText($('.pw-val', win.body).value).then(() => toast('Copied', 'ok'));
    make();
  });

  tool('dictionary', 'Dictionary', '📖', '#bf5af2', 'Look up any English word', 440, 520, (win) => {
    win.body.innerHTML = '<div class="dict"><form><input class="field" placeholder="Type a word" maxlength="40"><button class="btn sm primary">Look up</button></form><div class="dict-out"><small>Meanings, examples and how to say it.</small></div></div>';
    const out = $('.dict-out', win.body);
    $('form', win.body).onsubmit = async (e) => {
      e.preventDefault();
      const w = $('input', win.body).value.trim(); if (!w) return;
      out.innerHTML = '<small>Looking it up…</small>';
      try {
        const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
        if (!r.ok) throw new Error(r.status === 404 ? `No definition found for “${w}”.` : `HTTP ${r.status}`);
        const [d] = await r.json();
        const audio = d.phonetics?.find((p) => p.audio)?.audio;
        out.innerHTML = `<h3>${esc(d.word)} <small>${esc(d.phonetic || d.phonetics?.find((p) => p.text)?.text || '')}</small>${audio ? ' <button class="btn sm d-say">🔊</button>' : ''}</h3>` + d.meanings.map((m) => `<p class="d-pos">${esc(m.partOfSpeech)}</p><ol>${m.definitions.slice(0, 4).map((x) => `<li>${esc(x.definition)}${x.example ? `<em>“${esc(x.example)}”</em>` : ''}</li>`).join('')}</ol>${m.synonyms?.length ? `<small>Similar: ${esc(m.synonyms.slice(0, 6).join(', '))}</small>` : ''}`).join('');
        if (audio) $('.d-say', out).onclick = () => { const s = speechSynthesis; s.cancel(); s.speak(new SpeechSynthesisUtterance(d.word)); };
      } catch (err) { out.innerHTML = `<small>${esc(err.message)}</small>`; }
    };
    setTimeout(() => $('input', win.body).focus(), 50);
  });

  tool('typing', 'Typing Test', '⌨️', '#0a84ff', 'How fast can you type?', 620, 400, (win) => {
    const WORDS = 'the quick brown fox jumps over lazy dog time people year way day thing man world life hand part child eye woman place work week case point number group problem fact be have do say get make go know take see come think look want give use find tell ask seem feel try leave call good new first last long great little own other old right big high different small large next early young important few public bad same able'.split(' ');
    let text = '', start = 0, timer = null;
    win.body.innerHTML = '<div class="typ"><div class="typ-text"></div><input class="field typ-in" placeholder="Start typing to begin (30 seconds)" autocomplete="off" spellcheck="false"><div class="typ-stats"><span><b class="t-wpm">0</b> WPM</span><span><b class="t-acc">100</b>% accurate</span><span><b class="t-left">30</b>s left</span></div><button class="btn sm typ-new">New test</button></div>';
    const box = $('.typ-text', win.body), inp = $('.typ-in', win.body);
    const reset = () => { clearInterval(timer); timer = null; start = 0; text = Array.from({ length: 60 }, () => WORDS[Math.floor(Math.random() * WORDS.length)]).join(' '); inp.value = ''; inp.disabled = false; $('.t-left', win.body).textContent = 30; draw(); };
    const draw = () => { const v = inp.value; box.innerHTML = [...text].map((ch, i) => `<span class="${i < v.length ? (v[i] === ch ? 'ok' : 'bad') : i === v.length ? 'cur' : ''}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join(''); };
    const stats = () => { const v = inp.value, mins = Math.max(1 / 60, (performance.now() - start) / 60000); let good = 0; for (let i = 0; i < v.length; i++) if (v[i] === text[i]) good++; $('.t-wpm', win.body).textContent = Math.round(good / 5 / mins); $('.t-acc', win.body).textContent = v.length ? Math.round(good / v.length * 100) : 100; };
    inp.oninput = () => {
      if (!start) { start = performance.now(); timer = setInterval(() => { const left = 30 - Math.floor((performance.now() - start) / 1000); $('.t-left', win.body).textContent = Math.max(0, left); stats(); if (left <= 0) { clearInterval(timer); inp.disabled = true; toast(`${$('.t-wpm', win.body).textContent} words a minute!`, 'ok'); } }, 250); }
      draw(); stats();
    };
    $('.typ-new', win.body).onclick = () => { reset(); inp.focus(); };
    win.cleanup.push(() => clearInterval(timer));
    reset();
  });

  tool('camera', 'Camera', '📸', '#8e8e93', 'Take photos with your webcam', 600, 520, (win) => {
    win.body.innerHTML = '<div class="cam"><video autoplay playsinline muted></video><div class="cam-bar"><button class="btn primary cam-snap">📸 Take photo</button><label><input type="checkbox" class="cam-mirror" checked> Mirror</label></div><div class="cam-shots"></div></div>';
    const v = $('video', win.body);
    let stream = null;
    navigator.mediaDevices?.getUserMedia({ video: { width: 1280, height: 720 } }).then((s) => { stream = s; v.srcObject = s; }, (e) => { v.replaceWith(Object.assign(document.createElement('p'), { className: 'cam-err', textContent: `The camera didn't start: ${e.message}` })); });
    $('.cam-mirror', win.body).onchange = (e) => v.classList.toggle('flip', !e.target.checked);
    $('.cam-snap', win.body).onclick = () => {
      if (!v.videoWidth) return;
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      const x = c.getContext('2d'); if ($('.cam-mirror', win.body).checked) { x.translate(c.width, 0); x.scale(-1, 1); } x.drawImage(v, 0, 0);
      const a = document.createElement('a'); a.href = c.toDataURL('image/jpeg', 0.92); a.download = `photo-${Date.now()}.jpg`; a.title = 'Save'; a.innerHTML = `<img src="${a.href}" alt="">`;
      $('.cam-shots', win.body).prepend(a);
    };
    win.cleanup.push(() => stream?.getTracks().forEach((t) => t.stop()));
  });

  tool('recorder', 'Screen Recorder', '⏺️', '#ff2d55', 'Record your screen or a tab, with sound', 460, 420, (win) => {
    win.body.innerHTML = '<div class="rec"><video controls hidden></video><p class="rec-msg">Pick a screen, window or tab to record. Tick "share audio" to keep its sound.</p><div class="pm-btns"><button class="btn primary rec-go">⏺ Start recording</button><a class="btn rec-dl" hidden download>Save video</a></div><small class="rec-t"></small></div>';
    let mr = null, stream = null, t0 = 0, iv = 0;
    const go = $('.rec-go', win.body);
    const stop = () => { if (mr?.state === 'recording') mr.stop(); stream?.getTracks().forEach((t) => t.stop()); clearInterval(iv); };
    go.onclick = async () => {
      if (mr?.state === 'recording') return stop();
      try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }); } catch (_) { return; }
      const chunks = [];
      const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5e6 });
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType }), url = URL.createObjectURL(blob);
        const v = $('video', win.body); v.src = url; v.hidden = false; $('.rec-msg', win.body).hidden = true;
        const dl = $('.rec-dl', win.body); dl.href = url; dl.download = `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`; dl.hidden = false;
        go.textContent = '⏺ Record again'; go.classList.remove('rec-on'); clearInterval(iv);
      };
      stream.getVideoTracks()[0].onended = stop;
      mr.start(1000); t0 = Date.now(); go.textContent = '⏹ Stop'; go.classList.add('rec-on');
      iv = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('.rec-t', win.body).textContent = `Recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    };
    win.cleanup.push(stop);
  });

  tool('soundboard', 'Soundboard', '🔊', '#ff9500', 'Air horn, drum roll, applause and more', 420, 420, (win) => {
    const S = [['📯', 'Air horn'], ['🥁', 'Drum roll'], ['👏', 'Applause'], ['🎉', 'Tada'], ['❌', 'Wrong'], ['✅', 'Correct'], ['🔔', 'Ding'], ['💥', 'Boom'], ['😂', 'Rimshot']];
    win.body.innerHTML = `<div class="sb">${S.map(([i, n], k) => `<button data-k="${k}"><span>${i}</span>${n}</button>`).join('')}</div>`;
    let ac = null;
    const A = () => (ac ||= new AudioContext());
    const tone = (f, at, dur, type = 'sine', vol = 0.3, slide) => { const a = A(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, a.currentTime + at); if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + at + dur); g.gain.setValueAtTime(vol, a.currentTime + at); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + at + dur); o.connect(g).connect(a.destination); o.start(a.currentTime + at); o.stop(a.currentTime + at + dur + 0.05); };
    const noise = (at, dur, vol = 0.4, hp = 0) => { const a = A(), b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; s.buffer = b; g.gain.value = vol; s.connect(f).connect(g).connect(a.destination); s.start(a.currentTime + at); };
    const play = [
      () => { [0, 0.35, 0.7].forEach((t) => [440, 554, 659].forEach((f) => tone(f, t, 0.3, 'sawtooth', 0.12))); },
      () => { for (let i = 0; i < 30; i++) noise(i * 0.05, 0.05, 0.25 + i / 60, 200); noise(1.55, 0.6, 0.8, 50); tone(80, 1.55, 0.6, 'sine', 0.6); },
      () => { for (let i = 0; i < 60; i++) noise(Math.random() * 2, 0.04, 0.3, 1200); },
      () => { tone(523, 0, 0.15, 'triangle'); tone(659, 0.15, 0.15, 'triangle'); tone(784, 0.3, 0.5, 'triangle'); tone(1046, 0.3, 0.5, 'triangle', 0.2); },
      () => { tone(160, 0, 0.35, 'square', 0.2); tone(120, 0.35, 0.5, 'square', 0.2); },
      () => { tone(880, 0, 0.12, 'sine'); tone(1320, 0.12, 0.3, 'sine'); },
      () => { tone(1568, 0, 1.2, 'sine', 0.3); tone(3136, 0, 0.6, 'sine', 0.08); },
      () => { noise(0, 1.2, 0.9, 20); tone(60, 0, 1, 'sine', 0.8, 30); },
      () => { noise(0, 0.08, 0.5, 2000); noise(0.18, 0.08, 0.5, 2000); tone(200, 0.36, 0.3, 'triangle', 0.4); noise(0.36, 0.5, 0.4, 6000); },
    ];
    win.body.onclick = (e) => { const b = e.target.closest('button'); if (b) play[+b.dataset.k](); };
    win.cleanup.push(() => ac?.close());
  });

  tool('clock', 'World Clock', '🌍', '#32ade6', 'The time anywhere in the world', 380, 460, (win) => {
    data.zones ||= ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo'];
    const all = Intl.supportedValuesOf?.('timeZone') || data.zones;
    win.body.innerHTML = `<div class="wclk"><div class="wclk-list"></div><form><select class="field">${all.map((z) => `<option>${z}</option>`).join('')}</select><button class="btn sm primary">Add</button></form></div>`;
    const list = $('.wclk-list', win.body);
    const draw = () => { list.innerHTML = data.zones.map((z, i) => { const d = new Date(); return `<div class="wclk-row"><div><b>${esc(z.split('/').pop().replace(/_/g, ' '))}</b><small>${d.toLocaleDateString([], { timeZone: z, weekday: 'short' })}</small></div><span>${d.toLocaleTimeString([], { timeZone: z, hour: 'numeric', minute: '2-digit' })}</span><button data-i="${i}">✕</button></div>`; }).join(''); };
    list.onclick = (e) => { const i = e.target.dataset.i; if (i) { data.zones.splice(+i, 1); save(); draw(); } };
    $('form', win.body).onsubmit = (e) => { e.preventDefault(); const z = $('select', win.body).value; if (!data.zones.includes(z)) { data.zones.push(z); save(); draw(); } };
    draw(); const iv = setInterval(draw, 15000); win.cleanup.push(() => clearInterval(iv));
  });

  tool('words', 'Word Counter', '🔤', '#ac8e68', 'Words, characters and reading time', 560, 440, (win) => {
    win.body.innerHTML = '<div class="wcnt"><textarea placeholder="Paste or type your text…"></textarea><div class="wcnt-s"></div><div class="pm-btns"><button class="btn sm" data-c="up">UPPERCASE</button><button class="btn sm" data-c="low">lowercase</button><button class="btn sm" data-c="title">Title Case</button><button class="btn sm" data-c="copy">Copy</button></div></div>';
    const ta = $('textarea', win.body), s = $('.wcnt-s', win.body);
    ta.value = data.words || '';
    const count = () => { const t = ta.value, w = (t.match(/\S+/g) || []).length; s.innerHTML = [['Words', w], ['Characters', t.length], ['Sentences', (t.match(/[^.!?]+[.!?]+/g) || []).length], ['Paragraphs', t.split(/\n\s*\n/).filter((p) => p.trim()).length], ['Reading', `${Math.max(1, Math.round(w / 230))} min`]].map(([k, v]) => `<span><b>${v}</b>${k}</span>`).join(''); data.words = t.slice(0, 20000); save(); };
    ta.oninput = count;
    win.body.querySelector('.pm-btns').onclick = (e) => { const c = e.target.dataset.c; if (!c) return; if (c === 'copy') return navigator.clipboard?.writeText(ta.value).then(() => toast('Copied', 'ok')); ta.value = c === 'up' ? ta.value.toUpperCase() : c === 'low' ? ta.value.toLowerCase() : ta.value.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()); count(); };
    count();
  });

  tool('color', 'Color Picker', '🎨', '#ff2d92', 'Pick colours and copy HEX, RGB, HSL', 360, 420, (win) => {
    win.body.innerHTML = `<div class="cp"><input type="color" value="#4f8cff" class="cp-in"><div class="cp-vals"></div>${'EyeDropper' in window ? '<button class="btn sm cp-drop">💧 Pick from screen</button>' : ''}<div class="cp-sw"></div></div>`;
    const inp = $('.cp-in', win.body);
    const draw = () => {
      const h = inp.value, r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
      const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, d = mx - mn;
      let hh = 0; const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
      if (d) { const [R, G, B] = [r / 255, g / 255, b / 255]; hh = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; hh = Math.round(hh * 60 + 360) % 360; }
      const vals = [h.toUpperCase(), `rgb(${r}, ${g}, ${b})`, `hsl(${hh}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`];
      $('.cp-vals', win.body).innerHTML = vals.map((v) => `<button title="Copy">${v}</button>`).join('');
      $('.cp-sw', win.body).innerHTML = [-30, -15, 0, 15, 30].map((k) => `<i style="background:hsl(${hh}, ${Math.round(s * 100)}%, ${Math.max(5, Math.min(95, Math.round(l * 100) + k))}%)"></i>`).join('');
    };
    inp.oninput = draw;
    $('.cp-vals', win.body).onclick = (e) => { if (e.target.tagName === 'BUTTON') navigator.clipboard?.writeText(e.target.textContent).then(() => toast(`Copied ${e.target.textContent}`, 'ok')); };
    $('.cp-drop', win.body)?.addEventListener('click', async () => { try { inp.value = (await new EyeDropper().open()).sRGBHex; draw(); } catch (_) {} });
    draw();
  });

  tool('snake', 'Snake', '🐍', '#30d158', 'The classic. Arrow keys or swipe', 420, 500, (win) => {
    win.body.innerHTML = '<div class="snk"><div class="snk-top"><span>Score <b class="snk-s">0</b></span><span>Best <b class="snk-b">0</b></span></div><canvas width="360" height="360"></canvas><small>Arrow keys or WASD. Space to pause.</small></div>';
    const c = $('canvas', win.body), x = c.getContext('2d'), N = 18, S = 20;
    let snake, dir, next, food, score, iv, paused = false;
    $('.snk-b', win.body).textContent = data.snake || 0;
    const place = () => { do { food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; } while (snake.some(([a, b]) => a === food[0] && b === food[1])); };
    const reset = () => { snake = [[8, 9], [7, 9], [6, 9]]; dir = next = [1, 0]; score = 0; $('.snk-s', win.body).textContent = 0; place(); };
    const draw = () => { x.fillStyle = '#111620'; x.fillRect(0, 0, 360, 360); x.fillStyle = '#ff453a'; x.beginPath(); x.arc(food[0] * S + 10, food[1] * S + 10, 8, 0, 7); x.fill(); snake.forEach(([a, b], i) => { x.fillStyle = i ? '#30d158' : '#7cf09a'; x.fillRect(a * S + 1, b * S + 1, S - 2, S - 2); }); };
    const step = () => {
      if (paused || wins.get('snake')?.el.hidden) return;
      dir = next;
      const h = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
      if (h[0] < 0 || h[1] < 0 || h[0] >= N || h[1] >= N || snake.some(([a, b]) => a === h[0] && b === h[1])) {
        if (score > (data.snake || 0)) { data.snake = score; save(); $('.snk-b', win.body).textContent = score; toast(`New best: ${score}!`, 'ok'); }
        reset(); return draw();
      }
      snake.unshift(h);
      if (h[0] === food[0] && h[1] === food[1]) { score++; $('.snk-s', win.body).textContent = score; place(); } else snake.pop();
      draw();
    };
    const keys = (e) => {
      if (wins.get('snake')?.el.style.zIndex != z) return;
      const m = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[e.key];
      if (e.key === ' ') { paused = !paused; e.preventDefault(); return; }
      if (m && !(m[0] === -dir[0] && m[1] === -dir[1])) { next = m; e.preventDefault(); }
    };
    let tx = 0, ty = 0;
    c.ontouchstart = (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; };
    c.ontouchend = (e) => { const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; const m = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; if (!(m[0] === -dir[0] && m[1] === -dir[1])) next = m; };
    addEventListener('keydown', keys);
    reset(); draw(); iv = setInterval(step, 120);
    win.cleanup.push(() => { clearInterval(iv); removeEventListener('keydown', keys); });
  });

  function beep() { try { const a = new AudioContext(); [0, 0.25, 0.5].forEach((t) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.3, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + t + 0.2); o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.22); }); setTimeout(() => a.close(), 1200); } catch (_) {} }

  function openTool(t) { openWin({ id: t.id, title: t.name, app: t, w: t.w, h: t.h, build: t.build }); }

  /* ---------- the launcher ---------- */
  const favs = () => (data.favs ||= ['youtube', 'calc', 'notes', 'discord']);
  function launcher() {
    const id = 'launcher';
    if (wins.has(id)) { const w = wins.get(id); focus(w); $('input', w.body).focus(); return; }
    openWin({ id, title: 'Apps', icon: '▦', color: 'linear-gradient(135deg,#4f8cff,#a855f7)', w: 820, h: 620, build: (win) => {
      win.body.innerHTML = '<div class="al"><input class="field al-q" placeholder="Search apps" autocomplete="off"><div class="al-list"></div></div>';
      const list = $('.al-list', win.body), q = $('.al-q', win.body);
      const card = (a) => `<div class="al-app" data-id="${a.id}" data-web="${a.web ? 1 : ''}" role="button" tabindex="0" title="${esc(a.desc || a.url)}"><span class="al-ic${tileClass(a)}" style="${tileStyle(a)}">${iconHtml(a)}</span><b>${esc(a.name)}</b><button class="al-fav${favs().includes(a.id) ? ' on' : ''}" title="Favourite">★</button></div>`;
      const draw = () => {
        const s = q.value.trim().toLowerCase(), m = (a) => !s || a.name.toLowerCase().includes(s);
        const G = (myGames || []).map(gameApp);
        const all = [...WEB, ...T, ...G], fav = favs().map((f) => all.find((a) => a.id === f)).filter((a) => a && m(a));
        list.innerHTML = (fav.length ? `<h4>Favourites</h4><div class="al-grid">${fav.map(card).join('')}</div>` : '')
          + `<h4>Websites <small>open in their own window</small></h4><div class="al-grid">${WEB.filter(m).map(card).join('') || '<small>None</small>'}</div>`
          + `<h4>Tools <small>built in, work offline</small></h4><div class="al-grid">${T.filter(m).map(card).join('') || '<small>None</small>'}</div>`
          + (G.length ? `<h4>Games <small>yours, from the games folder</small></h4><div class="al-grid">${G.filter(m).map(card).join('') || '<small>None</small>'}</div>` : '');
      };
      const launch = (el) => { const a = [...WEB, ...T, ...(myGames || []).map(gameApp)].find((x) => x.id === el.dataset.id); if (!a) return; try { click(); } catch (_) {} a.web ? openWeb(a) : a.game ? openGame(a.game) : openTool(a); };
      list.onclick = (e) => {
        const f = e.target.closest('.al-fav'), el = e.target.closest('.al-app');
        if (f) { const id = el.dataset.id, l = favs(); data.favs = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; save(); draw(); return; }
        if (el) launch(el);
      };
      list.onkeydown = (e) => { if (e.key === 'Enter' && e.target.classList.contains('al-app')) launch(e.target); };
      q.oninput = draw;
      q.onkeydown = (e) => { if (e.key === 'Enter') { const el = list.querySelector('.al-app'); if (el) launch(el); } };
      draw();
      loadGames(true).then(draw);
      setTimeout(() => q.focus(), 50);
    } });
  }

  addEventListener('keydown', (e) => { if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); launcher(); } });

  window.apps = { win: (o) => openWin(o), addTool: (t) => { if (!T.some((x) => x.id === t.id)) T.unshift({ ...t, glyph: t.glyph || GLYPH[t.id] }); }, games: loadGames, play: openGame, open: launcher, tool: (id) => { const t = T.find((x) => x.id === id); if (t) openTool(t); }, web: (id) => { const a = WEB.find((x) => x.id === id); if (a) openWeb(a); }, close, list: () => ({ web: WEB.map((a) => a.id), tools: T.map((t) => t.id) }), windows: () => [...wins.keys()] };
})();
