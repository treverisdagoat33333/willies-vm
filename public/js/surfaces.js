/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
(() => {
  const surfaces = [...document.querySelectorAll('.panel,#browser-wrap,#chat-window,#ai-window,#music-window,#movies-wrap,#vm-wrap,#remote-wrap,#cloud-wrap')];
  window.nextSurfaceLayer = () => Math.max(80, ...surfaces.map(el => Number(el.style.zIndex) || 0), ...[...document.querySelectorAll('.aw')].map(el => Number(el.style.zIndex) || 0)) + 1;
  const visible = el => getComputedStyle(el).display !== 'none' && !el.classList.contains('closing') && !el.classList.contains('minimized');
  const previous = new Map(surfaces.map(el => [el, visible(el)]));
  const layers = new MutationObserver(() => {
    for (const el of surfaces) {
      const shown = visible(el);
      if (shown && !previous.get(el)) el.style.zIndex = window.nextSurfaceLayer();
      previous.set(el, shown);
    }
  });
  surfaces.forEach(el => layers.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }));
  const home = document.getElementById('browser-start');
  const saved = document.getElementById('browser-start-bookmarks');
  function sync(tab) {
    home.hidden = !tab?.start;
    document.getElementById('browser-wrap').classList.toggle('on-start', !!tab?.start);
    if (!tab?.start) return;
    const items = S.incognito ? [] : bookmarks;
    saved.replaceChildren();
    document.getElementById('browser-start-saved').hidden = !items.length;
    for (const item of items.slice(0, 8)) {
      const button = document.createElement('button');
      const icon = document.createElement('span');
      const label = document.createElement('b');
      icon.textContent = (item.title || item.url || 'W').slice(0, 1).toUpperCase();
      label.textContent = item.title || item.url;
      button.title = item.url;
      button.append(icon, label);
      button.addEventListener('click', () => navigate(item.url));
      saved.append(button);
    }
  }
  window.browserStart = {
    wanted: url => !url && !S.autoblank && /^https?:\/\/(www\.)?google\.com\/?$/.test(S.homepage),
    show(tab) {
      if (!tab) return;
      tab.start = true;
      tab.url = 'about:blank';
      tab.title = 'New tab';
      tab.leaving = null;
      tab.frame.src = 'about:blank';
      switchTab(tab.id);
      bstatus('', false);
    },
    sync,
  };
  document.getElementById('browser-start-search').addEventListener('submit', event => {
    event.preventDefault();
    const value = document.getElementById('browser-start-query').value.trim();
    if (value) navigate(value);
  });
  home.addEventListener('click', event => {
    const button = event.target.closest('[data-destination]');
    if (button) navigate(button.dataset.destination);
  });
  const chat = document.getElementById('chat-window');
  const toggle = document.getElementById('dc-menu');
  const backdrop = document.getElementById('dc-nav-backdrop');
  const mobile = matchMedia('(max-width: 640px)');
  function channels(open) {
    open = open && mobile.matches;
    chat.classList.toggle('channels-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    backdrop.hidden = !open;
    chat.querySelector('.dc-side').inert = mobile.matches && !open;
    if (open) document.querySelector('#dc-channels .dc-ch')?.focus();
  }
  toggle.addEventListener('click', () => channels(!chat.classList.contains('channels-open')));
  backdrop.addEventListener('click', () => { channels(false); toggle.focus(); });
  chat.querySelector('.dc-scroll').addEventListener('click', event => {
    if (event.target.closest('.dc-ch')) channels(false);
  });
  mobile.addEventListener('change', () => channels(false));
  channels(false);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && chat.classList.contains('channels-open')) {
      event.preventDefault();event.stopImmediatePropagation();channels(false);toggle.focus();
    }
  }, true);
})();
