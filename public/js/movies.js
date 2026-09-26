/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */

/* Movies & TV: listings from /api/movies (Cinemeta, see movies.js on the
   server), the video from vidsrc.ir embedded by IMDB id. vidsrc is another
   origin, so under our COEP header it can only sit in a credentialless
   frame (same trick as the CloudMoon portal); browsers without that get a
   plain new tab. */
(()=>{
const VIDSRC='https://vidsrc.ir/embed';
const wrap=$('#movies-wrap'),grid=$('#mv-grid'),frame=$('#mv-frame');
let row='movies',query='',items=[],skip=0,searchSeq=0,current=null,meta=null;

/* what was watched, most recent first, so a show reopens on its episode (this device only) */
const RECENT_MAX=12;
const recents=()=>{try{return JSON.parse(localStorage.getItem('movies.recent'))||[]}catch(_){return[]}};
function remember(r){
  try{
    const list=[r,...recents().filter(x=>x.id!==r.id)].slice(0,RECENT_MAX);
    localStorage.setItem('movies.recent',JSON.stringify(list));
  }catch(_){}
}

const art=u=>u?`/api/movies/art?u=${encodeURIComponent(u)}`:'';
async function api(path){
  const r=await fetch('/api/movies'+path);
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'HTTP '+r.status);
  return d;
}

/* ── browse ───────────────────────────────── */
function card(m,progress){
  const sub=[m.year,m.rating&&`★ ${m.rating}`,progress].filter(Boolean).join(' · ');
  return `<button class="cg-card mv-card" data-mv="${esc(m.id)}" data-mvtype="${esc(m.type)}">
    <div class="cg-art mv-art">${m.poster?`<img loading="lazy" src="${esc(art(m.poster))}" alt="">`:''}
      ${m.type==='series'?'<span class="cg-tag">TV</span>':''}
      <div class="cg-play"><span><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 9-14 9z"/></svg> Watch</span></div></div>
    <div class="cg-meta"><b>${esc(m.name)}</b><small>${esc(sub)}</small></div></button>`;
}
function renderGrid(){
  const rec=!query&&recents();
  let html='';
  if(rec&&rec.length){
    html+=`<div class="mv-sect">Continue watching</div><div class="mv-strip">${rec.map(r=>card(r,r.season?`S${r.season} E${r.episode}`:'')).join('')}</div>`;
    html+=`<div class="mv-sect">${{movies:'Popular movies',shows:'Popular shows',anime:'Popular anime'}[row]}</div>`;
  }
  html+=items.map(m=>card(m)).join('');
  grid.innerHTML=html||(query?'<div class="cg-empty">Nothing found. Try another name.</div>':'<div class="cg-empty">Nothing here right now.</div>');
  $('#mv-more').hidden=!!query||!items.length;
}
async function loadRow(more){
  const seq=++searchSeq;
  if(!more){items=[];skip=0;grid.innerHTML='<div class="cg-skel"></div>'.repeat(12);$('#mv-more').hidden=true}
  try{
    const d=await api(`/browse?row=${row}&skip=${skip}`);
    if(seq!==searchSeq)return;
    const seen=new Set(items.map(m=>m.id));
    items=items.concat((d.items||[]).filter(m=>!seen.has(m.id)));
    skip+=100;
    renderGrid();
  }catch(e){
    if(seq!==searchSeq)return;
    grid.innerHTML=`<div class="cg-empty">${esc(e.message)}</div>`;
  }
}
async function runSearch(){
  const seq=++searchSeq;
  grid.innerHTML='<div class="cg-skel"></div>'.repeat(8);$('#mv-more').hidden=true;
  try{
    const d=await api(`/search?q=${encodeURIComponent(query)}`);
    if(seq!==searchSeq)return;
    items=d.items||[];renderGrid();
  }catch(e){
    if(seq!==searchSeq)return;
    grid.innerHTML=`<div class="cg-empty">${esc(e.message)}</div>`;
  }
}
$('#mv-tabs').addEventListener('click',e=>{
  const b=e.target.closest('[data-mvrow]');if(!b)return;click();
  row=b.dataset.mvrow;$$('#mv-tabs .cg-chip').forEach(c=>c.classList.toggle('active',c===b));
  $('#mv-search').value='';query='';loadRow();
});
let searchT;
$('#mv-search').addEventListener('input',e=>{
  clearTimeout(searchT);
  const q=e.target.value.trim();
  searchT=setTimeout(()=>{query=q;q?runSearch():loadRow()},350);
});
$('#mv-more').onclick=()=>{click();loadRow(true)};
grid.addEventListener('click',e=>{
  const b=e.target.closest('[data-mv]');if(!b)return;click();
  const id=b.dataset.mv;
  play(recents().find(m=>m.id===id)||items.find(m=>m.id===id)||{id,type:b.dataset.mvtype,name:''});
});

/* ── player ───────────────────────────────── */
function embed(m,season,episode){
  return m.type==='series'?`${VIDSRC}/tv/${m.id}/${season}/${episode}`:`${VIDSRC}/movie/${m.id}`;
}
function setFrame(src){
  if(!('credentialless' in HTMLIFrameElement.prototype)){
    window.open(src,'_blank','noopener');
    toast("Opened the player in a new tab. This browser can't show it inside the desktop.");
    return false;
  }
  frame.setAttribute('credentialless','');frame.src=src;
  return true;
}
async function play(m){
  current=m;meta=null;
  const last=recents().find(r=>r.id===m.id);
  const season=m.season||last?.season||1,episode=m.episode||last?.episode||1;
  if(m.type!=='series'&&!setFrame(embed(m)))return;
  wrap.classList.add('playing');
  $('#mv-back').hidden=false;
  $('#mv-title').textContent=m.name||'Movies';
  $('#mv-name').textContent=m.name||'';
  $('#mv-sub').textContent=[m.year,m.rating&&`★ ${m.rating}`,(m.genres||[]).join(', ')].filter(Boolean).join(' · ');
  $('#mv-desc').textContent='';
  const img=$('#mv-poster');img.hidden=!m.poster;if(m.poster)img.src=art(m.poster);
  $('#mv-season-wrap').hidden=true;$('#mv-eps').innerHTML=m.type==='series'?'<div class="cg-skel mv-eps-skel"></div>':'';
  if(m.type!=='series')remember({...m,at:Date.now()});
  try{
    const d=await api(`/meta?type=${m.type}&id=${m.id}`);
    if(current!==m)return;
    meta=d.meta||{};
    Object.assign(current,{name:meta.name||m.name,poster:meta.poster||m.poster,year:meta.year,rating:meta.rating,genres:meta.genres});
    $('#mv-title').textContent=current.name;$('#mv-name').textContent=current.name;
    $('#mv-sub').textContent=[meta.year,meta.rating&&`★ ${meta.rating}`,(meta.genres||[]).join(', ')].filter(Boolean).join(' · ');
    $('#mv-desc').textContent=meta.description||'';
    if(current.poster){img.hidden=false;img.src=art(current.poster)}
    if(m.type==='series'){
      const seasons=meta.seasons||[];
      if(!seasons.length){$('#mv-eps').innerHTML='<div class="cg-empty">No episode list. Playing from season 1.</div>';playEpisode(1,1);return}
      const sel=$('#mv-season');
      sel.innerHTML=seasons.map(s=>`<option value="${s.season}">${s.season===0?'Specials':'Season '+s.season}</option>`).join('');
      $('#mv-season-wrap').hidden=seasons.length<2&&seasons[0]?.season===1;
      const have=seasons.some(s=>s.season===season);
      sel.value=String(have?season:seasons[0].season);
      renderEpisodes();
      playEpisode(Number(sel.value),have?episode:1);
    }
  }catch(e){
    if(current!==m)return;
    if(m.type==='series'){$('#mv-eps').innerHTML=`<div class="cg-empty">${esc(e.message)}</div>`;playEpisode(season,episode)}
  }
}
function renderEpisodes(){
  const s=Number($('#mv-season').value);
  const eps=(meta?.seasons||[]).find(x=>x.season===s)?.episodes||[];
  $('#mv-eps').innerHTML=eps.map(e=>`<button class="mv-ep" data-ep="${e.episode}"><span class="mv-epn">${e.episode}</span><span class="mv-ept">${esc(e.name||'Episode '+e.episode)}</span>${e.released?`<small>${esc(e.released)}</small>`:''}</button>`).join('')||'<div class="cg-empty">No episodes listed.</div>';
}
function playEpisode(season,episode){
  if(!current||current.type!=='series')return;
  if(!setFrame(embed(current,season,episode)))return;
  $('#mv-title').textContent=`${current.name} · S${season} E${episode}`;
  $$('#mv-eps .mv-ep').forEach(b=>b.classList.toggle('active',Number(b.dataset.ep)===episode&&Number($('#mv-season').value)===season));
  remember({...current,season,episode,at:Date.now()});
}
$('#mv-season').addEventListener('change',()=>{renderEpisodes()});
$('#mv-eps').addEventListener('click',e=>{
  const b=e.target.closest('[data-ep]');if(!b)return;click();
  playEpisode(Number($('#mv-season').value),Number(b.dataset.ep));
});
function stopPlaying(){
  frame.src='about:blank';current=null;meta=null;
  wrap.classList.remove('playing');
  $('#mv-back').hidden=true;$('#mv-title').textContent='Movies';
  renderGrid(); // the continue-watching row just changed
}
$('#mv-back').onclick=()=>{click();stopPlaying()};

/* ── window ───────────────────────────────── */
function open(){
  closeAllPanels();$('#start').classList.remove('show');
  ['#vm-wrap','#browser-wrap','#cloud-wrap','#remote-wrap'].forEach(s=>{const w=$(s);if(w)w.style.display='none'});
  wrap.style.display='flex';wrap.classList.remove('closing');
  $('#tb-movies').classList.add('active');
  if(!items.length&&!query)loadRow();else renderGrid();
  setTimeout(()=>$('#mv-search').focus(),80);
}
function close(){
  if(wrap.style.display!=='flex')return;
  frame.src='about:blank';
  wrap.classList.add('closing');
  onCloseDone(wrap,()=>{wrap.style.display='none';wrap.classList.remove('closing')});
  $('#tb-movies').classList.remove('active');
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
}
/* another full-screen app is taking over: vanish without the animation */
function hide(){
  if(wrap.style.display!=='flex')return;
  frame.src='about:blank';
  wrap.style.display='none';
  $('#tb-movies').classList.remove('active');
}
$('#mv-close').onclick=()=>{click();close()};
$('#mv-fs').onclick=()=>{
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  else wrap.requestFullscreen().catch(()=>{});
};

window.movies={toggle:()=>wrap.style.display==='flex'?close():open(),open,close,hide};
})();
