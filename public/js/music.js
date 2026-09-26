/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   MUSIC
   Four sources, picked with the switch at the top (lib.source, SoundCloud by
   default). SoundCloud and Audius songs play in a plain <audio> element from
   /api/music/stream/<id>: our server fetches the audio, so the browser never
   talks to them (it works where they're blocked, in any browser, in the
   background and with media keys). YouTube won't hand its audio to a server,
   so YouTube songs play in its embedded player, hidden and driven from here.
   Deezer songs, like chart songs, are matched to a full SoundCloud or YouTube
   upload when played. Search, charts and artwork come from /api/music too. Uses app.js helpers ($, $$, esc, toast,
   store, put, click, typing, dcModal, onCloseDone).
   The library (likes, playlists, recent, volume) lives in localStorage
   under "music", which settings sync carries between devices.
   ═══════════════════════════════════════════════════════════ */
(()=>{
const W=$('#music-window'),BODY=$('#mu-body'),MINI=$('#music-mini');
const LIB_DEFAULT={liked:[],playlists:[],recent:[],vol:80,shuffle:false,repeat:'off',source:'sc'};
const SOURCES={sc:'SoundCloud',yt:'YouTube',au:'Audius',dz:'Deezer'};
const MAX_LIKED=500,MAX_PLAYLISTS=50,MAX_PER_PLAYLIST=300,MAX_RECENT=16;
const AUDIO=$('#mu-audio');

let lib=loadLib();
function loadLib(){const l=store('music',null);return {...LIB_DEFAULT,...(l&&typeof l==='object'&&!Array.isArray(l)?l:{})}}
function saveLib(){put('music',lib)}

const ICON={
  heart:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  more:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  play:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 13 8-13 8z"/></svg>',
  shuffle:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  list:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h13M3 12h13M3 18h9"/></svg>',
  eq:'<span class="mu-eq"><i></i><i></i><i></i></span>'
};
const art=u=>u?'/api/music/art?u='+encodeURIComponent(u):'';
const artStyle=u=>u?` style="background-image:url('${esc(art(u))}')"`:'';
/* SoundCloud ids are bare numbers (and stay that way in saved libraries); the
   other sources' ids carry their prefix: "yt:<video>", "au:<track>" */
const srcOf=t=>typeof t?.id==='string'&&/^(yt|au):/.test(t.id)?t.id.slice(0,2):'sc';
const isYT=t=>srcOf(t)==='yt';
const keyOf=t=>t?(t.id?(srcOf(t)==='sc'?'sc'+t.id:t.id):t.key):'';
/* a chart song keeps its chart key once matched, so its row still lights up */
const same=(a,b)=>!!(a&&b)&&(keyOf(a)===keyOf(b)||a.fromKey===keyOf(b)||b.fromKey===keyOf(a));
const time=s=>{s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
/* what gets stored: small, so the library fits in settings sync */
const slim=t=>t.chart
  ?{key:t.key,title:t.title,artist:t.artist,artwork:t.artwork,duration:t.duration,chart:true}
  :{id:t.id,src:t.src,title:t.title,artist:t.artist,uploader:t.uploader,artwork:t.artwork,duration:t.duration,url:t.url,preview:!!t.preview};
async function getJSON(url){
  const r=await fetch(url);let d={};try{d=await r.json()}catch(_){}
  if(!r.ok){const e=new Error(d.error||`HTTP ${r.status}`);e.status=r.status;throw e}
  return d;
}

/* ---- state ---- */
let view='home',viewArg=null,genre=0,genres=[],charts={},results=[],lastQ='',searching=false;
let rows=[]; // the tracks shown right now, so a row click finds its track
let queue=[],qi=-1,order=null; // order: shuffled queue indexes, or null
let cur=null,playing=false,pos=0,dur=0,seeking=false,miniHidden=false,statusText='';
let loadSeq=0,searchSeq=0,failures=0,retried=false,warmed='';

/* ═══ views ═══ */
function setView(v,arg){
  view=v;viewArg=arg??null;W.dataset.view=v;
  $$('.mu-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  W.classList.remove('side-open');
  renderPls();render();
  $('#mu-scroll').scrollTop=0;
}
function render(){
  switch(view){
    case 'home':return renderHome();
    case 'search':return renderList(lastQ?`Results for “${lastQ}”`:'Search',results,{
      empty:searching?'':(lastQ?'No songs found. Try different words.':'Search for any song, artist or album up top.'),loading:searching});
    case 'liked':return renderList('Liked songs',lib.liked,{empty:'Tap the heart on any song to save it here.',playAll:true});
    case 'playlist':{
      const pl=lib.playlists.find(p=>p.id===viewArg);
      if(!pl)return setView('home');
      return renderList(pl.name,pl.tracks,{empty:'Add songs from the ⋯ menu on any song.',playAll:true,playlist:pl});
    }
    case 'queue':return renderList('Queue',queueInOrder(),{empty:'Nothing queued. Play something!',queue:true});
    case 'now':return renderNow();
  }
}
function rowHTML(t,i){
  const on=same(cur,t);
  return `<div class="mu-row${on?' on':''}" data-i="${i}" role="button" tabindex="0">
    <span class="n">${on&&playing?ICON.eq:i+1}</span>
    <div class="art"${artStyle(t.artwork)}></div>
    <div class="t"><b>${esc(t.title)}</b><small>${srcOf(t)!=='sc'&&t.id?`<em class="src ${srcOf(t)}">${SOURCES[srcOf(t)]}</em> `:''}${esc(t.artist||t.uploader||'')}${t.preview?' <em class="pv">30s preview</em>':''}</small></div>
    <span class="d">${t.duration?time(t.duration):''}</span>
    <button class="mu-iconbtn lk${isLiked(t)?' on':''}" data-act="like" aria-label="Like">${ICON.heart}</button>
    <button class="mu-iconbtn" data-act="more" aria-label="More">${ICON.more}</button>
  </div>`;
}
function renderList(title,tracks,o={}){
  rows=tracks;
  const head=`<div class="mu-head"><h2>${esc(title)}</h2>${tracks.length?`<small>${tracks.length} song${tracks.length===1?'':'s'}</small>`:''}
    <span class="sp"></span>
    ${o.playAll&&tracks.length?`<button class="btn sm primary" data-list="play">${ICON.play} Play</button><button class="btn sm" data-list="shuffle">${ICON.shuffle} Shuffle</button>`:''}
    ${o.playlist?'<button class="btn sm" data-list="rename">Rename</button><button class="btn sm danger" data-list="delete">Delete</button>':''}
    ${o.queue&&tracks.length?'<button class="btn sm" data-list="clear">Clear</button>':''}</div>`;
  const body=o.loading?'<div class="mu-empty"><span class="mu-spin"></span>Searching…</div>'
    :tracks.length?`<div class="mu-rows">${tracks.map(rowHTML).join('')}</div>`
    :`<div class="mu-empty">${esc(o.empty||'')}</div>`;
  BODY.innerHTML=head+body;
}
function greeting(){const h=new Date().getHours();return h<5?'Late night vibes':h<12?'Good morning':h<18?'Good afternoon':'Good evening'}
async function renderHome(){
  const chips=(genres.length?genres:[{id:0,name:'Top hits'}]).map(g=>`<button class="mu-chip${g.id===genre?' on':''}" data-genre="${g.id}">${esc(g.name)}</button>`).join('');
  const recent=lib.recent.length?`<h3 class="mu-h3">Recently played</h3><div class="mu-shelf">${lib.recent.map((t,i)=>`<button class="mu-card" data-recent="${i}"><div class="art"${artStyle(t.artwork)}><span class="pl">${ICON.play}</span></div><b>${esc(t.title)}</b><small>${esc(t.artist||t.uploader||'')}</small></button>`).join('')}</div>`:'';
  BODY.innerHTML=`<div class="mu-hero"><h1>${greeting()}${currentUsername&&currentUsername!=='Guest'?', '+esc(currentUsername):''}</h1><p>Search any song up top, or start with what's hot right now.</p></div>
    ${recent}<h3 class="mu-h3">${lib.source==='au'?'Trending on Audius':'Charts'}</h3><div class="mu-chips">${chips}</div><div id="mu-chart"><div class="mu-empty"><span class="mu-spin"></span>Loading the charts…</div></div>`;
  rows=[];
  const g=genre,src=chartSrc(),ck=src+':'+g;
  try{
    if(!charts[ck]){const d=await getJSON(`/api/music/charts?genre=${g}&source=${src}`);charts[ck]=d.tracks||[];genres=d.genres||genres}
  }catch(e){
    if(view==='home'&&g===genre)$('#mu-chart').innerHTML=`<div class="mu-empty">Couldn't load the charts. ${esc(e.message)}</div>`;
    return;
  }
  if(view!=='home'||g!==genre||src!==chartSrc())return;
  if(genres.length&&!$('.mu-chip[data-genre="116"]'))$('.mu-chips').innerHTML=genres.map(x=>`<button class="mu-chip${x.id===genre?' on':''}" data-genre="${x.id}">${esc(x.name)}</button>`).join('');
  rows=charts[ck];
  $('#mu-chart').innerHTML=`<div class="mu-rows">${rows.map(rowHTML).join('')}</div>`;
}
function renderNow(){
  rows=cur?[cur]:[];
  BODY.innerHTML=cur?`<div class="mu-nowview">
      <div class="big art"${artStyle(cur.artwork)}></div>
      <div class="meta"><small>Now playing</small><h1>${esc(cur.title)}</h1><p>${esc(cur.artist||cur.uploader||'')}</p>
        <div class="acts">${cur.url?`<a class="btn sm" href="${esc(cur.url)}" target="_blank" rel="noopener">Open on ${SOURCES[srcOf(cur)]}</a>`:''}<button class="btn sm" data-list="queue">Up next</button></div>
        ${cur.uploader?`<p class="credit">Uploaded by <b>${esc(cur.uploader)}</b> on ${SOURCES[srcOf(cur)]}</p>`:''}</div>
    </div>`:'<div class="mu-empty">Nothing playing yet.</div>';
}
/* only the playing marks changed: patch rows in place instead of re-rendering */
function refreshRows(){
  $$('.mu-row',BODY).forEach(r=>{
    const t=rows[+r.dataset.i];if(!t)return;
    const on=same(cur,t);
    r.classList.toggle('on',on);
    r.querySelector('.n').innerHTML=on&&playing?ICON.eq:String(+r.dataset.i+1);
    r.querySelector('.lk').classList.toggle('on',isLiked(t));
  });
}
function renderPls(){
  $('#mu-liked-n').textContent=lib.liked.length||'';
  $('#mu-pls').innerHTML=lib.playlists.map(p=>`<button class="${view==='playlist'&&viewArg===p.id?'active':''}" data-pl="${esc(p.id)}"><span>${esc(p.name)}</span><small>${p.tracks.length}</small></button>`).join('')
    ||'<p class="mu-none">No playlists yet.</p>';
}

/* ═══ library ═══ */
const isLiked=t=>lib.liked.some(x=>same(x,t));
function toggleLike(t){
  if(!t)return;
  const k=keyOf(t),i=lib.liked.findIndex(x=>keyOf(x)===k);
  if(i>=0){lib.liked.splice(i,1);toast('Removed from Liked songs')}
  else{
    if(lib.liked.length>=MAX_LIKED){toast(`You can like up to ${MAX_LIKED} songs.`,'err');return}
    lib.liked.unshift(slim(t));toast('Added to Liked songs','ok');
  }
  saveLib();renderPls();
  if(view==='liked')render();else refreshRows();
  updateBar();
}
function addRecent(t){
  lib.recent=[slim(t),...lib.recent.filter(x=>keyOf(x)!==keyOf(t))].slice(0,MAX_RECENT);
  saveLib();
}
function newPlaylist(then){
  if(lib.playlists.length>=MAX_PLAYLISTS){toast(`You can have up to ${MAX_PLAYLISTS} playlists.`,'err');return}
  dcModal({title:'New playlist',okLabel:'Create',fields:[{key:'name',label:'Name',placeholder:'My playlist',maxlength:40}],
    onOk:v=>{
      const name=v.name.trim()||'My playlist';
      const pl={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name,tracks:[]};
      lib.playlists.push(pl);saveLib();renderPls();
      if(then)then(pl);else setView('playlist',pl.id);
    }});
}
function addToPlaylist(pl,t){
  if(pl.tracks.some(x=>keyOf(x)===keyOf(t))){toast(`Already in ${pl.name}`);return}
  if(pl.tracks.length>=MAX_PER_PLAYLIST){toast(`A playlist holds up to ${MAX_PER_PLAYLIST} songs.`,'err');return}
  pl.tracks.push(slim(t));saveLib();renderPls();toast(`Added to ${pl.name}`,'ok');
  if(view==='playlist'&&viewArg===pl.id)render();
}

/* ═══ queue ═══ */
function queueInOrder(){return order?order.map(k=>queue[k]).filter(Boolean):queue.slice()}
function shuffledOrder(first){
  const rest=queue.map((_,k)=>k).filter(k=>k!==first);
  for(let i=rest.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]]}
  return first>=0?[first,...rest]:rest;
}
function playFrom(tracks,i,{shuffle}={}){
  if(!tracks.length)return;
  queue=tracks.map(t=>({...t}));
  if(shuffle){lib.shuffle=true;saveLib();i=Math.floor(Math.random()*queue.length)}
  qi=Math.max(0,Math.min(i,queue.length-1));
  order=lib.shuffle?shuffledOrder(qi):null;
  startCurrent();
}
function step(dir){
  if(!queue.length)return -1;
  const seq=order||queue.map((_,k)=>k);
  let p=seq.indexOf(qi)+dir;
  if(p<0||p>=seq.length){if(lib.repeat!=='all')return -1;p=(p+seq.length)%seq.length}
  return seq[p];
}
function next(auto){
  if(auto&&lib.repeat==='one'&&cur){seekTo(0);resume();return}
  const n=step(1);
  if(n<0){if(auto){playing=false;updateBar();refreshRows()}else toast("That's the end of the queue.");return}
  qi=n;startCurrent();
}
function prev(){
  if(pos>3||step(-1)<0){seekTo(0);return}
  qi=step(-1);startCurrent();
}
function playNext(t){
  if(!cur){playFrom([t],0);return}
  queue.splice(qi+1,0,slim(t));
  if(order){order=order.map(k=>k>qi?k+1:k);order.splice(order.indexOf(qi)+1,0,qi+1)}
  toast('Playing next','ok');if(view==='queue')render();
}
function addToQueue(t){
  if(!cur){playFrom([t],0);return}
  queue.push(slim(t));if(order)order.push(queue.length-1);
  toast('Added to queue','ok');if(view==='queue')render();
}
function removeFromQueue(t){
  const k=queue.findIndex(x=>keyOf(x)===keyOf(t));
  if(k<0||k===qi)return;
  queue.splice(k,1);
  if(order)order=order.filter(x=>x!==k).map(x=>x>k?x-1:x);
  if(k<qi)qi--;
  render();
}

/* ═══ playback ═══ */
async function startCurrent(){
  const seq=++loadSeq;let t=queue[qi];if(!t)return;
  cur=t;pos=0;dur=t.duration||0;playing=false;miniHidden=false;
  updateBar();refreshRows();if(view==='now')render();
  if(t.chart){
    // a chart or Deezer song: find the full version. YouTube has the official audio of
    // nearly everything, so it goes first for YouTube and Deezer; SoundCloud first otherwise
    let vias=lib.source==='yt'||lib.source==='dz'?['yt','sc']:['sc','yt'];
    // YouTube already failed for this song, or keeps failing on this network (a school filter, say)
    if(t.noYT)vias=['sc'];else if(ytFails>=2)vias=['sc','yt'];
    let found=null,err=null;
    for(const via of vias){
      setStatus(`Finding it on ${SOURCES[via]}…`);
      try{found=(await getJSON('/api/music/resolve?'+new URLSearchParams({title:t.title,artist:t.artist,duration:t.duration||0,via}))).track;break}
      catch(e){err=e} // not found there, or that service is down: try the next
      finally{if(seq!==loadSeq)return}
    }
    if(!found){
      if(err?.status===404||err?.status===502){toast("Couldn't find a full version of that one. Here's what turned up.",'err');search(`${t.artist} ${t.title}`);}
      else toast(err?.message||"Couldn't find that song.",'err');
      setStatus('');return;
    }
    // a YouTube match keeps the chart song, to fall back to SoundCloud if YouTube won't play it
    t={...found,artwork:t.artwork||found.artwork,fromKey:t.key,orig:found.src==='yt'?{key:t.key,title:t.title,artist:t.artist,artwork:t.artwork,duration:t.duration,chart:true}:undefined};
    queue[qi]=t;cur=t;updateBar();if(view==='now')render();
  }
  addRecent(t);mediaMeta(t);
  load(t,seq);
}
const streamUrl=t=>'/api/music/stream/'+encodeURIComponent(t.id);
function load(t,seq,at=0){
  retried=at>0;
  setStatus('Loading…');
  if(isYT(t)){
    stopAudio();
    ytLoad(t.id.slice(3),at);
    return;
  }
  ytStop();
  AUDIO.src=streamUrl(t);
  AUDIO.volume=lib.vol/100;
  if(at)AUDIO.currentTime=at;
  AUDIO.play().catch(e=>{if(seq===loadSeq&&e.name==='NotAllowedError')setStatus('Press play to start')}); // other failures arrive as 'error'
}
function stopAudio(){if(AUDIO.getAttribute('src')){AUDIO.pause();AUDIO.removeAttribute('src');AUDIO.load()}}
/* the next SoundCloud song in the queue gets ready on the server while this one plays */
function warmNext(){
  const n=step(1),t=n>=0?queue[n]:null;
  if(!t?.id||srcOf(t)!=='sc'||warmed===String(t.id))return;
  warmed=String(t.id);
  fetch(streamUrl(t)+'?warm=1').catch(()=>{});
}
/* both engines report through these */
function onPlaying(){playing=true;failures=0;setStatus('');updateBar();refreshRows();setTimeout(warmNext,4000)}
function onPaused(){playing=false;updateBar();refreshRows()}
function onFailed(msg){
  const seq=loadSeq;playing=false;updateBar();refreshRows();
  if(++failures>=3){failures=0;setStatus('');toast("Music isn't loading right now. Try again in a bit.",'err');return}
  toast(msg||"Couldn't play that one. Skipping.",'err');
  setTimeout(()=>{if(seq===loadSeq)next(true)},900);
}
const onAudio=f=>e=>{if(!isYT(cur))f(e)}; // the audio element's events mean nothing while YouTube plays
AUDIO.addEventListener('playing',onAudio(onPlaying));
AUDIO.addEventListener('pause',onAudio(onPaused));
AUDIO.addEventListener('ended',onAudio(()=>{playing=false;next(true)}));
AUDIO.addEventListener('waiting',onAudio(()=>{if(cur)setStatus('Loading…')}));
AUDIO.addEventListener('timeupdate',onAudio(()=>{pos=AUDIO.currentTime;if(!seeking)updateProgress()}));
AUDIO.addEventListener('durationchange',onAudio(()=>{if(isFinite(AUDIO.duration)&&AUDIO.duration>0){dur=AUDIO.duration;updateProgress()}}));
AUDIO.addEventListener('error',onAudio(()=>{
  if(!cur||!AUDIO.getAttribute('src'))return;
  // the connection dropped partway: pick up where it stopped, once
  if(AUDIO.error?.code===MediaError.MEDIA_ERR_NETWORK&&pos>1&&!retried){load(cur,loadSeq,pos);return}
  onFailed();
}));

/* ═══ YouTube ═══
   YouTube asks servers to sign in, so its songs play in the visitor's own
   browser: YouTube's embedded player in a hidden credentialless frame (our COEP
   header allows no other kind), driven by its postMessage protocol, the same
   one its IFrame API script speaks. */
const YT_ORIGIN='https://www.youtube-nocookie.com';
let ytF=null,ytReady=false,ytWant=null,ytState=-1,ytVid='',ytHello=0,ytT=0,ytFails=0;
// a video that's blocked where you are (region, school filter) just never starts, without an error
const YT_START_MS=15000;
function ytWatch(id){clearTimeout(ytT);ytT=setTimeout(()=>{if(isYT(cur)&&ytVid===id&&ytState!==1&&ytState!==2)ytFailed()},YT_START_MS)}
function ytFailed(msg){
  clearTimeout(ytT);ytFails++;ytStop();
  if(cur?.orig&&!cur.orig.noYT){setStatus('Trying SoundCloud…');queue[qi]={...cur.orig,noYT:true};startCurrent();return}
  onFailed(msg||"That YouTube video won't play here. Skipping.");
}
function ytSend(func,...args){try{ytF?.contentWindow?.postMessage(JSON.stringify({event:'command',func,args}),YT_ORIGIN)}catch(_){}}
function ytLoad(id,at=0){
  ytVid=id;ytState=-1;ytWatch(id);
  if(ytF&&ytReady){ytSend('loadVideoById',{videoId:id,startSeconds:at});ytSend('setVolume',lib.vol);return}
  ytWant={id,at};
  if(ytF)return; // still starting up; onReady plays ytWant
  if(!('credentialless' in HTMLIFrameElement.prototype)){ytFailed("This browser can't play YouTube songs here. Try another source.");return}
  ytF=document.createElement('iframe');
  ytF.id='mu-yt';ytF.title='YouTube player';ytF.tabIndex=-1;ytF.setAttribute('aria-hidden','true');
  ytF.setAttribute('credentialless','');ytF.allow='autoplay; encrypted-media';
  ytF.src=`${YT_ORIGIN}/embed/${encodeURIComponent(id)}?enablejsapi=1&autoplay=1&controls=0&disablekb=1&playsinline=1&rel=0&start=${Math.floor(at)}&origin=${encodeURIComponent(location.origin)}`;
  // the player only starts reporting once told someone is listening; keep saying so until it answers
  ytF.onload=()=>{clearInterval(ytHello);let n=0;const hi=()=>{if(ytReady||++n>40)return clearInterval(ytHello);try{ytF.contentWindow.postMessage(JSON.stringify({event:'listening',id:'mu',channel:'widget'}),YT_ORIGIN)}catch(_){}};hi();ytHello=setInterval(hi,250)};
  document.body.appendChild(ytF);
}
function ytStop(){clearTimeout(ytT);if(ytVid){ytSend('stopVideo');ytVid='';ytState=-1}}
addEventListener('message',e=>{
  if(!ytF||e.source!==ytF.contentWindow||e.origin!==YT_ORIGIN)return;
  let d;try{d=typeof e.data==='string'?JSON.parse(e.data):e.data}catch(_){return}
  if(!d||typeof d!=='object')return;
  if(d.event==='onReady'){
    ytReady=true;clearInterval(ytHello);ytSend('setVolume',lib.vol);
    const w=ytWant;ytWant=null;
    if(w&&w.id!==new URL(ytF.src).pathname.split('/').pop())ytSend('loadVideoById',{videoId:w.id,startSeconds:w.at});
    else if(ytVid)ytSend('playVideo');
    return;
  }
  if(!isYT(cur)||!ytVid)return;
  if(d.event==='onError'){
    // 101/150: the uploader doesn't allow embedding; 100: removed; 2/5: bad id or player error
    ytFailed(d.info===101||d.info===150?"That video can't play outside YouTube. Skipping.":undefined);return;
  }
  const i=d.event==='infoDelivery'?d.info:d.event==='onStateChange'?{playerState:d.info}:null;
  if(!i||typeof i!=='object')return;
  if(i.duration>0){dur=i.duration}
  if(typeof i.currentTime==='number'){pos=i.currentTime;if(!seeking)updateProgress()}
  if(typeof i.playerState==='number'&&i.playerState!==ytState){
    ytState=i.playerState;
    if(ytState===1){clearTimeout(ytT);ytFails=0;onPlaying()}
    else if(ytState===2){clearTimeout(ytT);onPaused()}
    else if(ytState===3)setStatus('Loading…');
    else if(ytState===0){playing=false;next(true)}
  }
});

/* ═══ controls, for either engine ═══ */
const loaded=()=>isYT(cur)?!!ytVid:!!AUDIO.getAttribute('src')&&!AUDIO.error;
const paused=()=>isYT(cur)?ytState!==1&&ytState!==3:AUDIO.paused;
function resume(){if(isYT(cur))ytSend('playVideo');else AUDIO.play().catch(()=>{})}
function pause(){if(isYT(cur))ytSend('pauseVideo');else AUDIO.pause()}
function togglePlay(){
  if(!cur){const list=rows.length?rows:lib.liked;if(list.length)playFrom(list,0);else toast('Pick a song first');return}
  if(!loaded()){startCurrent();return}
  if(paused())resume();else pause();
}
function seekTo(sec){
  pos=Math.max(0,sec);
  if(isYT(cur)){if(ytVid)ytSend('seekTo',pos,true)}
  else if(AUDIO.getAttribute('src')&&!AUDIO.error)AUDIO.currentTime=pos;
  updateProgress();
}
function setStatus(text){statusText=text||'';$('#mu-artist').textContent=statusText||(cur?(cur.artist||cur.uploader||''):'Pick a song to start')}

/* the OS media controls (keyboard media keys, lock screen, Chromebook shelf) */
function mediaMeta(t){
  if(!('mediaSession' in navigator))return;
  try{navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist||t.uploader||'',album:"william's vm",
    artwork:t.artwork?[{src:location.origin+art(t.artwork),sizes:'300x300',type:'image/jpeg'}]:[]})}catch(_){}
}
if('mediaSession' in navigator){
  const h=(a,f)=>{try{navigator.mediaSession.setActionHandler(a,f)}catch(_){}};
  h('play',()=>togglePlay());h('pause',()=>pause());
  h('nexttrack',()=>next());h('previoustrack',()=>prev());
  h('seekto',d=>seekTo(d.seekTime||0));
}

/* ═══ now-playing bar + mini player ═══ */
function updateBar(){
  const has=!!cur;
  $('#mu-title').textContent=has?cur.title:'Nothing playing';
  setStatus(statusText);
  for(const el of [$('#mu-art'),$('#mm-art')])el.style.backgroundImage=has&&cur.artwork?`url('${art(cur.artwork)}')`:'';
  $('#mu-like').classList.toggle('on',has&&isLiked(cur));
  $('#mu-like').disabled=!has;
  for(const b of [$('#mu-play'),$('#mm-play')]){b.classList.toggle('on',playing);b.setAttribute('aria-label',playing?'Pause':'Play')}
  $('#mu-shuffle').classList.toggle('on',!!lib.shuffle);
  $('#mu-repeat').classList.toggle('on',lib.repeat!=='off');
  $('#mu-repeat').classList.toggle('one',lib.repeat==='one');
  $('#mu-repeat').title=lib.repeat==='one'?'Repeat one':lib.repeat==='all'?'Repeat all':'Repeat off';
  $('#mm-title').textContent=has?cur.title:'';
  $('#mm-artist').textContent=has?(cur.artist||cur.uploader||''):'';
  $('#tb-music').classList.toggle('playing',playing);
  document.documentElement.dataset.music=playing?'on':'off';
  if('mediaSession' in navigator)try{navigator.mediaSession.playbackState=has?(playing?'playing':'paused'):'none'}catch(_){}
  updateMini();updateProgress();
}
function updateProgress(){
  const d=dur||cur?.duration||0;
  $('#mu-cur').textContent=time(pos);$('#mu-dur').textContent=time(d);
  if(!seeking)$('#mu-seek').value=d?Math.round(pos/d*1000):0;
  $('#mu-seek').style.setProperty('--p',(d?pos/d*100:0)+'%');
  $('#mm-bar').style.width=(d?Math.min(100,pos/d*100):0)+'%';
}
function updateMini(){MINI.classList.toggle('show',!!cur&&!miniHidden&&!W.classList.contains('show'))}

/* ═══ context menu ═══ */
function openMenu(t,anchor){
  const pop=$('#mu-pop'),inPl=view==='playlist'&&lib.playlists.find(p=>p.id===viewArg);
  pop._track=t;
  pop.innerHTML=`<button data-m="next">Play next</button><button data-m="queue">Add to queue</button>
    ${view==='queue'&&cur&&keyOf(cur)!==keyOf(t)?'<button data-m="unqueue">Remove from queue</button>':''}
    <div class="sep"></div><small>Add to playlist</small>
    ${lib.playlists.map(p=>`<button data-m="pl" data-pl="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
    <button data-m="newpl">+ New playlist…</button>
    ${inPl?'<div class="sep"></div><button data-m="unpl" class="bad">Remove from this playlist</button>':''}
    ${t.url?`<div class="sep"></div><a data-m="sc" href="${esc(t.url)}" target="_blank" rel="noopener">Open on ${SOURCES[srcOf(t)]}</a>`:''}`;
  pop.classList.add('show');
  const r=anchor.getBoundingClientRect(),w=W.getBoundingClientRect();
  const top=Math.min(r.bottom+4,w.bottom-pop.offsetHeight-8);
  pop.style.top=Math.max(8,top-w.top)+'px';
  pop.style.left=Math.max(8,Math.min(r.right-pop.offsetWidth,w.width-pop.offsetWidth-8))+'px';
}
function closeMenu(){$('#mu-pop').classList.remove('show')}
$('#mu-pop').addEventListener('click',e=>{
  const b=e.target.closest('[data-m]');if(!b)return;
  const t=$('#mu-pop')._track;closeMenu();if(!t||b.dataset.m==='sc')return;
  click();
  switch(b.dataset.m){
    case 'next':return playNext(t);
    case 'queue':return addToQueue(t);
    case 'unqueue':return removeFromQueue(t);
    case 'pl':{const pl=lib.playlists.find(p=>p.id===b.dataset.pl);if(pl)addToPlaylist(pl,t);return}
    case 'newpl':return newPlaylist(pl=>addToPlaylist(pl,t));
    case 'unpl':{
      const pl=lib.playlists.find(p=>p.id===viewArg);if(!pl)return;
      pl.tracks=pl.tracks.filter(x=>keyOf(x)!==keyOf(t));saveLib();renderPls();render();return;
    }
  }
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#mu-pop,[data-act="more"]'))closeMenu()});

/* ═══ source switch ═══ */
/* Audius has its own trending lists; every other source plays Deezer's charts */
const chartSrc=()=>lib.source==='au'?'au':'dz';
function setSource(src){
  if(!SOURCES[src]||src===lib.source)return;
  lib.source=src;saveLib();paintSource();
  toast(`Searching ${SOURCES[src]}`);
  if(view==='search'&&lastQ)search(lastQ);else if(view==='home')renderHome();
}
function paintSource(){
  $$('#mu-src button').forEach(b=>{const on=b.dataset.src===lib.source;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  $('#mu-q').placeholder=`Search ${SOURCES[lib.source]||'songs'}`;
}
$('#mu-src').addEventListener('click',e=>{const b=e.target.closest('[data-src]');if(b){click();setSource(b.dataset.src)}});

/* ═══ search ═══ */
async function search(q){
  q=String(q||'').trim();if(!q)return;
  lastQ=q;$('#mu-q').value=q;results=[];searching=true;
  if(!W.classList.contains('show'))open();
  setView('search');
  const seq=++searchSeq;
  try{const d=await getJSON(`/api/music/search?q=${encodeURIComponent(q)}&source=${lib.source}`);if(seq!==searchSeq)return;results=d.tracks||[]}
  catch(e){if(seq!==searchSeq)return;results=[];toast(e.message,'err')}
  searching=false;
  if(view==='search')render();
}
let qT;
$('#mu-q').addEventListener('input',e=>{clearTimeout(qT);const v=e.target.value.trim();if(v.length>=2)qT=setTimeout(()=>search(v),500)});
$('#mu-q').addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(qT);search(e.target.value)}if(e.key==='Escape')e.target.blur()});

/* ═══ events ═══ */
BODY.addEventListener('click',e=>{
  const chip=e.target.closest('[data-genre]');
  if(chip){click();genre=+chip.dataset.genre;$$('.mu-chip').forEach(c=>c.classList.toggle('on',c===chip));renderHome();return}
  const card=e.target.closest('[data-recent]');
  if(card){click();playFrom(lib.recent,+card.dataset.recent);return}
  const lb=e.target.closest('[data-list]');
  if(lb){
    click();
    const a=lb.dataset.list;
    if(a==='play')return playFrom(rows,0,{shuffle:false});
    if(a==='shuffle')return playFrom(rows,0,{shuffle:true});
    if(a==='clear'){queue=cur?[cur]:[];qi=cur?0:-1;order=null;return render()}
    if(a==='queue')return setView('queue');
    const pl=lib.playlists.find(p=>p.id===viewArg);if(!pl)return;
    if(a==='rename')return dcModal({title:'Rename playlist',okLabel:'Save',fields:[{key:'name',label:'Name',value:pl.name,maxlength:40}],
      onOk:v=>{pl.name=v.name.trim()||pl.name;saveLib();renderPls();render()}});
    if(a==='delete'){if(!confirm(`Delete the playlist “${pl.name}”?`))return;lib.playlists=lib.playlists.filter(p=>p!==pl);saveLib();return setView('liked')}
    return;
  }
  const row=e.target.closest('.mu-row');if(!row)return;
  const t=rows[+row.dataset.i];if(!t)return;
  const act=e.target.closest('[data-act]')?.dataset.act;
  if(act==='like'){click();return toggleLike(t)}
  if(act==='more'){click();return openMenu(t,e.target.closest('[data-act]'))}
  click();
  if(view==='queue'){
    // jump within the current queue instead of replacing it
    const k=queue.findIndex(x=>keyOf(x)===keyOf(t));if(k>=0){qi=k;return startCurrent()}
  }
  if(view==='now')return togglePlay();
  playFrom(rows,+row.dataset.i);
});
BODY.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('mu-row')){e.preventDefault();e.target.click()}});
$$('.mu-nav button').forEach(b=>b.onclick=()=>{click();setView(b.dataset.view);if(b.dataset.view==='search')setTimeout(()=>$('#mu-q').focus(),50)});
$('#mu-pls').addEventListener('click',e=>{const b=e.target.closest('[data-pl]');if(b){click();setView('playlist',b.dataset.pl)}});
$('#mu-new-pl').onclick=()=>{click();newPlaylist()};
$('#mu-side-btn').onclick=e=>{e.stopPropagation();W.classList.toggle('side-open')};
// on phones the sidebar is a drawer: a tap anywhere else closes it
W.addEventListener('click',e=>{if(W.classList.contains('side-open')&&!e.target.closest('.mu-side'))W.classList.remove('side-open')});
$('#mu-close').onclick=()=>{click();hide()};
$('#mu-play').onclick=()=>{click();togglePlay()};
$('#mu-prev').onclick=()=>{click();prev()};
$('#mu-next').onclick=()=>{click();next()};
$('#mu-like').onclick=()=>{click();toggleLike(cur)};
$('#mu-now').addEventListener('click',e=>{if(!e.target.closest('#mu-like')&&cur)setView('now')});
$('#mu-np-btn').onclick=()=>{click();setView('now')};
$('#mu-shuffle').onclick=()=>{
  click();lib.shuffle=!lib.shuffle;saveLib();
  order=lib.shuffle&&queue.length?shuffledOrder(qi):null;
  toast(lib.shuffle?'Shuffle on':'Shuffle off');updateBar();if(view==='queue')render();
};
$('#mu-repeat').onclick=()=>{
  click();lib.repeat=lib.repeat==='off'?'all':lib.repeat==='all'?'one':'off';saveLib();
  toast({off:'Repeat off',all:'Repeating the queue',one:'Repeating this song'}[lib.repeat]);updateBar();
};
const seek=$('#mu-seek');
seek.addEventListener('input',()=>{seeking=true;const d=dur||cur?.duration||0;$('#mu-cur').textContent=time(seek.value/1000*d);seek.style.setProperty('--p',seek.value/10+'%')});
seek.addEventListener('change',()=>{const d=dur||cur?.duration||0;seeking=false;if(cur&&d)seekTo(seek.value/1000*d)});
const vol=$('#mu-vol');
vol.value=lib.vol;vol.style.setProperty('--p',lib.vol+'%');
vol.addEventListener('input',()=>{lib.vol=+vol.value;vol.style.setProperty('--p',lib.vol+'%');AUDIO.volume=lib.vol/100;ytSend('setVolume',lib.vol)});
vol.addEventListener('change',saveLib);
$('#mm-play').onclick=()=>{click();togglePlay()};
$('#mm-prev').onclick=()=>{click();prev()};
$('#mm-next').onclick=()=>{click();next()};
$('#mm-x').onclick=()=>{click();miniHidden=true;updateMini()};
MINI.addEventListener('click',e=>{if(!e.target.closest('button'))open()});
document.addEventListener('keydown',e=>{
  if(!W.classList.contains('show')||typing()||e.altKey||e.ctrlKey||e.metaKey)return;
  // a focused button or row handles Space itself
  if(e.code==='Space'){if(e.target.closest('button,a,[role="button"]'))return;e.preventDefault();togglePlay()}
  else if(e.key==='Escape'){if($('#mu-pop').classList.contains('show'))closeMenu();else hide()}
});

/* ═══ window ═══ */
let opened=false;
function open(){
  W.classList.remove('closing');W.classList.add('show');
  $('#tb-music').classList.add('active');
  closeAllPanels();
  if($('#chat-window').classList.contains('show'))closeChat();
  if(!opened){opened=true;setView('home')}
  updateMini();
}
function hide(){
  if(!W.classList.contains('show'))return;
  closeMenu();W.classList.add('closing');
  onCloseDone(W,()=>{W.classList.remove('show','closing');updateMini()});
  $('#tb-music').classList.remove('active');
  updateMini();
}
function toggle(){W.classList.contains('show')&&!W.classList.contains('closing')?hide():open()}
/* another full-screen app opening covers the music window: step aside, keep playing */
const OTHERS=['#chat-window','#browser-wrap','#vm-wrap','#cloud-wrap','#remote-wrap','#ai-window','#movies-wrap'].map(s=>$(s)).filter(Boolean);
const shown=el=>getComputedStyle(el).display!=='none'&&!el.classList.contains('closing');
let wasShown=new Map(OTHERS.map(el=>[el,shown(el)]));
const appWatch=new MutationObserver(()=>{
  for(const el of OTHERS){
    const now=shown(el);
    if(now&&!wasShown.get(el)&&W.classList.contains('show'))hide();
    wasShown.set(el,now);
  }
});
OTHERS.forEach(el=>appWatch.observe(el,{attributes:true,attributeFilter:['class','style']}));

window.music={
  open,hide,toggle,search,
  play:(tracks,i=0)=>playFrom(tracks,i),
  /* for the tests: what's playing and where */
  stats:()=>isYT(cur)
    ?{title:cur.title,id:cur.id,source:'yt',playing,pos,dur,src:ytF?.src||'',paused:paused(),volume:lib.vol/100}
    :{title:cur?.title||'',id:cur?.id||null,source:cur?srcOf(cur):null,playing,pos:AUDIO.currentTime,dur:AUDIO.duration,src:AUDIO.currentSrc,paused:AUDIO.paused,volume:AUDIO.volume},
  setSource,
  /* for the desktop widget and the AI: what's playing, and the buttons */
  now:()=>cur?{title:cur.title,artist:cur.artist||cur.uploader||'',artwork:cur.artwork?art(cur.artwork):'',playing,pos,dur:dur||cur.duration||0}:null,
  playPause:()=>togglePlay(),next:()=>next(),prev:()=>prev(),
  /* search the current source and play the best result (the AI's "play …") */
  async playQuery(q,source){
    if(source&&SOURCES[source]&&source!==lib.source){lib.source=source;saveLib();paintSource()}
    // straight to the API: search() would open the music window over whatever asked
    const d=await getJSON(`/api/music/search?q=${encodeURIComponent(String(q||'').slice(0,120))}&source=${lib.source}`);
    const tracks=d.tracks||[];
    if(tracks.length){playFrom(tracks,0);return tracks[0]}
    return null;
  },
  reload(){lib=loadLib();vol.value=lib.vol;vol.style.setProperty('--p',lib.vol+'%');paintSource();renderPls();if(opened)render();updateBar()}
};
paintSource();renderPls();updateBar();
})();
