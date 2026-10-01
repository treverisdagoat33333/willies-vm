/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * The welcome tour and "What's new". A first visit gets a few skippable tips
 * that point at the real buttons; anyone who's been here before gets a short
 * card listing what changed since they last looked (NEWS, newest first).
 * Both remember themselves in localStorage, on this device only.
 */
(() => {
  const TOUR_KEY = 'wvm.tour.v1';
  const NEWS_KEY = 'wvm.news.seen';
  /* add new entries at the top; the id only has to grow */
  const NEWS = [
    { id: 7, date: 'Oct 2026', items: [
      ['🕹️', 'The Arcade', '1,700+ games that play right here, each in its own window. Search, categories, favourites, and your progress is saved.'],
    ] },
    { id: 6, date: 'Oct 2026', items: [
      ['▦', 'Apps', 'YouTube, Discord, TikTok and more open in their own window. Alt+P.'],
      ['🧮', '18 built-in tools', 'Calculator, notes, paint, code playground, focus timer, calendar, screen recorder and more.'],
    ] },
    { id: 5, date: 'Oct 2026', items: [
      ['⚡', 'Faster everywhere', 'The site and WillieJet download about a third as much and start sooner.'],
      ['🔍', 'Search chat', 'Ctrl+F in chat searches every channel and your DMs. Try from:name.'],
      ['📌', 'Pinned messages', 'Keep the important stuff at the top of a channel.'],
      ['🔔', 'Mute channels', 'Mute a busy channel and still hear your @mentions.'],
    ] },
    { id: 4, date: 'Sep 2026', items: [
      ['🎙️', 'Go Live in voice', 'Share your screen with the whole voice channel.'],
      ['🎬', 'Movies', 'Popular movies, shows and anime, right on the desktop.'],
    ] },
  ];

  const STEPS = [
    { title: 'Welcome to william\'s vm 👋', text: 'A whole desktop in your browser. Here\'s a 30-second look around. You can skip any time.' },
    { el: '#tb-browser', title: 'The browser', text: 'Open any site through our proxy, with its own tabs, bookmarks and history. WillieJet, our own engine, is the fastest.' },
    { el: '#tb-vm', title: 'Virtual machines', text: 'Start a real Linux desktop or a GPU machine in the cloud, for up to an hour.' },
    { el: '#tb-movies', title: 'Movies & music', text: 'Watch movies, shows and anime, or play music from SoundCloud, YouTube and more. Music keeps playing while you do other things.', also: '#tb-music' },
    { el: '#tb-chat', title: 'Chat with everyone', text: 'Channels, DMs, voice channels and calls. Make an account to save your name and settings on every device.' },
    { el: '#tb-ai', title: 'Ask the AI', text: 'It can answer questions, and do things for you too: "play some lo-fi", "make it dark blue", "open YouTube".' },
    { el: '#tb-settings', title: 'Make it yours', text: 'Themes, live wallpapers, widgets and the panic key are in Settings. Drag icons and widgets wherever you like.' },
    { title: 'That\'s it!', text: 'Press Alt+Space for the start menu any time. Have fun.' },
  ];

  const $ = (s) => document.querySelector(s);
  const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const latest = NEWS[0].id;

  let box = null;
  let hole = null;
  let step = 0;

  function build() {
    if (box) return;
    hole = document.createElement('div');
    hole.className = 'tour-hole';
    box = document.createElement('div');
    box.className = 'tour-card';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML = '<div class="tour-dots"></div><h3></h3><p></p><div class="tour-btns"><button class="btn sm tour-skip" type="button">Skip</button><span class="sp"></span><button class="btn sm tour-back" type="button">Back</button><button class="btn sm primary tour-next" type="button">Next</button></div>';
    document.body.append(hole, box);
    box.querySelector('.tour-skip').onclick = () => end();
    box.querySelector('.tour-back').onclick = () => show(step - 1);
    box.querySelector('.tour-next').onclick = () => (step >= STEPS.length - 1 ? end() : show(step + 1));
    addEventListener('resize', place);
    document.addEventListener('keydown', onKey, true);
  }
  function onKey(e) {
    if (!box) return;
    if (e.key === 'Escape') { e.stopPropagation(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); box.querySelector('.tour-next').click(); }
    else if (e.key === 'ArrowLeft' && step > 0) show(step - 1);
  }

  function target() {
    const s = STEPS[step];
    const el = s.el && $(s.el);
    if (!el || !el.offsetParent) return null;
    return el;
  }
  function place() {
    if (!box) return;
    const el = target();
    const pad = 6;
    if (!el) {
      hole.classList.add('center');
      hole.style.cssText = '';
      box.classList.add('center');
      box.style.left = box.style.top = '';
      return;
    }
    hole.classList.remove('center');
    box.classList.remove('center');
    let r = el.getBoundingClientRect();
    const also = STEPS[step].also && $(STEPS[step].also);
    if (also?.offsetParent) {
      const b = also.getBoundingClientRect();
      r = { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) };
    }
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.right - r.left + pad * 2}px`, height: `${r.bottom - r.top + pad * 2}px` });
    // the card goes above or below the button, kept on screen
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const below = r.top < innerHeight / 2;
    const left = Math.max(12, Math.min(innerWidth - w - 12, (r.left + r.right) / 2 - w / 2));
    const top = below ? r.bottom + 16 : r.top - h - 16;
    box.style.left = `${left}px`;
    box.style.top = `${Math.max(12, Math.min(innerHeight - h - 12, top))}px`;
  }
  function show(i) {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[step];
    box.querySelector('h3').textContent = s.title;
    box.querySelector('p').textContent = s.text;
    box.querySelector('.tour-back').style.display = step === 0 ? 'none' : '';
    box.querySelector('.tour-next').textContent = step === STEPS.length - 1 ? 'Let\'s go' : step === 0 ? 'Show me' : 'Next';
    box.querySelector('.tour-dots').innerHTML = STEPS.map((_, j) => `<i class="${j === step ? 'on' : ''}"></i>`).join('');
    $('#taskbar')?.classList.add('visible'); // an auto-hiding taskbar stays up while it's pointed at
    requestAnimationFrame(place);
    box.querySelector('.tour-next').focus({ preventScroll: true });
  }
  function end() {
    set(TOUR_KEY, '1');
    set(NEWS_KEY, String(latest)); // a new visitor has nothing "new" to catch up on
    box?.remove();
    hole?.remove();
    box = hole = null;
    removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey, true);
    $('#taskbar')?.classList.remove('visible');
  }
  function start() {
    closeNews();
    build();
    show(0);
  }

  /* ---- what's new ---- */
  let news = null;
  function closeNews() {
    if (!news) return;
    set(NEWS_KEY, String(latest));
    news.remove();
    news = null;
  }
  function showNews(all = false) {
    const seen = Number(get(NEWS_KEY)) || 0;
    const fresh = NEWS.filter((n) => all || n.id > seen);
    if (!fresh.length) return false;
    closeNews();
    news = document.createElement('div');
    news.className = 'news-card';
    news.setAttribute('role', 'dialog');
    news.setAttribute('aria-label', 'What\'s new');
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    news.innerHTML = `<div class="news-head"><b>What's new</b><small>${esc(fresh[0].date)}</small><span class="sp"></span><button class="news-x" type="button" title="Close">✕</button></div>`
      + fresh.slice(0, 2).map((n) => n.items.map(([icon, t, d]) => `<div class="news-item"><span class="ic">${icon}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></div>`).join('')).join('')
      + '<div class="news-foot"><button class="btn sm news-tour" type="button">Take the tour</button><button class="btn sm primary news-ok" type="button">Got it</button></div>';
    document.body.appendChild(news);
    news.querySelector('.news-x').onclick = closeNews;
    news.querySelector('.news-ok').onclick = closeNews;
    news.querySelector('.news-tour').onclick = () => { closeNews(); start(); };
    return true;
  }

  /* called once the desktop is showing (app.js, after sign-in) */
  function greet(returning = false) {
    if (document.querySelector('#auth-wrap:not(.hidden)')) return;
    // automated test browsers skip it unless a test asks for it, so it never covers what they click
    if (navigator.webdriver && !get('wvm.tour.test')) { set(TOUR_KEY, '1'); set(NEWS_KEY, String(latest)); return; }
    if (!get(TOUR_KEY)) {
      // someone who used the site before the tour existed isn't new
      if (returning) { set(TOUR_KEY, '1'); showNews(); } else start();
      return;
    }
    showNews();
  }

  window.tour = { start, greet, news: () => showNews(true), end };
})();
