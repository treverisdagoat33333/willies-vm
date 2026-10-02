/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * Chat extras: threads, polls, voice messages and custom emoji. The server side
 * is in chat.js ("thread", "vote", msg {thread, poll}) and emoji.js; app.js draws
 * the channel and calls in here for the poll card, the thread chip and the thread
 * panel. Uses app.js globals ($, dcSend, dcActive, chatMe, avatar, nameOf, …).
 */
(() => {
  /* ═══ threads: a side panel with the parent message and its replies ═══ */
  const T = $('#dc-thread'), LIST = $('#dc-thread-list'), INPUT = $('#dc-thread-input');
  let open = null; // {id, channel, parent, messages}

  function openThread(m) {
    open = { id: m.id, channel: m.channel || dcActive, parent: m, messages: [] };
    T.hidden = false;
    $('#dc-thread-ch').textContent = '';
    render();
    dcSend({ type: 'thread', id: m.id });
    setTimeout(() => INPUT.focus(), 50);
  }
  function closeThread() { open = null; T.hidden = true; }
  $('#dc-thread-close').onclick = () => { click(); closeThread(); };

  function row(m) {
    const r = document.createElement('div'); r.className = 'dc-tm'; r.dataset.id = m.id;
    r.appendChild(avatar(m.username));
    const b = document.createElement('div'); b.className = 'dc-tm-body';
    const h = document.createElement('div'); h.className = 'dc-tm-head';
    const n = document.createElement('b'); n.textContent = nameOf(m.username); n.style.color = colorOf(m.username);
    const w = document.createElement('small'); w.textContent = new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    h.append(n, w);
    if (m.username === chatMe || rank(chatMeRole) >= 2) {
      const del = document.createElement('button'); del.className = 'dc-tm-del'; del.title = 'Delete'; del.textContent = '✕';
      del.onclick = () => { if (confirm('Delete this reply?')) dcSend({ type: 'delete', id: m.id }); };
      h.appendChild(del);
    }
    const t = document.createElement('div'); t.className = 'dc-text';
    if (m.poll) b.append(h, pollEl(m)); else { dcRichText(t, m.text || ''); b.append(h, t); }
    if (m.file) b.appendChild(dcFileEl(m.file));
    r.appendChild(b);
    return r;
  }
  function render() {
    if (!open) return;
    LIST.replaceChildren(row(open.parent));
    const sep = document.createElement('div'); sep.className = 'dc-tm-sep';
    sep.textContent = open.messages.length ? `${open.messages.length} ${open.messages.length === 1 ? 'reply' : 'replies'}` : 'No replies yet. Start the thread!';
    LIST.appendChild(sep);
    for (const m of open.messages) LIST.appendChild(row(m));
    LIST.scrollTop = LIST.scrollHeight;
  }
  $('#dc-thread-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = INPUT.value.trim();
    if (!t || !open) return;
    if (!dcSend({ type: 'msg', channel: open.channel, text: t, thread: open.id })) return toast('Not connected yet.', 'err');
    INPUT.value = '';
  });
  INPUT.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#dc-thread-form').requestSubmit(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !T.hidden && T.contains(document.activeElement)) { e.stopPropagation(); closeThread(); } }, true);

  function onThread(d) {
    if (!open || open.id !== d.id) return;
    open.parent = d.parent; open.messages = d.messages || [];
    render();
  }
  function onThreadMsg(m) {
    if (open && open.id === m.threadOf) { open.messages.push(m); render(); }
    // someone else's reply to your message: a quiet heads-up
    const parent = dcMessages.find((x) => x.id === m.threadOf);
    if (m.username !== chatMe && parent?.username === chatMe && !(open && open.id === m.threadOf)) toast(`${nameOf(m.username)} replied in your thread`);
  }
  function onThreadDeleted(d) {
    if (!open || open.id !== d.threadOf) return;
    open.messages = open.messages.filter((x) => x.id !== d.id); render();
  }
  function onThreadInfo(d) { if (open && open.id === d.id) open.parent = { ...open.parent, thread: d.thread }; }
  function threadChip(m) {
    const b = document.createElement('button'); b.className = 'dc-thread-chip';
    const ago = m.thread.last ? new Date(m.thread.last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    b.innerHTML = `${ICON.thread}<b></b><small></small>`;
    b.querySelector('b').textContent = `${m.thread.count} ${m.thread.count === 1 ? 'reply' : 'replies'}`;
    b.querySelector('small').textContent = ago ? `last at ${ago}` : '';
    b.onclick = (e) => { e.stopPropagation(); openThread(m); };
    return b;
  }

  /* ═══ polls ═══ */
  function pollEl(m) {
    const p = m.poll, total = new Set(p.options.flatMap((o) => o.voters)).size;
    const card = document.createElement('div'); card.className = 'dc-poll';
    const q = document.createElement('div'); q.className = 'dc-poll-q'; q.textContent = '📊 ' + p.q;
    card.appendChild(q);
    const most = Math.max(1, ...p.options.map((o) => o.voters.length));
    p.options.forEach((o, i) => {
      const mine = o.voters.includes(chatMe);
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'dc-poll-opt' + (mine ? ' mine' : '') + (o.voters.length === most && o.voters.length ? ' top' : '');
      const pct = total ? Math.round((o.voters.length / total) * 100) : 0;
      b.style.setProperty('--pct', pct + '%');
      b.title = o.voters.length ? o.voters.map(nameOf).join(', ') : 'No votes yet';
      b.innerHTML = '<span class="t"></span><span class="n"></span>';
      b.querySelector('.t').textContent = (mine ? '✓ ' : '') + o.t;
      b.querySelector('.n').textContent = `${pct}% · ${o.voters.length}`;
      b.onclick = (e) => { e.stopPropagation(); if (!dcCanPost()) return; click(); dcSend({ type: 'vote', id: m.id, opt: i }); };
      card.appendChild(b);
    });
    const foot = document.createElement('small'); foot.className = 'dc-poll-foot';
    foot.textContent = `${total} ${total === 1 ? 'vote' : 'votes'}${p.multi ? ' · pick as many as you like' : ''}`;
    card.appendChild(foot);
    return card;
  }
  function onPoll(d) {
    if (!open) return;
    const m = open.parent.id === d.id ? open.parent : open.messages.find((x) => x.id === d.id);
    if (m) { m.poll = d.poll; render(); }
  }
  $('#dc-poll-btn').onclick = () => {
    click();
    dcModal({
      title: 'Make a poll', sub: 'Everyone in this channel can vote.', okLabel: 'Post poll',
      fields: [
        { key: 'q', label: 'Question', placeholder: 'Pizza or tacos?', maxlength: 200 },
        { key: 'options', label: 'Answers, one per line (2 to 10)', type: 'textarea', rows: 4, placeholder: 'Pizza\nTacos' },
      ],
      onOk: (v) => {
        const options = v.options.split('\n').map((x) => x.trim()).filter(Boolean);
        if (!v.q.trim()) throw new Error('Ask a question.');
        if (options.length < 2 || options.length > 10) throw new Error('Give 2 to 10 answers, one per line.');
        dcSend({ type: 'msg', channel: dcActive, poll: { q: v.q.trim(), options, multi: $('#cx-multi')?.checked } });
      },
    });
    // one more option the dialog helper doesn't draw: several answers at once
    const lab = document.createElement('label'); lab.className = 'cx-check';
    lab.innerHTML = '<input type="checkbox" id="cx-multi"> Let people pick more than one answer';
    $('#dc-modal-fields').appendChild(lab);
  };

  /* ═══ voice messages: record, then it uploads and sends like a file ═══ */
  const REC = $('#dc-rec');
  let rec = null, chunks = [], startedAt = 0, tick = null, downAt = 0;
  const pickType = () => ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
  async function startRec() {
    if (rec) return;
    if (!window.MediaRecorder) return toast("This browser can't record voice messages.", 'err');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (_) { return toast('Microphone blocked. Allow it in the address bar to send voice messages.', 'err'); }
    const type = pickType();
    rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
    chunks = []; startedAt = Date.now();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(tick); REC.classList.remove('on'); REC.removeAttribute('data-t');
      const secs = (Date.now() - startedAt) / 1000, cancelled = rec?.cancelled;
      const mime = rec.mimeType || 'audio/webm'; rec = null;
      if (cancelled) return;
      if (secs < 0.7) return toast('Hold the mic a little longer to record.');
      const ext = /mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';
      const file = new File(chunks, `voice-message-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type: mime });
      dcStage(file);
      if (dcFile && dcFile.file === file) { dcFile.send = true; sendChat(); }
    };
    rec.start(250);
    REC.classList.add('on');
    tick = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      REC.dataset.t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 120) stopRec(); // two minutes is plenty, and keeps the file under the 8 MB limit
    }, 250);
  }
  function stopRec(cancel = false) { if (!rec) return; rec.cancelled = cancel; try { rec.stop(); } catch (_) {} }
  // click to start and stop, or hold and let go; Escape throws it away
  REC.addEventListener('pointerdown', (e) => { e.preventDefault(); if (rec) { stopRec(); downAt = 0; return; } downAt = Date.now(); startRec(); });
  // let go after holding it: that's the end of the message; a quick click keeps recording until the next click
  REC.addEventListener('pointerup', () => { if (downAt && Date.now() - downAt > 600) stopRec(); downAt = 0; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && rec) { e.stopPropagation(); stopRec(true); toast('Voice message thrown away'); } }, true);

  /* ═══ custom emoji: admins add and remove them ═══ */
  const EM = document.createElement('div');
  EM.className = 'dc-modal'; EM.id = 'cx-emoji';
  EM.innerHTML = `<div class="dc-card cx-em-card"><h3>Custom emoji</h3><p class="sub">Use them in chat as <code>:name:</code> and as reactions. PNG, GIF, WebP or JPEG, up to 256 KB.</p>
    <form class="cx-em-add" id="cx-em-form"><input class="field" id="cx-em-name" placeholder="name" maxlength="32" autocomplete="off"><input type="file" id="cx-em-file" accept="image/png,image/gif,image/webp,image/jpeg"><button class="btn sm primary" type="submit">Add</button></form>
    <div class="cx-em-list" id="cx-em-list"></div><div class="foot"><button class="btn sm" type="button" id="cx-em-close">Done</button></div></div>`;
  document.body.appendChild(EM);
  const emList = () => {
    const box = $('#cx-em-list');
    if (!dcEmojis.length) { box.innerHTML = '<p class="sub">No custom emoji yet.</p>'; return; }
    box.replaceChildren(...dcEmojis.map((e) => {
      const r = document.createElement('div'); r.className = 'cx-em';
      r.appendChild(dcEmojiImg(e.name));
      const n = document.createElement('code'); n.textContent = `:${e.name}:`;
      const x = document.createElement('button'); x.className = 'btn sm danger'; x.textContent = 'Remove';
      x.onclick = async () => { if (!confirm(`Remove :${e.name}:?`)) return; const r = await fetch('/api/emoji/' + e.name, { method: 'DELETE' }); if (!r.ok) toast((await r.json().catch(() => ({}))).error || 'Couldn\'t remove it', 'err'); };
      r.append(n, x); return r;
    }));
  };
  function openEmoji() { emList(); EM.classList.add('show'); $('#cx-em-name').focus(); }
  $('#cx-em-close').onclick = () => EM.classList.remove('show');
  EM.addEventListener('click', (e) => { if (e.target === EM) EM.classList.remove('show'); });
  $('#cx-em-file').onchange = () => { const f = $('#cx-em-file').files[0]; if (f && !$('#cx-em-name').value) $('#cx-em-name').value = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32); };
  $('#cx-em-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = $('#cx-em-file').files[0], name = $('#cx-em-name').value.trim().toLowerCase();
    if (!f || !name) return toast('Pick a picture and a name', 'err');
    const r = await fetch('/api/emoji?name=' + encodeURIComponent(name), { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast(d.error || 'Couldn\'t add it', 'err');
    toast(`Added :${d.name}:`, 'ok'); $('#cx-em-name').value = ''; $('#cx-em-file').value = '';
  });
  // the list refreshes for everyone when it changes (app.js keeps dcEmojis); redraw if open
  setInterval(() => { if (EM.classList.contains('show') && EM.dataset.n !== String(dcEmojis.length)) { EM.dataset.n = dcEmojis.length; emList(); } }, 500);

  /* the composer's buttons follow who you are (accounts post files; admins manage emoji) */
  function sync() {
    $('#dc-poll-btn').hidden = !chatReady;
    $('#dc-rec').hidden = !chatMeAccount;
    const b = $('#dc-emoji-manage'); if (b) b.hidden = rank(chatMeRole) < 3;
  }
  setInterval(sync, 1000);
  const head = $('#dc-find-btn');
  if (head) {
    const b = document.createElement('button'); b.id = 'dc-emoji-manage'; b.title = 'Custom emoji'; b.hidden = true;
    b.innerHTML = '<svg class="i i-sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/><path d="M19 3v4M17 5h4"/></svg>';
    b.onclick = () => { click(); openEmoji(); };
    head.after(b);
  }

  window.chatx = { openThread, closeThread, onThread, onThreadMsg, onThreadDeleted, onThreadInfo, threadChip, pollEl, onPoll, openEmoji, recording: () => !!rec };
})();
