/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * Files: each account's own cloud storage, as an app window (window.apps, drive.js
 * on the server). Folders, upload (button or drop), preview pictures, sound,
 * video and text in place, rename, move, download and delete.
 */
(() => {
  if (!window.apps) return;
  const ICONS = { image: '🖼️', audio: '🎵', video: '🎬', text: '📄', pdf: '📕', other: '📦', folder: '📁' };
  const kindOf = (t) => /^image\//.test(t) ? 'image' : /^audio\//.test(t) ? 'audio' : /^video\//.test(t) ? 'video' : t === 'text/plain' ? 'text' : t === 'application/pdf' ? 'pdf' : 'other';
  const size = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const api = async (url, opt = {}) => {
    const r = await fetch(url, opt);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };

  function build(win) {
    const B = win.body;
    B.classList.add('fx');
    if (typeof currentRole === 'undefined' || currentRole === 'guest') {
      B.innerHTML = '<div class="fx-empty"><div class="fx-big">☁️</div><h3>Your own cloud storage</h3><p>Make an account (or sign in) to keep files here and get them on any device.</p></div>';
      return;
    }
    B.innerHTML = `<aside class="fx-side"><button type="button" class="btn sm primary fx-up">⬆ Upload</button><button type="button" class="btn sm fx-mk">＋ New folder</button><div class="fx-tree"></div><div class="fx-use"><div class="fx-bar"><i></i></div><small></small></div></aside>
      <main class="fx-main"><div class="fx-top"><div class="fx-crumbs"></div><input class="field fx-q" type="search" placeholder="Search files" autocomplete="off"></div><div class="fx-grid"></div><div class="fx-drop">Drop files to upload them here</div></main>
      <div class="fx-view" hidden><div class="fx-view-bar"><b></b><span class="sp"></span><a class="btn sm fx-dl">Download</a><button type="button" class="btn sm fx-vx">Close</button></div><div class="fx-view-body"></div></div>
      <input type="file" class="fx-file" multiple hidden>`;
    let state = { files: [], folders: [], used: 0, quota: 1 }, at = '/', q = '';
    const $b = (s) => B.querySelector(s);

    async function load() {
      try { state = await api('/api/drive'); } catch (e) { $b('.fx-grid').innerHTML = `<p class="fx-err">${esc(e.message)}</p>`; return; }
      draw();
    }
    const kids = (p) => state.folders.filter((f) => f.slice(0, f.lastIndexOf('/') || 1) === p && f !== p);
    function draw() {
      // the tree: every folder, indented by depth
      $b('.fx-tree').innerHTML = [['/', 'My files', 0], ...state.folders.map((f) => [f, f.split('/').pop(), f.split('/').length - 1])]
        .map(([p, n, d]) => `<button type="button" class="fx-node${p === at ? ' on' : ''}" data-p="${esc(p)}" style="padding-left:${10 + d * 14}px">${d ? '📁' : '🏠'} ${esc(n)}</button>`).join('');
      const pct = Math.min(100, Math.round((state.used / state.quota) * 100));
      $b('.fx-bar i').style.width = pct + '%';
      $b('.fx-use small').textContent = `${size(state.used)} of ${size(state.quota)} used`;
      // where you are
      const parts = at.split('/').filter(Boolean);
      $b('.fx-crumbs').innerHTML = `<button type="button" data-p="/">My files</button>` + parts.map((p, i) => `<span>›</span><button type="button" data-p="${esc('/' + parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`).join('');
      const ql = q.toLowerCase();
      const files = q ? state.files.filter((f) => f.name.toLowerCase().includes(ql)) : state.files.filter((f) => f.folder === at);
      const folders = q ? [] : kids(at);
      if (!files.length && !folders.length) {
        $b('.fx-grid').innerHTML = `<div class="fx-empty"><div class="fx-big">${q ? '🔍' : '📂'}</div><p>${q ? 'No files match.' : 'Nothing here yet. Upload something, or drop files onto this window.'}</p></div>`;
        return;
      }
      $b('.fx-grid').innerHTML = folders.map((p) => `<div class="fx-it fx-folder" data-p="${esc(p)}" tabindex="0"><div class="fx-thumb">📁</div><b>${esc(p.split('/').pop())}</b><small>${state.files.filter((f) => f.folder === p || f.folder.startsWith(p + '/')).length} items</small><div class="fx-acts"><button type="button" class="fx-delf" title="Delete folder">🗑</button></div></div>`).join('')
        + files.map((f) => { const k = kindOf(f.type); return `<div class="fx-it" data-id="${f.id}" tabindex="0"><div class="fx-thumb">${k === 'image' ? `<img loading="lazy" src="/api/drive/${f.id}" alt="">` : ICONS[k]}</div><b title="${esc(f.name)}">${esc(f.name)}</b><small>${size(f.size)}${q ? ` · ${esc(f.folder)}` : ''}</small><div class="fx-acts"><button type="button" class="fx-ren" title="Rename">✏️</button><button type="button" class="fx-mv" title="Move">📂</button><a class="fx-get" title="Download" href="/api/drive/${f.id}?download=1" download="${esc(f.name)}">⬇</a><button type="button" class="fx-del" title="Delete">🗑</button></div></div>`; }).join('');
    }
    function go(p) { at = p; q = ''; $b('.fx-q').value = ''; draw(); }

    async function upload(list) {
      const files = [...list];
      if (!files.length) return;
      for (const [i, f] of files.entries()) {
        toast(`Uploading ${files.length > 1 ? `${i + 1} of ${files.length}: ` : ''}${f.name}…`);
        try { await api(`/api/drive?name=${encodeURIComponent(f.name)}&folder=${encodeURIComponent(at)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f }); }
        catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
      }
      toast(files.length > 1 ? `Uploaded ${files.length} files` : 'Uploaded', 'ok');
      load();
    }
    function view(f) {
      const k = kindOf(f.type), url = `/api/drive/${f.id}`, body = $b('.fx-view-body');
      $b('.fx-view b').textContent = f.name;
      const dl = $b('.fx-dl'); dl.href = url + '?download=1'; dl.download = f.name;
      body.replaceChildren();
      if (k === 'image') { const i = document.createElement('img'); i.src = url; i.alt = f.name; body.appendChild(i); }
      else if (k === 'audio' || k === 'video') { const m = document.createElement(k); m.src = url; m.controls = true; m.autoplay = true; body.appendChild(m); }
      else if (k === 'text') { const pre = document.createElement('pre'); pre.textContent = 'Loading…'; body.appendChild(pre); fetch(url).then((r) => r.text()).then((t) => { pre.textContent = t.slice(0, 200_000); }); }
      else { body.innerHTML = `<div class="fx-empty"><div class="fx-big">${ICONS[k]}</div><p>This kind of file can't be shown here. Download it to open it.</p></div>`; }
      $b('.fx-view').hidden = false;
    }
    const closeView = () => { const v = $b('.fx-view'); v.hidden = true; v.querySelector('.fx-view-body').replaceChildren(); };

    B.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('.fx-up')) { click(); $b('.fx-file').click(); return; }
      if (t.closest('.fx-vx')) { closeView(); return; }
      if (t.closest('.fx-mk')) {
        const n = prompt('Folder name');
        if (!n?.trim()) return;
        try { const d = await api('/api/drive/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: (at === '/' ? '' : at) + '/' + n.trim() }) }); await load(); go(d.path); } catch (er) { toast(er.message, 'err'); }
        return;
      }
      const nav = t.closest('.fx-node, .fx-crumbs button');
      if (nav) { click(); go(nav.dataset.p); return; }
      const it = t.closest('.fx-it'); if (!it) return;
      if (it.classList.contains('fx-folder')) {
        if (t.closest('.fx-delf')) {
          if (!confirm(`Delete the folder "${it.dataset.p.split('/').pop()}" and everything in it?`)) return;
          try { await api('/api/drive/folders?path=' + encodeURIComponent(it.dataset.p), { method: 'DELETE' }); load(); } catch (er) { toast(er.message, 'err'); }
          return;
        }
        click(); go(it.dataset.p); return;
      }
      const f = state.files.find((x) => x.id === it.dataset.id); if (!f) return;
      if (t.closest('.fx-get')) return; // the link downloads it
      if (t.closest('.fx-del')) {
        if (!confirm(`Delete "${f.name}"?`)) return;
        try { await api('/api/drive/' + f.id, { method: 'DELETE' }); toast('Deleted', 'ok'); load(); } catch (er) { toast(er.message, 'err'); }
        return;
      }
      if (t.closest('.fx-ren')) {
        const n = prompt('New name', f.name); if (!n?.trim() || n === f.name) return;
        try { await api('/api/drive/' + f.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n.trim() }) }); load(); } catch (er) { toast(er.message, 'err'); }
        return;
      }
      if (t.closest('.fx-mv')) {
        const p = prompt(`Move to which folder? (${['/', ...state.folders].join(', ')})`, f.folder); if (p == null) return;
        try { await api('/api/drive/' + f.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder: p.trim() || '/' }) }); load(); } catch (er) { toast(er.message, 'err'); }
        return;
      }
      click(); view(f);
    });
    B.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('fx-it')) e.target.click(); if (e.key === 'Escape' && !$b('.fx-view').hidden) { e.stopPropagation(); closeView(); } });
    $b('.fx-file').onchange = (e) => { upload(e.target.files); e.target.value = ''; };
    $b('.fx-q').addEventListener('input', (e) => { q = e.target.value.trim(); draw(); });
    let dn = 0;
    const has = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    B.addEventListener('dragenter', (e) => { if (has(e)) { e.preventDefault(); dn++; B.classList.add('dropping'); } });
    B.addEventListener('dragover', (e) => { if (has(e)) e.preventDefault(); });
    B.addEventListener('dragleave', () => { if (--dn <= 0) { dn = 0; B.classList.remove('dropping'); } });
    B.addEventListener('drop', (e) => { if (!has(e)) return; e.preventDefault(); dn = 0; B.classList.remove('dropping'); upload(e.dataTransfer.files); });
    load();
  }

  window.apps.addTool({
    id: 'files', name: 'Files', icon: '📁', color: '#3b82f6', desc: 'Your own cloud storage, on every device', w: 860, h: 560, build,
    glyph: { from: '#60a5fa', to: '#1d4ed8', svg: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5 12 11l2.5 2.5"/>' },
  });
})();
