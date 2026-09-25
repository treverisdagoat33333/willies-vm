/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   SETTINGS STORE — single localStorage key, instant apply
   ═══════════════════════════════════════════════════════════ */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const DEFAULTS={
  theme:'dark',accent:'#4f8cff',accent2:'#a855f7',gradient:true,glow:false,autotheme:false,
  font:'system',radius:'normal',density:'normal',
  wallpaper:'aurora',wallpaperUrl:'',blur:true,opacity:0.72,scale:'1',
  particles:false,pstyle:'dots',pcount:70,ripple:false,trail:false,filter:'none',dim:1,
  tbpos:'bar',tbside:'bottom',tbhide:false,clock24:false,clocksec:false,icons:true,bgtext:true,bgtextval:'Willie Games V3',showlauncher:true,greeting:true,startapp:'none',
  homepage:'https://www.google.com/',engine:'google',autoblank:false,bmbar:true,incognito:false,
  gsize:'normal',gopen:'new',recent:true,gsort:'default',
  defaultVM:'e2b',vmwarn:true,vmconfirm:false,
  cloak:'none',cloakTitle:'',cloakIcon:'',cloakAuto:false,cloakRandom:false,
  panic:false,panicKey:'`',panicUrl:'https://classroom.google.com',panicAction:'redirect',panicWipe:false,
  blurunfocus:false,blurAmt:24,lock:false,lockMins:'5',
  perf:false,motion:false,bouncy:true,wallimg:true,preload:false,sound:false,soundpack:'soft',volume:0.5,chatsound:true,fps:false,notify:false,sync:true,
  proxy:'wj',wjFast:true,wjAds:true,saveLogins:true
};
const KEY='wvm.settings.v1';
let S=(()=>{
  try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(Object.keys(s).length)return{...DEFAULTS,...s}}catch(_){}
  // migrate legacy keys from the old page
  const g=k=>localStorage.getItem(k),m={...DEFAULTS};
  if(g('accentColor'))m.accent=g('accentColor');
  if(g('defaultHomepage'))m.homepage=g('defaultHomepage');
  if(g('defaultVM'))m.defaultVM=g('defaultVM');
  if(g('blurEnabled')==='false')m.blur=false;
  if(g('incognitoMode')==='true')m.incognito=true;
  if(g('autoAboutBlank')==='true')m.autoblank=true;
  if(g('soundEnabled')==='true')m.sound=true;
  if(g('wallpaper')){m.wallpaper='custom';m.wallpaperUrl=g('wallpaper')}
  return m;
})();
/* WillieJet with fast mode became the default: anyone still on the old defaults (Scramjet v2,
   fast mode off) moves over once. Picking something else afterwards sticks. */
try{if(!localStorage.getItem('wvm.defaults.v2')){if(S.proxy==='sj2')S.proxy='wj';if(S.wjFast===false)S.wjFast=true;localStorage.setItem(KEY,JSON.stringify(S));localStorage.setItem('wvm.defaults.v2','1')}}catch(_){}
/* settings sync state; the logic lives in SETTINGS SYNC further down */
const SYNC_LOCAL_ONLY=['perf','wallimg','preload','fps','sync','proxy','wjFast','wjAds']; // speed and engine settings belong to the device
const SYNC_KEYS=['bookmarks','favGames','music']; // localStorage keys that travel with the account
let syncOn=false,syncApplying=false,syncT=null,syncPulledAt=0;
let syncMeta=(()=>{try{return JSON.parse(localStorage.getItem('wvm.sync')||'null')}catch(_){return null}})()||{user:'',server:0,dirty:false};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){toast('Could not save settings (storage full?)','err')}syncTouch()};
const store=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch(_){return d}};
const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}if(SYNC_KEYS.includes(k))syncTouch()};
let bookmarks=store('bookmarks',[]),historyData=store('history',[]),recentGames=store('recentGames',[]),favGames=store('favGames',[]);

const WALLS=[
  {id:'aurora',name:'Aurora',css:'radial-gradient(1200px 800px at 15% 10%,rgba(var(--accent-rgb),.35),transparent 60%),radial-gradient(1000px 700px at 90% 90%,rgba(168,85,247,.28),transparent 60%),linear-gradient(160deg,var(--bg1),var(--bg0))'},
  {id:'sunset',name:'Sunset',css:'linear-gradient(135deg,#ff6b6b 0%,#f7b267 40%,#7b2cbf 100%)'},
  {id:'ocean',name:'Ocean',css:'linear-gradient(160deg,#021b3a 0%,#0a4d8c 50%,#00b4d8 100%)'},
  {id:'forest',name:'Forest',css:'linear-gradient(160deg,#0b2b1c 0%,#14532d 50%,#4ade80 100%)'},
  {id:'mono',name:'Graphite',css:'linear-gradient(160deg,#111 0%,#2a2a2e 100%)'},
  {id:'candy',name:'Candy',css:'linear-gradient(135deg,#ff9a9e 0%,#fad0c4 50%,#a18cd1 100%)'},
  {id:'photo',name:'Mountains',img:'https://images.alphacoders.com/133/thumb-1920-1330185.jpeg'},
  {id:'photo2',name:'Nebula',img:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&q=80'},
  {id:'photo3',name:'Dunes',img:'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&q=80'},
  {id:'custom',name:'Custom',css:'repeating-linear-gradient(45deg,#333 0 10px,#444 10px 20px)'}
];
const ico=d=>`https://www.google.com/s2/favicons?domain=${d}&sz=32`;
const CLOAKS={
  none:{t:"william's vm",i:$('#favicon').href},
  classroom:{t:'Classes',i:'https://ssl.gstatic.com/classroom/favicon.png'},
  docs:{t:'Untitled document - Google Docs',i:'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico'},
  drive:{t:'My Drive - Google Drive',i:'https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png'},
  gmail:{t:'Inbox - Gmail',i:'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico'},
  canvas:{t:'Dashboard',i:'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico'},
  schoology:{t:'Home | Schoology',i:'https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico'},
  wiki:{t:'Wikipedia, the free encyclopedia',i:'https://en.wikipedia.org/static/favicon/wikipedia.ico'},
  slides:{t:'Untitled presentation - Google Slides',i:ico('docs.google.com')},
  sheets:{t:'Untitled spreadsheet - Google Sheets',i:ico('sheets.google.com')},
  forms:{t:'Google Forms',i:ico('docs.google.com')},
  khan:{t:'Khan Academy | Free Online Courses',i:ico('khanacademy.org')},
  quizlet:{t:'Quizlet: Study Tools & Learning Resources',i:ico('quizlet.com')},
  clever:{t:'Clever | Portal',i:ico('clever.com')},
  desmos:{t:'Desmos | Graphing Calculator',i:ico('desmos.com')},
  powerschool:{t:'PowerSchool SIS',i:ico('powerschool.com')},
  campus:{t:'Infinite Campus Student',i:ico('infinitecampus.com')},
  ixl:{t:'IXL | Math, Language Arts, Science',i:ico('ixl.com')},
  nearpod:{t:'Nearpod',i:ico('nearpod.com')},
  edpuzzle:{t:'Edpuzzle',i:ico('edpuzzle.com')},
  outlook:{t:'Mail - Outlook',i:ico('outlook.office.com')},
  teams:{t:'Microsoft Teams',i:ico('teams.microsoft.com')},
  zoom:{t:'Zoom Meeting',i:ico('zoom.us')},
  drivehq:{t:'Dashboard | Schoolwork',i:ico('google.com')}
};
const ENGINES={google:'https://www.google.com/search?q=',ddg:'https://duckduckgo.com/?q=',bing:'https://www.bing.com/search?q=',brave:'https://search.brave.com/search?q=',startpage:'https://www.startpage.com/do/search?q='};

function hexToRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255].join(',')}
const root=document.documentElement;
function effectiveTheme(){return S.autotheme?((new Date().getHours()>=7&&new Date().getHours()<19)?'light':'dark'):S.theme}
function applyAll(){
  const th=effectiveTheme();
  root.dataset.theme=th;root.dataset.blur=S.blur?'on':'off';root.dataset.perf=S.perf?'on':'off';root.dataset.motion=S.motion?'off':'on';root.dataset.bouncy=S.bouncy?'on':'off';
  root.dataset.tbpos=S.tbpos;root.dataset.tbside=S.tbside;root.dataset.tbhide=S.tbhide?'on':'off';root.dataset.icons=S.icons?'on':'off';root.dataset.bgtext=S.bgtext?'on':'off';
  root.dataset.gsize=S.gsize;root.dataset.bmbar=S.bmbar?'on':'off';
  root.dataset.font=S.font;root.dataset.radius=S.radius;root.dataset.density=S.density;root.dataset.glow=S.glow?'on':'off';
  root.style.setProperty('--accent',S.accent);root.style.setProperty('--accent-rgb',hexToRgb(S.accent));root.style.setProperty('--ui',S.scale);
  root.style.setProperty('--accent2',S.gradient?S.accent2:S.accent);
  const base=th==='light'?'255,255,255':th==='oled'?'0,0,0':'18,21,30';
  root.style.setProperty('--glass',`rgba(${base},${S.opacity})`);
  $('#bg-text').textContent=S.bgtextval||'Willie Games V3';
  updateClock();updateHero();
  applyWallpaper();applyCloak();applyScreenFx();applyParticles();applyFps();resetIdle();
  $('#sc-panic').textContent=S.panic?`${S.panicKey} → ${S.panicUrl}`:'off';
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=th==='light'?'#f6f8fb':'#0b0d12';
}
/* screen filter + dimmer overlay */
const FILTERS={none:'',warm:'sepia(.45) saturate(1.25) hue-rotate(-12deg)',cool:'saturate(1.1) hue-rotate(18deg) brightness(1.02)',gray:'grayscale(1)',sepia:'sepia(.85)',contrast:'contrast(1.35) saturate(1.1)',invert:'invert(1) hue-rotate(180deg)'};
function panicNow(){
  const url=S.panicUrl||'https://classroom.google.com';
  if(S.panicWipe){try{localStorage.clear();sessionStorage.clear()}catch(_){}wjWipe()}
  if(S.panicAction==='close'){
    window.open('','_self');window.close();
    setTimeout(()=>location.replace(url),150);
    return;
  }
  if(S.panicAction==='newtab'){
    window.open(url,'_blank');
    location.replace('about:blank');
    return;
  }
  location.replace(url);
}
function applyScreenFx(){
  const el=$('#screen-fx'),f=FILTERS[S.filter]||'',dim=Number(S.dim)||1;
  const parts=[f,dim<1?`brightness(${dim})`:''].filter(Boolean).join(' ');
  el.style.backdropFilter=parts;el.style.webkitBackdropFilter=parts;
}
function updateHero(){
  const el=$('#hero-sub');if(!el)return;
  if(!S.greeting){el.textContent='Pick something to launch.';return}
  const h=new Date().getHours(),g=h<5?'Still up':h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  el.textContent=`${g}, ${currentUsername}.`;
}
function applyWallpaper(){
  const w=WALLS.find(x=>x.id===S.wallpaper)||WALLS[0],bg=$('#bg'),im=$('#bg-img');
  bg.style.background=w.css||WALLS[0].css;
  const url=w.id==='custom'?S.wallpaperUrl:w.img;
  im.classList.remove('on');
  if(url&&S.wallimg){const pre=new Image();pre.onload=()=>{im.style.backgroundImage=`url("${url}")`;im.classList.add('on')};pre.src=url}
  else im.style.backgroundImage='';
}
let randomCloakKey=null;
function activeCloakKey(){
  if(!S.cloakRandom)return S.cloak;
  if(!randomCloakKey){
    const ks=Object.keys(CLOAKS).filter(k=>k!=='none');
    randomCloakKey=ks[Math.floor(Math.random()*ks.length)];
  }
  return randomCloakKey;
}
function cloakTarget(){
  const k=activeCloakKey();
  if(k==='custom')return{t:S.cloakTitle||CLOAKS.none.t,i:S.cloakIcon||CLOAKS.none.i};
  return CLOAKS[k]||CLOAKS.none;
}
function applyCloak(){
  const target=cloakTarget(),cloaking=activeCloakKey()!=='none';
  // With auto-cloak on, the real identity shows while you are looking at the
  // tab and only flips to the disguise once you switch away.
  const wearIt=cloaking&&(!S.cloakAuto||document.hidden);
  const use=wearIt?target:CLOAKS.none;
  document.title=use.t;$('#favicon').href=use.i;
  const pv=$('#cloak-preview');
  if(pv){
    $('#cloak-preview-icon').src=target.i;
    $('#cloak-preview-title').textContent=target.t;
    $('#cloak-preview-note').textContent=
      !cloaking?'No cloak \u2014 the tab shows its real name':
      S.cloakAuto?'Shown once you switch to another tab':'Shown at all times';
  }
}
document.addEventListener('visibilitychange',applyCloak);
function set(k,v){S[k]=v;save();applyAll();syncControls();if(k==='wjFast')proxies.wj?.then(e=>e.setFast(v)).catch(()=>{});if(k==='wjAds')proxies.wj?.then(e=>e.setAds(v,siteAdsOff)).catch(()=>{})}
const pct=v=>Math.round(v*100)+'%';
const RANGE_OUT={opacity:{el:'#opacity-val',fmt:pct},pcount:{el:'#pcount-val',fmt:v=>String(Math.round(v))},dim:{el:'#dim-val',fmt:pct},volume:{el:'#volume-val',fmt:pct},blurAmt:{el:'#bluramt-val',fmt:v=>Math.round(v)+'px'}};

/* bind generic controls */
function syncControls(){
  $$('[data-setting]').forEach(el=>{
    const k=el.dataset.setting,v=S[k];
    if(el.classList.contains('switch'))el.setAttribute('aria-checked',String(!!v));
    else if(el.classList.contains('seg'))$$('button',el).forEach(b=>b.classList.toggle('active',String(b.dataset.v)===String(v)));
    else if(el.type==='range'){el.value=v;const o=RANGE_OUT[k];if(o)$(o.el).textContent=o.fmt(v)}
    else if(document.activeElement!==el)el.value=v??'';
  });
  $$('#swatches .sw').forEach(s=>s.classList.toggle('active',s.dataset.c.toLowerCase()===S.accent.toLowerCase()));
  $('#accent-picker').value=S.accent;
  $('#accent2-picker').value=S.accent2;
  $$('#walls .wall').forEach(w=>w.classList.toggle('active',w.dataset.id===S.wallpaper));
  $('#wallpaper-input').value=S.wallpaperUrl.startsWith('data:')?'(uploaded image)':S.wallpaperUrl;
  $('#panic-key').value=S.panicKey==='`'?'` (backtick)':S.panicKey;
  $('#cloak-custom-row').style.display=S.cloak==='custom'?'':'none';
  $('#bm-count').textContent=`${bookmarks.length} saved. Right-click a bookmark to remove it.`;
}
document.addEventListener('click',e=>{
  const sw=e.target.closest('.switch[data-setting]');if(sw){click();set(sw.dataset.setting,!S[sw.dataset.setting]);return}
  const sb=e.target.closest('.seg[data-setting] button');if(sb){click();const k=sb.parentElement.dataset.setting;set(k,sb.dataset.v);return}
});
document.addEventListener('input',e=>{
  const el=e.target;if(!el.dataset.setting)return;
  if(el.type==='range'){const k=el.dataset.setting;S[k]=parseFloat(el.value);applyAll();const o=RANGE_OUT[k];if(o)$(o.el).textContent=o.fmt(el.value)}
  else{S[el.dataset.setting]=el.value;applyAll()}
  saveSoon();
});
document.addEventListener('change',e=>{const el=e.target;if(!el.dataset.setting)return;const k=el.dataset.setting;S[k]=el.type==='range'?parseFloat(el.value):el.value;save();applyAll();syncControls();if(k==='gsort'||k==='gsize')renderGames();if(k==='proxy')proxyChanged()});
let saveT;const saveSoon=()=>{clearTimeout(saveT);saveT=setTimeout(save,400)};

/* Accent swatches */
const SWATCHES=['#4f8cff','#0078d4','#10b981','#f59e0b','#ef4444','#a855f7','#ec4899','#06b6d4','#84cc16','#f97316'];
$('#swatches').innerHTML=SWATCHES.map(c=>`<button class="sw" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
$('#swatches').addEventListener('click',e=>{const b=e.target.closest('.sw');if(b){click();set('accent',b.dataset.c)}});
$('#accent-picker').addEventListener('input',e=>{S.accent=e.target.value;applyAll();saveSoon()});
$('#accent-picker').addEventListener('change',e=>set('accent',e.target.value));
$('#accent2-picker').addEventListener('input',e=>{S.accent2=e.target.value;S.gradient=true;applyAll();saveSoon()});
$('#accent2-picker').addEventListener('change',e=>set('accent2',e.target.value));
/* Wallpapers */
$('#walls').innerHTML=WALLS.map(w=>`<button class="wall" data-id="${w.id}" style="background:${w.img?`url('${w.img}') center/cover`:w.css.replace(/var\(--accent-rgb\)/g,hexToRgb(S.accent)).replace(/var\(--bg1\)/g,'#12161f').replace(/var\(--bg0\)/g,'#0b0d12')}"><span>${w.name}</span></button>`).join('');
$('#walls').addEventListener('click',e=>{const b=e.target.closest('.wall');if(!b)return;click();if(b.dataset.id==='custom'&&!S.wallpaperUrl){toast('Paste an image URL or upload a file first');$('#wallpaper-input').focus();return}set('wallpaper',b.dataset.id)});
$('#wall-apply').onclick=()=>{const u=$('#wallpaper-input').value.trim();if(!u||u.startsWith('('))return toast('Enter an image URL','err');S.wallpaperUrl=u;set('wallpaper','custom');toast('Wallpaper applied','ok')};
$('#wallpaper-input').addEventListener('keydown',e=>{if(e.key==='Enter')$('#wall-apply').click()});
$('#wall-upload').onclick=()=>$('#wall-file').click();
$('#wall-file').onchange=e=>{const f=e.target.files[0];if(!f)return;if(f.size>2.2*1024*1024)return toast('Image too large (max ~2 MB). Try a smaller one or use a URL.','err');const r=new FileReader();r.onload=()=>{S.wallpaperUrl=r.result;set('wallpaper','custom');toast('Wallpaper uploaded','ok')};r.readAsDataURL(f);e.target.value=''};
$('#wall-reset').onclick=()=>{S.wallpaperUrl='';set('wallpaper','aurora');toast('Wallpaper reset')};

/* Settings nav */
$('#snav').addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(!b)return;$$('#snav button').forEach(x=>x.classList.toggle('active',x===b));$$('.spage').forEach(p=>p.classList.toggle('active',p.dataset.page===b.dataset.page));$('.smain').scrollTop=0});
/* Panic key */
const pk=$('#panic-key');
pk.addEventListener('focus',()=>{pk.value='Press a key…'});
pk.addEventListener('blur',syncControls);
pk.addEventListener('keydown',e=>{e.preventDefault();if(e.key==='Escape'){pk.blur();return}if(e.key.length===1||/^F\d+$/.test(e.key)){set('panicKey',e.key);pk.blur();toast(`Panic key set to ${e.key}`,'ok')}});
function openInBlank(){
  const w=window.open('about:blank','_blank');
  if(!w){toast('Popup blocked \u2014 allow popups for this site','err');return false}
  w.document.title=document.title;
  w.document.body.style.margin='0';
  const link=w.document.createElement('link');
  link.rel='icon';link.href=$('#favicon').href;w.document.head.appendChild(link);
  const f=w.document.createElement('iframe');
  f.style.cssText='border:0;width:100vw;height:100vh';
  f.src=location.href;
  w.document.body.appendChild(f);
  return true;
}
$('#panic-test').onclick=()=>{
  if(S.panicWipe&&!confirm('Wipe local data is on. Testing will really erase your settings, history and bookmarks. Continue?'))return;
  panicNow();
};
$('#open-blank').onclick=()=>{if(openInBlank())toast('Opened in about:blank','ok')};
/* auto-open on load, guarded so the embedded copy never opens another one */
if(S.autoblank&&window.self===window.top){
  let already=false;
  try{already=sessionStorage.getItem('wvm.blanked')==='1';sessionStorage.setItem('wvm.blanked','1')}catch(_){}
  if(!already)setTimeout(()=>{if(openInBlank())toast('Opened in about:blank \u2014 you can close this tab','ok')},600);
}
/* Account & data */
$('#export-btn').onclick=()=>{const data={settings:S,bookmarks,favGames,recentGames,exported:new Date().toISOString()};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='willies-vm-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Settings exported','ok')};
$('#import-btn').onclick=()=>$('#import-file').click();
$('#import-file').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(d.settings)S={...DEFAULTS,...d.settings};if(Array.isArray(d.bookmarks)){bookmarks=d.bookmarks;put('bookmarks',bookmarks)}if(Array.isArray(d.favGames)){favGames=d.favGames;put('favGames',favGames)}if(Array.isArray(d.recentGames)){recentGames=d.recentGames;put('recentGames',recentGames)}save();applyAll();syncControls();renderBookmarks();toast('Settings imported','ok')}catch(_){toast('Invalid settings file','err')}};r.readAsText(f);e.target.value=''};
$('#reset-btn').onclick=()=>{if(!confirm('Reset all settings to defaults?'))return;S={...DEFAULTS};save();applyAll();syncControls();toast('Settings reset','ok')};
$('#nuke-btn').onclick=()=>{if(!confirm('Clear ALL data for this site and reload?'))return;localStorage.clear();sessionStorage.clear();if(window.caches)caches.keys().then(k=>k.forEach(x=>caches.delete(x)));loginsWipe();['williejet','__scramjet_controller','$scramjet'].forEach(n=>{try{indexedDB.deleteDatabase(n)}catch(_){}});setTimeout(()=>location.reload(),300)};
$('#clear-bookmarks').onclick=()=>{if(!bookmarks.length)return;if(!confirm('Remove all bookmarks?'))return;bookmarks=[];put('bookmarks',bookmarks);renderBookmarks();syncControls();toast('Bookmarks cleared')};
$('#clear-recent').onclick=$('#clear-recent-2').onclick=()=>{recentGames=[];put('recentGames',recentGames);renderRecent();toast('Recent games cleared')};

/* ═══════════════════════════════════════════════════════════
   UI HELPERS
   ═══════════════════════════════════════════════════════════ */
let audioCtx;
const PACKS={soft:{type:'sine',f:660,to:660,dur:.08,vol:.06},click:{type:'square',f:1400,to:700,dur:.045,vol:.035},pop:{type:'sine',f:320,to:900,dur:.11,vol:.07},retro:{type:'square',f:440,to:180,dur:.14,vol:.04}};
function click(){if(!S.sound)return;try{
  const p=PACKS[S.soundpack]||PACKS.soft,vol=p.vol*(S.volume??.5)*2;if(vol<=0)return;
  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  const t=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=p.type;o.frequency.setValueAtTime(p.f,t);if(p.to!==p.f)o.frequency.exponentialRampToValueAtTime(p.to,t+p.dur);
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+p.dur);
  o.connect(g).connect(audioCtx.destination);o.start();o.stop(t+p.dur);
}catch(_){}}
/* a soft two-note ping, distinct from the UI click; @mentions get a third note */
function chatPing(mention){if(!S.chatsound)return;try{
  const vol=(S.volume??.5)*.5;if(vol<=0)return;
  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  const t=audioCtx.currentTime;
  (mention?[[880,0],[1320,.09],[1760,.18]]:[[880,0],[1320,.09]]).forEach(([f,at])=>{
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sine';o.frequency.setValueAtTime(f,t+at);
    g.gain.setValueAtTime(0,t+at);
    g.gain.linearRampToValueAtTime(vol,t+at+.012);
    g.gain.exponentialRampToValueAtTime(.0001,t+at+.16);
    o.connect(g).connect(audioCtx.destination);o.start(t+at);o.stop(t+at+.18);
  });
}catch(_){}}
/* Desktop notifications: only while the page is out of sight, and never with
   the real site name while the tab is cloaked. */
function notify(title,body,{tag,onclick}={}){
  if(!S.notify||!('Notification' in window)||Notification.permission!=='granted')return;
  if(document.visibilityState==='visible'&&document.hasFocus())return;
  const cloaked=S.cloak&&S.cloak!=='none';
  try{
    const n=new Notification(cloaked?'New message':title,{body:cloaked?'':String(body||'').slice(0,160),tag,icon:cloaked?undefined:'/icons/icon-192.png'});
    n.onclick=()=>{window.focus();n.close();onclick?.()};
  }catch(_){} // Android Chrome only allows notifications from a service worker
}
/* turning the switch on asks the browser; a refusal flips it back off */
document.addEventListener('click',async e=>{
  if(!e.target.closest('.switch[data-setting="notify"]')||!S.notify)return;
  if(!('Notification' in window)){set('notify',false);toast("This browser can't show notifications.",'err');return}
  if(Notification.permission==='granted'){toast('Notifications on','ok');return}
  const p=await Notification.requestPermission().catch(()=>'denied');
  if(p==='granted'){toast('Notifications on','ok');return}
  set('notify',false);
  toast(p==='denied'?"Notifications are blocked for this site. Allow them in the browser's site settings, then try again.":'Notifications stay off.','err');
});
function toast(msg,type=''){const box=$('#toasts'),t=document.createElement('div');t.className='toast '+type;t.innerHTML=`<span class="dot"></span><span></span>`;t.lastChild.textContent=msg;box.appendChild(t);while(box.children.length>4)box.firstChild.remove();setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),260)},3800)}
function setStatus(msg,busy=false){const el=$('#status');el.textContent=msg;el.className=(/^(error|failed)/i.test(msg)?'error':'')+(busy?' busy':'')}
function setLaunching(on){$$('.vm-btn').forEach(b=>b.disabled=on)}
function favicon(url,sz=32){try{const d=new URL(url).hostname;return d?`https://www.google.com/s2/favicons?domain=${d}&sz=${sz}`:''}catch(_){return''}}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function postJSON(url,body,method='POST'){
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  let d={};try{d=await r.json()}catch(_){}
  if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
function typing(){const a=document.activeElement;return a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.isContentEditable)}

function updateClock(){const n=new Date();let h=n.getHours(),suf='';if(!S.clock24){suf=h>=12?' PM':' AM';h=h%12||12}const p=v=>String(v).padStart(2,'0');$('#tb-time').textContent=(S.clock24?p(h):h)+':'+p(n.getMinutes())+(S.clocksec?':'+p(n.getSeconds()):'')+suf;$('#tb-date').textContent=n.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}
setInterval(updateClock,1000);
setInterval(()=>{if(S.autotheme&&effectiveTheme()!==root.dataset.theme)applyAll()},60000);

/* ═══════════════════════════════════════════════════════════
   LIVE BACKGROUND PARTICLES
   ═══════════════════════════════════════════════════════════ */
const fxc=$('#fx-canvas'),fxx=fxc.getContext('2d');
let parts=[],fxRAF=null,fxW=0,fxH=0;
const GLYPHS='01アイウエオｱｲｳ<>/\\{}[]#$%&';
function fxResize(){fxW=fxc.width=Math.floor(innerWidth*Math.min(devicePixelRatio||1,2));fxH=fxc.height=Math.floor(innerHeight*Math.min(devicePixelRatio||1,2));fxc.style.width=innerWidth+'px';fxc.style.height=innerHeight+'px'}
addEventListener('resize',()=>{if(fxRAF){fxResize();seedParticles()}});
function seedParticles(){
  const n=Math.round(S.pcount||70),dpr=Math.min(devicePixelRatio||1,2);
  parts=Array.from({length:n},()=>({
    x:Math.random()*fxW,y:Math.random()*fxH,
    r:(S.pstyle==='snow'?1.5+Math.random()*3:1+Math.random()*2)*dpr,
    vx:(Math.random()-.5)*.35*dpr,vy:(S.pstyle==='snow'||S.pstyle==='matrix'?.4+Math.random()*1.1:(Math.random()-.5)*.35)*dpr,
    a:.25+Math.random()*.55,tw:Math.random()*Math.PI*2,
    ch:GLYPHS[Math.floor(Math.random()*GLYPHS.length)]
  }));
}
function fxFrame(){
  fxx.clearRect(0,0,fxW,fxH);
  const dpr=Math.min(devicePixelRatio||1,2),style=S.pstyle;
  if(style==='matrix')fxx.font=`${12*dpr}px ui-monospace,Consolas,monospace`;
  for(const p of parts){
    p.x+=p.vx;p.y+=p.vy;p.tw+=.05;
    if(p.x<-20)p.x=fxW+20;if(p.x>fxW+20)p.x=-20;
    if(p.y<-20)p.y=fxH+20;if(p.y>fxH+20){p.y=-20;p.x=Math.random()*fxW}
    const alpha=style==='stars'?p.a*(.45+.55*Math.abs(Math.sin(p.tw))):p.a;
    fxx.globalAlpha=alpha;
    fxx.fillStyle=style==='snow'?'#fff':`rgb(${getComputedStyle(root).getPropertyValue('--accent-rgb').trim()||'79,140,255'})`;
    if(style==='matrix'){fxx.fillText(p.ch,p.x,p.y);if(Math.random()<.02)p.ch=GLYPHS[Math.floor(Math.random()*GLYPHS.length)]}
    else{fxx.beginPath();fxx.arc(p.x,p.y,p.r,0,6.283);fxx.fill()}
  }
  fxx.globalAlpha=1;
  fxRAF=requestAnimationFrame(fxFrame);
}
function applyParticles(){
  const on=S.particles&&!S.perf;
  if(on&&!fxRAF){fxc.style.display='block';fxResize();seedParticles();fxRAF=requestAnimationFrame(fxFrame)}
  else if(on){seedParticles()}
  else if(fxRAF){cancelAnimationFrame(fxRAF);fxRAF=null;fxx.clearRect(0,0,fxW,fxH);fxc.style.display='none'}
  else fxc.style.display='none';
}

/* ═══════════════════════════════════════════════════════════
   CLICK RIPPLE + CURSOR TRAIL
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('pointerdown',e=>{
  if(!S.ripple||S.perf)return;
  const r=document.createElement('div');r.className='ripple';r.style.left=e.clientX+'px';r.style.top=e.clientY+'px';
  document.body.appendChild(r);setTimeout(()=>r.remove(),620);
},{passive:true});
let trailLast=0;
document.addEventListener('pointermove',e=>{
  if(!S.trail||S.perf)return;
  const now=performance.now();if(now-trailLast<28)return;trailLast=now;
  const d=document.createElement('div');d.className='ctrail';d.style.left=e.clientX+'px';d.style.top=e.clientY+'px';
  document.body.appendChild(d);setTimeout(()=>d.remove(),660);
},{passive:true});

/* ═══════════════════════════════════════════════════════════
   STATS OVERLAY
   ═══════════════════════════════════════════════════════════ */
let fpsRAF=null,fpsFrames=0,fpsLast=performance.now(),fpsVal=60;
const bootTime=Date.now();
function fpsFrame(){
  fpsFrames++;const now=performance.now();
  if(now-fpsLast>=500){fpsVal=Math.round(fpsFrames*1000/(now-fpsLast));fpsFrames=0;fpsLast=now;
    const up=Math.floor((Date.now()-bootTime)/1000),mm=String(Math.floor(up/60)).padStart(2,'0'),ss=String(up%60).padStart(2,'0');
    const mem=performance.memory?`${Math.round(performance.memory.usedJSHeapSize/1048576)} MB`:'n/a';
    $('#fps').textContent=`${fpsVal} fps\n${mem} heap\nup ${mm}:${ss}\n${tabs.length} tab${tabs.length===1?'':'s'}`;
  }
  fpsRAF=requestAnimationFrame(fpsFrame);
}
function applyFps(){
  const el=$('#fps');el.classList.toggle('show',!!S.fps);
  if(S.fps&&!fpsRAF)fpsRAF=requestAnimationFrame(fpsFrame);
  else if(!S.fps&&fpsRAF){cancelAnimationFrame(fpsRAF);fpsRAF=null}
}

/* ═══════════════════════════════════════════════════════════
   LOCK SCREEN + PRIVACY BLUR
   ═══════════════════════════════════════════════════════════ */
let locked=false,idleT=null,lockClockI=null;
function lockScreen(){
  if(locked)return;locked=true;
  const ls=$('#lock-screen');$('#lock-avatar').textContent=currentUsername[0].toUpperCase();
  const tick=()=>{const n=new Date();let h=n.getHours(),suf='';if(!S.clock24){suf=h>=12?' PM':' AM';h=h%12||12}
    $('#lock-time').textContent=(S.clock24?String(h).padStart(2,'0'):h)+':'+String(n.getMinutes()).padStart(2,'0')+suf;
    $('#lock-date').textContent=n.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})};
  tick();clearInterval(lockClockI);lockClockI=setInterval(tick,1000);
  ls.classList.add('show');
}
function unlockScreen(){if(!locked)return;locked=false;clearInterval(lockClockI);$('#lock-screen').classList.remove('show');resetIdle()}
$('#lock-screen').addEventListener('click',unlockScreen);
$('#lock-now').onclick=()=>{closeAllPanels();lockScreen()};
function resetIdle(){
  clearTimeout(idleT);
  if(!S.lock||locked)return;
  idleT=setTimeout(lockScreen,(parseInt(S.lockMins,10)||5)*60000);
}
['pointermove','pointerdown','keydown','wheel','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{if(locked)return;resetIdle()},{passive:true}));
/* tab-visibility only: window blur also fires when the VM/proxy iframe takes focus */
document.addEventListener('visibilitychange',()=>{
  if(!S.blurunfocus)return;
  const el=$('#screen-fx');
  if(document.hidden){const b=Number(S.blurAmt)||24;el.style.backdropFilter=el.style.webkitBackdropFilter=`blur(${b}px) saturate(.5)`}
  else applyScreenFx();
});

/* ═══════════════════════════════════════════════════════════
   SETTINGS SEARCH
   ═══════════════════════════════════════════════════════════ */
const PAGEN={appearance:'Appearance',effects:'Effects',desktop:'Desktop',browser:'Browser',games:'Games',vm:'Virtual machines',cloak:'Privacy & Cloak',performance:'Performance',account:'Account & Data',shortcuts:'Shortcuts'};
$$('.spage').forEach(p=>{const l=document.createElement('div');l.className='hitlabel';l.textContent=PAGEN[p.dataset.page]||p.dataset.page;p.insertBefore(l,p.firstChild)});
function searchSettings(q){
  q=q.toLowerCase().trim();
  if(!q){
    root.dataset.searching='0';
    $$('.spage,.card,.row').forEach(el=>el.classList.remove('nomatch'));
    $$('.spage').forEach(p=>p.classList.toggle('active',p.dataset.page===$('#snav button.active').dataset.page));
    return;
  }
  root.dataset.searching='1';
  $$('.spage').forEach(p=>{
    let pageHit=0;
    $$('.card',p).forEach(c=>{
      let cardHit=0;
      $$('.row',c).forEach(r=>{const hit=r.textContent.toLowerCase().includes(q);r.classList.toggle('nomatch',!hit);if(hit)cardHit++});
      const shortcuts=$('.shortcuts',c);
      if(shortcuts){const hit=c.textContent.toLowerCase().includes(q);shortcuts.classList.toggle('nomatch',!hit);if(hit)cardHit++}
      c.classList.toggle('nomatch',!cardHit);pageHit+=cardHit;
    });
    p.classList.toggle('nomatch',!pageHit);
  });
}
let ssT;$('#settings-search').addEventListener('input',e=>{clearTimeout(ssT);const v=e.target.value;ssT=setTimeout(()=>searchSettings(v),90)});
$('#settings-search').addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.target.value='';searchSettings('')}});

/* panels */
function openPanel(id){const p=$('#'+id);p.classList.remove('closing');p.classList.add('show');$('#start').classList.remove('show')}
/* Run `done` when the closing animation finishes.
   animationend alone is not enough: Performance mode kills animations
   outright (so it never fires), a background tab can stall them, and the
   event bubbles from children like chat bubbles and roster pills. This
   fires exactly once, ignores children, and falls back to a timer. */
function onCloseDone(el,done){
  let fired=false;
  const finish=()=>{
    if(fired)return;
    fired=true;
    el.removeEventListener('animationend',onEnd);
    clearTimeout(timer);
    done();
  };
  const onEnd=e=>{if(e.target===el)finish()};
  el.addEventListener('animationend',onEnd);
  const timer=setTimeout(finish,500);
  // no animation to wait for - don't leave the element stuck open
  let anim='';
  try{anim=getComputedStyle(el).animationName}catch(_){}
  if(!anim||anim==='none')finish();
}
function closePanel(id){const p=$('#'+id);if(!p.classList.contains('show'))return;p.classList.add('closing');onCloseDone(p,()=>p.classList.remove('show','closing'))}
document.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b){click();closePanel(b.dataset.close)}});
function closeAllPanels(){['links-panel','games-panel','settings-panel','history-panel','admin-panel'].forEach(closePanel);$('#start').classList.remove('show')}

/* app launcher (delegated) */
const APPS={
  browser:()=>openBrowser(),games:()=>openGames(),links:()=>openLinks(),chat:()=>toggleChat(),settings:()=>openSettings(),cloud:()=>toggleCloud(),remote:()=>toggleRemote(),
  vm1:()=>launchE2BVM(),vm2:()=>launchGPUVM(),vm:()=>(S.defaultVM==='gpu'?launchGPUVM():launchE2BVM()),
  admin:()=>openAdmin(),music:()=>window.music?.toggle(),ai:()=>window.ai?.toggle()
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-app]');if(!b)return;click();const fn=APPS[b.dataset.app];if(fn)fn()});
$$('.tile').forEach(t=>t.addEventListener('pointermove',e=>{const r=t.getBoundingClientRect();t.style.setProperty('--mx',(e.clientX-r.left)+'px');t.style.setProperty('--my',(e.clientY-r.top)+'px')}));

/* taskbar auto-hide */
let tbT;const tb=$('#taskbar');
const showTb=()=>{clearTimeout(tbT);tb.classList.add('visible')},hideTb=()=>{tbT=setTimeout(()=>tb.classList.remove('visible'),400)};
$('#tb-zone').addEventListener('mouseenter',showTb);tb.addEventListener('mouseenter',showTb);tb.addEventListener('mouseleave',hideTb);

/* start menu */
const START_APPS=[['browser','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>','Browser','c1'],['games','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.6L2 16a2.5 2.5 0 0 0 4.5 1.5L8 15h8l1.5 2.5A2.5 2.5 0 0 0 22 16l-.7-7.4A4 4 0 0 0 17.32 5z"/></svg>','Games','c2'],['vm1','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10H4z"/><path d="M2 19h20"/></svg>','VM #1','c7'],['vm2','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>','VM #2','c3'],['links','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>','Links','c4'],['remote','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="12" cy="10" r="2.4"/></svg>','Remote PC','c7'],['cloud','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>','Cloud','c3'],['music','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>','Music','c8'],['ai','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>','AI','c9'],['chat','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>','Server','c6'],['settings','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>','Settings','c5'],['admin','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>','Admin','c7']];
function renderStart(q=''){
  q=q.toLowerCase().trim();const g=$('#start-grid');
  let html=START_APPS.filter(a=>(a[0]!=='admin'||currentRole==='owner')&&(!q||a[2].toLowerCase().includes(q))).map(a=>`<button class="dicon" data-app="${a[0]}"><div class="ic ${a[3]}">${a[1]}</div><span>${a[2]}</span></button>`).join('');
  if(q)html+=GAMES.filter(g=>g.name.toLowerCase().includes(q)).slice(0,8).map(g=>`<button class="dicon" data-game="${esc(g.name)}"><div class="ic" style="background:#1c2030 url('${esc(g.img)}') center/cover"></div><span>${esc(g.name)}</span></button>`).join('');
  g.innerHTML=html||'<div class="empty" style="grid-column:1/-1;padding:20px">No results</div>';
}
function toggleStart(){const s=$('#start');if(s.classList.contains('show')){s.classList.remove('show');return}renderStart('');$('#start-search').value='';s.classList.add('show');$('#tb-user');setTimeout(()=>$('#start-search').focus(),50)}
$('#tb-start').onclick=()=>{click();toggleStart()};
$('#tb-home').onclick=()=>{click();showLauncher()};
$('#start-search').addEventListener('input',e=>renderStart(e.target.value));
$('#start-search').addEventListener('keydown',e=>{if(e.key==='Enter'){const f=$('#start-grid button');if(f){f.click();$('#start').classList.remove('show')}}});
$('#start-grid').addEventListener('click',e=>{const b=e.target.closest('[data-game]');if(b){const g=GAMES.find(x=>x.name===b.dataset.game);if(g)launchGame(g)}$('#start').classList.remove('show')});
$('#start-logout').onclick=logoutUser;
document.addEventListener('pointerdown',e=>{const s=$('#start');if(s.classList.contains('show')&&!e.target.closest('#start')&&!e.target.closest('#tb-start'))s.classList.remove('show')});

/* ═══════════════════════════════════════════════════════════
   WINDOW MANAGEMENT (main launcher + chat)
   ═══════════════════════════════════════════════════════════ */
const mainWin=$('#main-window');let winMin=false,winMax=false;
function makeDraggable(win,handle,opts={}){
  let drag=false,sx,sy,ol,ot;
  const rect=()=>(opts.bounds?$(opts.bounds):document.body).getBoundingClientRect();
  function start(x,y){if(opts.canDrag&&!opts.canDrag())return;drag=true;const r=win.getBoundingClientRect(),b=rect();win.style.left=(r.left-b.left)+'px';win.style.top=(r.top-b.top)+'px';win.style.right='auto';win.style.bottom='auto';win.style.transform='none';sx=x;sy=y;ol=parseFloat(win.style.left);ot=parseFloat(win.style.top);win.classList.add('dragging')}
  function move(x,y){if(!drag)return;const b=rect(),w=win.offsetWidth,h=win.offsetHeight;win.style.left=Math.max(-w+80,Math.min(b.width-80,ol+x-sx))+'px';win.style.top=Math.max(0,Math.min(b.height-40,ot+y-sy))+'px'}
  function end(){drag=false;win.classList.remove('dragging')}
  handle.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();start(e.clientX,e.clientY);handle.setPointerCapture(e.pointerId)});
  handle.addEventListener('pointermove',e=>move(e.clientX,e.clientY));
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
}
makeDraggable(mainWin,$('#win-drag-handle'),{bounds:'#desktop',canDrag:()=>!winMax});
/* the community app is fullscreen, so there is nothing to drag */

/* ═══════════════════════════════════════════════════════════
   REMOTE PC
   A small agent on your PC streams its screen through the /remote/
   relay and injects the mouse/keyboard we send back. Frames are
   adaptive JPEG drawn to a canvas; input is normalized 0..10000 of
   the primary screen so it survives any scaling.
   ═══════════════════════════════════════════════════════════ */
let rmWS=null,rmMeta=null,rmActive=false,rmRetry=0,rmRetryT=null,rmPc=null,rmAgents=[],rmFailedOpens=0;
let rmDecoding=false,rmPending=null,rmRect={x:0,y:0,w:0,h:0};
let rmFrames=0,rmFps=0,rmLat=0,rmPingT=null,rmStatT=null,rmLastMove=0;
const rmKeyLS='remoteKey',rmPcLS='remotePc';

/* physical-key -> Windows virtual-key code (US layout; the OS composes
   characters, and modifiers are forwarded as their own keys, so shift +
   symbols and shortcuts all work like a real keyboard) */
const RVK={Backspace:8,Tab:9,Enter:13,ShiftLeft:16,ShiftRight:16,ControlLeft:17,ControlRight:17,
AltLeft:18,AltRight:18,Pause:19,CapsLock:20,Escape:27,Space:32,PageUp:33,PageDown:34,End:35,Home:36,
ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,PrintScreen:44,Insert:45,Delete:46,
MetaLeft:91,MetaRight:92,ContextMenu:93,
Digit0:48,Digit1:49,Digit2:50,Digit3:51,Digit4:52,Digit5:53,Digit6:54,Digit7:55,Digit8:56,Digit9:57,
Numpad0:96,Numpad1:97,Numpad2:98,Numpad3:99,Numpad4:100,Numpad5:101,Numpad6:102,Numpad7:103,Numpad8:104,
Numpad9:105,NumpadMultiply:106,NumpadAdd:107,NumpadEnter:13,NumpadSubtract:109,NumpadDecimal:110,NumpadDivide:111,
F1:112,F2:113,F3:114,F4:115,F5:116,F6:117,F7:118,F8:119,F9:120,F10:121,F11:122,F12:123,
NumLock:144,ScrollLock:145,Semicolon:186,Equal:187,Comma:188,Minus:189,Period:190,Slash:191,
Backquote:192,BracketLeft:219,Backslash:220,BracketRight:221,Quote:222};
for(let i=0;i<26;i++)RVK['Key'+String.fromCharCode(65+i)]=65+i;

function rmSend(o){if(rmWS&&rmWS.readyState===1)rmWS.send(JSON.stringify(o))}
function rmState(v){$('#remote-wrap').dataset.state=v}

function openRemote(){
  const w=$('#remote-wrap');
  closeAllPanels();$('#start').classList.remove('show');
  $('#vm-wrap').style.display='none';$('#browser-wrap').style.display='none';$('#cloud-wrap').style.display='none';
  w.style.display='flex';w.classList.remove('closing');
  $('#tb-remote').classList.add('active');
  const saved=(()=>{try{return localStorage.getItem(rmKeyLS)||''}catch(_){return''}})();
  $('#remote-key').value=saved;
  if(saved&&(!rmWS||rmWS.readyState>1))rmConnect(saved);
  else if(!rmWS)rmState('off');
  setTimeout(()=>$((saved?'#remote-canvas':'#remote-key')).focus(),80);
}
function closeRemote(){
  const w=$('#remote-wrap');
  if(w.style.display==='none'||!w.style.display)return;
  w.classList.add('closing');
  onCloseDone(w,()=>{w.style.display='none';w.classList.remove('closing')});
  $('#tb-remote').classList.remove('active');
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
}
function toggleRemote(){const w=$('#remote-wrap');if(w.style.display==='flex')closeRemote();else openRemote()}
function remoteVisible(){return $('#remote-wrap').style.display==='flex'}

function rmHint(text){const h=$('#remote-hint');h.textContent=text;h.classList.toggle('err',!!text);if(text)window.motion?.shake($('#remote-overlay .rc-card'))}
function rmConnect(key){
  clearTimeout(rmRetryT);
  try{if(rmWS)rmWS.close()}catch(_){}
  if(currentRole!=='owner'){rmState('off');rmHint('Sign in as the owner account to use Remote PC.');return}
  rmState('wait');
  $('#remote-stat').textContent='Connecting…';
  rmHint('');
  let ws,opened=false;
  // the key is not in the URL (logs keep URLs); it is the first message instead
  try{ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/remote/?role=viewer')}
  catch(_){rmState('off');return}
  ws.binaryType='arraybuffer';
  rmWS=ws;

  ws.onopen=()=>{
    opened=true;rmRetry=0;rmFailedOpens=0;
    let pc=null;try{pc=localStorage.getItem(rmPcLS)}catch(_){}
    ws.send(JSON.stringify({t:'auth',key,pc}));
    $('#remote-stat').textContent='Checking key…';
    clearInterval(rmPingT);rmPingT=setInterval(()=>rmSend({t:'ping',ts:performance.now()}),2000);
    clearInterval(rmStatT);rmStatT=setInterval(rmUpdateStat,1000);
  };
  ws.onmessage=(e)=>{
    if(typeof e.data!=='string'){
      // "WVF1" file chunks and "WVA1" sound go to remote-extra.js; anything else is a JPEG frame
      const b=e.data.byteLength>=4?new Uint8Array(e.data,0,4):null;
      if(b&&b[0]===0x57&&b[1]===0x56&&(b[2]===0x46||b[2]===0x41)&&b[3]===0x31){window.rmx?.onBinary(e.data);return}
      rmFrame(e.data);return;
    }
    let m;try{m=JSON.parse(e.data)}catch(_){return}
    switch(m.t){
      case 'authed':$('#remote-stat').textContent='Waiting for a PC…';break;
      case 'agents':rmAgents=m.list||[];rmRenderPcs();break;
      case 'up':
        rmPc=m.name;rmState('on');rmActive=true;rmRenderPcs();rmSendSettings();window.rmx?.onUp(m.name);
        try{localStorage.setItem(rmPcLS,m.name)}catch(_){}
        $('#remote-canvas').focus();break;
      case 'down':
        rmActive=false;rmState('wait');rmMeta=null;rmRenderMonitors();window.rmx?.onDown();
        $('#remote-stat').textContent=m.name?`${m.name} is offline`:rmAgents.length?'Pick a PC':'No PCs online. Run the agent on one.';
        break;
      case 'meta':rmMeta=m;rmRenderMonitors();break;
      case 'pong':rmLat=Math.round(performance.now()-m.ts);break;
      case 'clip':rmGotClipboard(m.text||'');break;
      case 'clip.ok':toast('Sent to the PC clipboard','ok');window.motion?.pop($('#remote-clip-send'));break;
      case 'clip.err':toast('PC clipboard failed: '+(m.error||'unknown'),'err');break;
      default:window.rmx?.onJSON(m);
    }
  };
  ws.onclose=(ev)=>{
    clearInterval(rmPingT);clearInterval(rmStatT);rmActive=false;window.rmx?.onDown();
    if(ev.code===4001){
      rmState('off');
      rmHint('Wrong key. Too many wrong keys locks this network out for 15 minutes.');
      try{localStorage.removeItem(rmKeyLS)}catch(_){}
      return;
    }
    // refused before opening (not owner, feature off, locked out): stop after a few tries
    if(!opened&&++rmFailedOpens>=3){rmState('off');rmHint('Could not reach Remote PC. It may be off on the server, or locked after wrong keys.');return}
    if(!remoteVisible()){rmState('off');return}
    rmState('wait');$('#remote-stat').textContent='Reconnecting…';
    rmRetry++;rmRetryT=setTimeout(()=>rmConnect(key),Math.min(1000*Math.pow(1.5,rmRetry),12000));
  };
  ws.onerror=()=>{};
}

/* PC + monitor pickers ---------------------------------------------- */
function rmRenderPcs(){
  const sel=$('#remote-pc');
  const opts=rmAgents.length?rmAgents.map(a=>{const o=document.createElement('option');o.value=a.name;o.textContent=a.name+(a.meta?` · ${a.meta.w}×${a.meta.h}`:'');return o})
    :[Object.assign(document.createElement('option'),{value:'',textContent:'No PCs online'})];
  if(rmAgents.length&&!rmPc){const o=document.createElement('option');o.value='';o.textContent='Pick a PC…';opts.unshift(o)}
  sel.replaceChildren(...opts);
  sel.value=rmPc&&rmAgents.some(a=>a.name===rmPc)?rmPc:'';
  sel.disabled=!rmAgents.length;
  if(!rmActive&&!rmPc)$('#remote-stat').textContent=rmAgents.length?`${rmAgents.length} PC${rmAgents.length>1?'s':''} online · pick one`:'No PCs online. Run the agent on one.';
}
$('#remote-pc').onchange=e=>{
  const name=e.target.value;if(!name)return;
  rmPc=name;rmMeta=null;rmRenderMonitors();window.rmx?.onDown();
  rmSend({t:'select',name});
  const cv=$('#remote-canvas');cv.getContext('2d').clearRect(0,0,cv.width,cv.height);
  window.motion?.pop($('#remote-pc-wrap'));
};
function rmRenderMonitors(){
  const wrap=$('#remote-mon-wrap'),sel=$('#remote-mon'),mons=rmMeta&&rmMeta.monitors||[];
  wrap.hidden=mons.length<2;
  if(mons.length<2)return;
  sel.replaceChildren(...mons.map((mn,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${i+1}${mn.primary?' (main)':''} · ${mn.w}×${mn.h}`;return o}));
  sel.value=String(rmMeta.monitor||0);
}
$('#remote-mon').onchange=e=>{rmSend({t:'set',monitor:+e.target.value});window.motion?.pop($('#remote-mon-wrap'))};

/* clipboard ----------------------------------------------------------- */
$('#remote-clip-send').onclick=async()=>{
  if(!rmActive)return toast('Connect to a PC first.','err');
  let text=null;
  try{text=await navigator.clipboard.readText()}catch(_){}
  if(text!=null){
    if(!text)return toast('Your clipboard is empty.','err');
    rmSend({t:'clip.set',text:text.slice(0,256*1024)});return;
  }
  // no permission to read it: let them paste by hand
  dcModal({title:'Paste to PC',sub:"Your browser didn't share its clipboard. Paste here (Ctrl+V) and send.",okLabel:'Send to PC',
    fields:[{key:'text',label:'Text',type:'textarea',rows:6}],
    onOk:v=>{if(!v.text)throw new Error('Nothing to send.');rmSend({t:'clip.set',text:v.text.slice(0,256*1024)})}});
};
$('#remote-clip-get').onclick=()=>{
  if(!rmActive)return toast('Connect to a PC first.','err');
  rmSend({t:'clip.get'});
};
async function rmGotClipboard(text){
  if(!text)return toast("The PC's clipboard is empty (or not text).");
  try{await navigator.clipboard.writeText(text);toast('Copied from the PC','ok');window.motion?.pop($('#remote-clip-get'));return}catch(_){}
  dcModal({title:'Copied from PC',sub:"Your browser blocked clipboard access. Select it and press Ctrl+C.",okLabel:'Done',
    fields:[{key:'text',label:'PC clipboard',type:'textarea',rows:8,value:text,readonly:true}],onOk:()=>{}});
}
$('#remote-connect').onclick=()=>{
  const k=$('#remote-key').value.trim();
  if(!k){$('#remote-hint').textContent='Enter your key.';return}
  try{localStorage.setItem(rmKeyLS,k)}catch(_){}
  rmConnect(k);
};
$('#remote-key').addEventListener('keydown',e=>{if(e.key==='Enter')$('#remote-connect').click()});
$('#remote-close').onclick=closeRemote;
$('#remote-fs').onclick=()=>{
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  else $('#remote-wrap').requestFullscreen().catch(()=>{});
};

function rmSendSettings(){
  if(!rmActive)return;
  rmSend({t:'set',quality:+$('#remote-quality').value,scale:+$('#remote-scale').value,fps:15});
}
$('#remote-quality').onchange=rmSendSettings;
$('#remote-scale').onchange=rmSendSettings;

/* draw incoming frames, always keeping only the newest if we fall behind */
function rmFrame(buf){
  if(rmDecoding){rmPending=buf;return}
  rmDecoding=true;
  createImageBitmap(new Blob([buf],{type:'image/jpeg'})).then(bmp=>{
    rmDraw(bmp);try{bmp.close()}catch(_){}
    rmFrames++;rmDecoding=false;
    if(rmPending){const p=rmPending;rmPending=null;rmFrame(p)}
  }).catch(()=>{rmDecoding=false});
}
function rmDraw(bmp){
  const cv=$('#remote-canvas'),stage=$('#remote-stage');
  const cw=stage.clientWidth||1,ch=stage.clientHeight||1;
  if(cv.width!==cw||cv.height!==ch){cv.width=cw;cv.height=ch}
  const g=cv.getContext('2d',{alpha:false});
  g.fillStyle='#05070c';g.fillRect(0,0,cw,ch);
  const ar=bmp.width/bmp.height,car=cw/ch;
  let dw,dh;
  if(ar>car){dw=cw;dh=cw/ar}else{dh=ch;dw=ch*ar}
  const dx=(cw-dw)/2,dy=(ch-dh)/2;
  g.drawImage(bmp,dx,dy,dw,dh);
  rmRect={x:dx,y:dy,w:dw,h:dh};
}
function rmUpdateStat(){
  rmFps=rmFrames;rmFrames=0;
  if(!rmActive)return;
  const dims=rmMeta?rmMeta.w+'×'+rmMeta.h:'';
  $('#remote-stat').textContent=[rmPc,dims,rmFps+' fps',rmLat+' ms'].filter(Boolean).join('  ·  ');
}

/* pointer -> normalized screen coords */
function rmPos(e){
  const cv=$('#remote-canvas'),r=cv.getBoundingClientRect();
  const bx=(e.clientX-r.left)*(cv.width/r.width);
  const by=(e.clientY-r.top)*(cv.height/r.height);
  if(rmRect.w<1||rmRect.h<1)return null;
  const nx=Math.max(0,Math.min(1,(bx-rmRect.x)/rmRect.w));
  const ny=Math.max(0,Math.min(1,(by-rmRect.y)/rmRect.h));
  return{x:Math.round(nx*10000),y:Math.round(ny*10000)};
}
(function rmBindPointer(){
  const cv=$('#remote-canvas');
  cv.addEventListener('pointermove',e=>{
    if(!rmActive)return;
    const now=performance.now();if(now-rmLastMove<16)return;rmLastMove=now;
    const p=rmPos(e);if(p)rmSend({t:'m',x:p.x,y:p.y});
  });
  cv.addEventListener('pointerdown',e=>{
    if(!rmActive)return;cv.focus();e.preventDefault();
    const p=rmPos(e);if(p)rmSend({t:'m',x:p.x,y:p.y});
    rmSend({t:'d',b:e.button});
  });
  window.addEventListener('pointerup',e=>{if(rmActive&&remoteVisible())rmSend({t:'u',b:e.button})});
  cv.addEventListener('contextmenu',e=>{if(rmActive)e.preventDefault()});
  cv.addEventListener('wheel',e=>{
    if(!rmActive)return;e.preventDefault();
    rmSend({t:'w',d:Math.max(-360,Math.min(360,Math.round(-e.deltaY)))});
  },{passive:false});
})();

/* keyboard: only while the remote window is the focused app */
function rmKeysActive(){
  if(!rmActive||!remoteVisible())return false;
  const a=document.activeElement;
  if(a&&a.closest&&a.closest('#rm-files'))return false; // typing a path, not driving the PC
  return a===$('#remote-canvas')||$('#remote-wrap').contains(a);
}
window.addEventListener('keydown',e=>{
  if(!rmKeysActive())return;
  const vk=RVK[e.code];if(vk==null)return;
  e.preventDefault();rmSend({t:'k',down:true,vk});
},true);
window.addEventListener('keyup',e=>{
  if(!rmKeysActive())return;
  const vk=RVK[e.code];if(vk==null)return;
  e.preventDefault();rmSend({t:'k',down:false,vk});
},true);


/* ═══════════════════════════════════════════════════════════
   CLOUD GAMING
   The client is served from our own origin at /cloud/app, so it is a
   same-origin frame and inherits COEP from the server. That is what lets
   it run inside the desktop: a cross-origin frame can never load in an
   isolated document, but a same-origin one carrying COEP can.
   ═══════════════════════════════════════════════════════════ */
let cloudGames=[],cloudCats=[],cloudCat='all',cloudQuery='';

function openCloud(){
  const w=$('#cloud-wrap');
  closeAllPanels();
  $('#start').classList.remove('show');
  $('#vm-wrap').style.display='none';
  $('#browser-wrap').style.display='none';
  w.style.display='flex';
  w.classList.remove('closing');
  $('#tb-cloud').classList.add('active');
  if(!cloudGames.length)loadCloudGames();
  cmLoadStats();
}

/* catalogue ------------------------------------------------- */
async function loadCloudGames(){
  const grid=$('#cloud-grid');
  grid.innerHTML='<div class="cg-skel"></div>'.repeat(12);
  try{
    const r=await fetch('/api/cloud/games');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    cloudGames=d.games||[];
    if(d.client)cmClient=d.client;
    cloudCats=d.categories||[];
    renderCloudCats();
    renderCloudGames();
  }catch(e){
    grid.innerHTML='';
    const el=document.createElement('div');
    el.className='cg-empty';
    el.textContent='Could not load the cloud games list. '+e.message;
    grid.appendChild(el);
  }
}

function renderCloudCats(){
  const box=$('#cloud-cats'),frag=document.createDocumentFragment();
  const mk=(key,label)=>{
    const b=document.createElement('button');
    b.className='cg-chip'+(cloudCat===key?' active':'');
    b.textContent=label;
    b.onclick=()=>{click();cloudCat=key;renderCloudCats();renderCloudGames()};
    return b;
  };
  frag.appendChild(mk('all','All'));
  cloudCats.forEach(c=>frag.appendChild(mk(c.key,c.name)));
  box.replaceChildren(frag);
}

function renderCloudGames(){
  const grid=$('#cloud-grid'),q=cloudQuery.trim().toLowerCase();
  const list=cloudGames.filter(g=>{
    if(cloudCat!=='all'&&!(g.cats||[]).includes(cloudCat))return false;
    if(q&&!g.name.toLowerCase().includes(q))return false;
    return true;
  });
  $('#cloud-count').textContent=list.length+' of '+cloudGames.length+' games';

  if(!list.length){
    const el=document.createElement('div');
    el.className='cg-empty';
    el.textContent=q?`Nothing matches “${cloudQuery}”`:'No games in this category.';
    grid.replaceChildren(el);
    return;
  }

  const frag=document.createDocumentFragment();
  list.forEach(g=>{
    const card=document.createElement('button');
    card.className='cg-card';
    card.title=g.name;

    const art=document.createElement('div');
    art.className='cg-art';
    const img=document.createElement('img');
    img.loading='lazy';img.alt='';img.src=g.icon;
    img.onerror=()=>{img.style.visibility='hidden'};
    art.appendChild(img);

    if(g.vip||g.beta){
      const tag=document.createElement('span');
      tag.className='cg-tag'+(g.vip?' vip':'');
      tag.textContent=g.vip?'VIP':'Beta';
      art.appendChild(tag);
    }

    const play=document.createElement('div');
    play.className='cg-play';
    play.innerHTML='<span><svg class="i i-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 9-14 9V3z"/></svg>Play</span>';
    art.appendChild(play);
    card.appendChild(art);

    const meta=document.createElement('div');
    meta.className='cg-meta';
    const b=document.createElement('b');b.textContent=g.name;
    const sm=document.createElement('small');
    sm.textContent=(g.cats&&g.cats.length?g.cats[0]:'cloud').replace(/_/g,' ');
    meta.append(b,sm);
    card.appendChild(meta);

    card.onclick=()=>{click();playCloudGame(g)};
    frag.appendChild(card);
  });
  grid.replaceChildren(frag);
}

/* CloudMoon account ------------------------------------------
   Sign-in happens here, straight against CloudMoon's API from this browser,
   so the password never touches our server. The token is saved under
   CloudMoon's own key (cm_auth_token): their play page, loaded from our
   origin through the CDN launcher, reads it from the same localStorage. */
const CM_APIS=['https://api.cloudmoon.cloudbatata.com','https://api.prod.cloudmoonapp.com','https://api.prod.geometry.today'];
const CM_BACKUP=['https://hrz5zfjq02.execute-api.us-east-1.amazonaws.com','https://api.prod.viewoncloud.com'];
let cmHost=null,cmHostP=null,cmStats=null,cmStatsAt=0,cmCurrent=null,cmLaunchSeq=0,cmActivePkg=null;
let cmClient={version:'260521',play:'/cloud/app/play-260521.svg',portal:'https://cdn.jsdelivr.net/gh/CloudMoonApp/web@main/260521.svg'};
const lsGet=k=>{try{return localStorage.getItem(k)}catch(_){return null}};
const lsSet=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(_){}};
const cmToken=()=>lsGet('cm_auth_token');
function cmDevice(){let d=lsGet('cm_device_id');if(!d){d=crypto.randomUUID();lsSet('cm_device_id',d)}return d}
/* same as their client: race a /_ping to each API host, first answer wins */
function cmRace(list){
  const ctl=list.map(()=>new AbortController());
  return new Promise(res=>{
    let fails=0,won=false;
    list.forEach((h,i)=>{
      const t=setTimeout(()=>ctl[i].abort(),4000);
      fetch(h+'/_ping',{signal:ctl[i].signal}).then(r=>{
        clearTimeout(t);if(!r.ok||won)throw 0;
        won=true;ctl.forEach((c,j)=>j!==i&&c.abort());res(h);
      }).catch(()=>{clearTimeout(t);if(++fails===list.length&&!won)res(null)});
    });
  });
}
function cmApiHost(){
  if(cmHost)return Promise.resolve(cmHost);
  return cmHostP||=(async()=>{const h=await cmRace(CM_APIS)||await cmRace(CM_BACKUP);cmHostP=null;if(h)cmHost=h;return h})();
}
async function cmFetch(path,body){
  const unreachable=m=>Object.assign(new Error(m),{unreachable:true});
  const host=await cmApiHost();
  if(!host)throw unreachable("Can't reach CloudMoon from here.");
  const u=new URL(host+path);
  for(const [k,v] of [['device_type','web'],['query_uuid',crypto.randomUUID()],['site','cm'],['device_id',cmDevice()]])u.searchParams.set(k,v);
  const lang=(navigator.language||'en').split('-');
  const headers={'Content-Type':'application/json','X-User-Language':lsGet('cm_lang')||lang[0]||'en','X-User-Locale':(lang[1]||lang[0]).toUpperCase()};
  if(cmToken())headers['X-User-Token']=cmToken();
  let r;
  try{r=await fetch(u,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined})}
  catch(_){cmHost=null;throw unreachable("Can't reach CloudMoon right now.")}
  const d=await r.json().catch(()=>({}));
  if(String(d.code)==='40001'){cmForget();throw new Error('Your CloudMoon sign-in expired. Sign in again.')}
  if(!r.ok)throw new Error(d.message||d.msg||`CloudMoon answered ${r.status}`);
  return d;
}
function cmForget(){lsSet('cm_auth_token',null);cmStats=null;cmRenderAccount()}
function cmRenderAccount(){
  const b=$('#cm-acct'),signed=!!cmToken();
  b.classList.toggle('on',signed);
  if(!signed){b.textContent='Sign in to CloudMoon';b.title='Sign in with your CloudMoon email and password';return}
  const who=lsGet('cm_email')||'CloudMoon';
  const bits=[who.split('@')[0]];
  if(cmStats){if(cmStats.level>1)bits.push('VIP '+cmStats.level);if(cmStats.timeLeft)bits.push(cmStats.timeLeft+' left')}
  b.textContent=bits.join(' · ');b.title=`Signed in to CloudMoon as ${who}. Click to sign out.`;
}
async function cmLoadStats(force){
  if(!cmToken()||(!force&&Date.now()-cmStatsAt<60000))return;
  cmStatsAt=Date.now();
  try{
    const d=await cmFetch('/phone/list');
    const list=d.data?.list||[];
    cmStats={level:Math.max(0,...list.map(x=>x.level||0)),timeLeft:list[0]?.time_left||''};
  }catch(_){}
  cmRenderAccount();
}
function cmSignIn(then){
  dcModal({title:'Sign in to CloudMoon',okLabel:'Sign in',
    sub:"Use your CloudMoon email and password. Signed up with Google? Set a password once: sign in at web.cloudmoonapp.com, click your avatar, pick a password. From then on you sign in right here.",
    fields:[{key:'email',label:'Email',type:'email',value:lsGet('cm_email')||'',placeholder:'you@example.com'},
            {key:'password',label:'Password',type:'password'}],
    onOk:async v=>{
      const email=v.email.trim();
      if(!email||!v.password)throw new Error('Enter your email and password.');
      let d;
      try{d=await cmFetch('/login/pwd',{email,password:v.password})}
      catch(e){if(e.unreachable){dcCloseModal();cmOpenPortal("Signing in from here didn't work on this network, so here's CloudMoon's own page. Sign in there.");return}throw e}
      if(d.code!==0||!d.data?.token)throw new Error(d.message||d.msg||'Wrong email or password.');
      lsSet('cm_auth_token',d.data.token);lsSet('cm_email',email);
      cmRenderAccount();cmLoadStats(true);
      toast('Signed in to CloudMoon','ok');
      if(then)setTimeout(then,50);
    }});
}
$('#cm-acct').onclick=()=>{
  click();
  if(!cmToken())return cmSignIn();
  if(!confirm(`Sign out of CloudMoon (${lsGet('cm_email')||'this account'})?`))return;
  cloudBrowse();cmForget();toast('Signed out of CloudMoon');
};
$('#cm-server').value=lsGet('selectedServer')||'23';
$('#cm-server').onchange=e=>{lsSet('selectedServer',e.target.value);toast('Server: '+e.target.selectedOptions[0].textContent)};
cmRenderAccount();

/* playing ---------------------------------------------------
   Clicking a game does what CloudMoon's own portal does: claim a cloud
   phone (/phone/list, /phone/connect), waiting in their queue if they're
   busy, then hand the session to their play page. That page comes from the
   CDN through CloudMoon's play launcher (play-<version>.svg), re-served from
   our origin so it can read the hand-off: cm_launch_data in localStorage,
   which it only accepts for 20 seconds, so we keep it fresh until it's read.
   If CloudMoon's API won't answer this site, the CloudMoon site button (and
   the automatic fallback) loads their CDN portal as-is. */
const cmSleep=ms=>new Promise(r=>setTimeout(r,ms));
function cmLoading(text,cancel){
  const w=$('#cloud-wrap');
  w.classList.toggle('loading',!!text);
  $('#cloud-load-text').textContent=text||'';
  $('#cloud-load-cancel').hidden=!cancel;
}
async function playCloudGame(g){
  if(!cmToken()){cmSignIn(()=>playCloudGame(g));return}
  if(g.minVip>1&&cmStats&&cmStats.level<g.minVip){toast(`${g.name} needs CloudMoon VIP ${g.minVip}.`,'err');return}
  const seq=++cmLaunchSeq;
  await cmEndGame();
  cmCurrent=g;
  const w=$('#cloud-wrap'),f=$('#cloud-frame');
  f.removeAttribute('credentialless');f.src='about:blank';
  w.classList.add('playing');$('#cloud-title').textContent=g.name;
  cmLoading('Finding a cloud phone…',true);
  try{
    const list=await cmFetch('/phone/list');
    const phone=list.data?.list?.[0];
    if(list.code!==0||!phone)throw new Error(list.message||"CloudMoon has no phone for your account right now.");
    if(!phone.time_left||phone.time_left==='0h 0m')throw new Error("You're out of CloudMoon time for now.");
    for(;;){
      if(seq!==cmLaunchSeq)return;
      const d=await cmFetch('/phone/connect',{android_id:phone.android_id,game_name:g.pkg,screen_res:'720x1280',
        server_id:parseInt(lsGet('selectedServer')||'23'),params:JSON.stringify({language:'en',locale:'us'}),ad_unblock:false});
      if(seq!==cmLaunchSeq)return;
      if(d.code!==0||!d.data)throw new Error(d.message||d.msg||`CloudMoon couldn't start ${g.name}.`);
      cmActivePkg=g.pkg;
      if(d.data.android_instance_id)return cmLaunch(d.data.sid,seq);
      cmLoading(`In CloudMoon's queue: #${d.data.position??'?'}${d.data.waiting_time?` · about ${Math.ceil(d.data.waiting_time/60)} min`:''}`,true);
      await cmSleep(5000);
    }
  }catch(e){
    if(seq!==cmLaunchSeq)return;
    if(e.unreachable){cmOpenPortal("CloudMoon's API didn't answer this site, so here's CloudMoon's own page from the CDN.");return}
    toast(e.message,'err');cloudBrowse();
  }
}
function cmLaunch(sid,seq){
  const hand=()=>lsSet('cm_launch_data',JSON.stringify({sid,quality:'SD',timestamp:Date.now()}));
  hand();
  // keep the hand-off fresh until their page has read it (it removes the key)
  const keep=setInterval(()=>{if(seq!==cmLaunchSeq||!lsGet('cm_launch_data'))return clearInterval(keep);hand()},5000);
  setTimeout(()=>clearInterval(keep),90000);
  cmLoading('Starting the stream…');
  const f=$('#cloud-frame');
  f.onload=()=>{if(seq===cmLaunchSeq)cmLoading('')};
  f.src=cmClient.play;
  cmLoadStats(true);
}
/* CloudMoon's own page, straight from the CDN (the link as they publish it).
   It's another origin, so it needs a credentialless frame to sit inside
   this page; sign-ins there last until this tab closes. */
function cmOpenPortal(msg){
  cmLaunchSeq++;
  if(!('credentialless' in HTMLIFrameElement.prototype)){
    window.open(cmClient.portal,'_blank','noopener');
    toast('Opened CloudMoon in a new tab. This browser can\'t show it inside the desktop.');
    return;
  }
  const w=$('#cloud-wrap'),f=$('#cloud-frame');
  cmCurrent=null;cmLoading('');
  w.classList.add('playing');$('#cloud-title').textContent='CloudMoon';
  f.onload=null;f.setAttribute('credentialless','');f.src=cmClient.portal;
  if(msg)toast(msg);
}
$('#cm-site').onclick=()=>{click();cmEndGame().then(()=>cmOpenPortal())};
$('#cloud-load-cancel').onclick=()=>{click();cloudBrowse()};
/* their play page goes to ./main.svg when a game ends; that page tells us */
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.data?.cm!=='ended')return;
  cmActivePkg=null;toast('Game ended');cloudBrowse();
});
/* leaving a game ends it: a hidden stream would keep eating CloudMoon time */
async function cmEndGame(){
  const pkg=cmActivePkg;cmActivePkg=null;
  const f=$('#cloud-frame');
  if(f.getAttribute('src')&&f.getAttribute('src')!=='about:blank'){f.onload=null;f.src='about:blank'}
  if(!pkg)return false;
  try{await cmFetch('/phone/disconnect',{game_name:pkg})}catch(_){}
  return true;
}

function cloudBrowse(){
  cmLaunchSeq++;
  const was=cmActivePkg;
  cmEndGame().then(ended=>{if(ended&&was)toast('Game ended')});
  cmLoading('');
  $('#cloud-wrap').classList.remove('playing');
  $('#cloud-title').textContent='Cloud gaming';
}
$('#cloud-back').onclick=()=>{click();cloudBrowse()};
$('#cloud-search').addEventListener('input',e=>{cloudQuery=e.target.value;renderCloudGames()});
function closeCloud(){
  const w=$('#cloud-wrap');
  if(w.style.display==='none'||!w.style.display)return;
  cloudBrowse();
  w.classList.add('closing');
  onCloseDone(w,()=>{w.style.display='none';w.classList.remove('closing','loading')});
  $('#tb-cloud').classList.remove('active');
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
}
function toggleCloud(){
  const w=$('#cloud-wrap');
  if(w.style.display==='flex')closeCloud();else openCloud();
}
$('#cloud-close').onclick=closeCloud;
$('#cloud-reload').onclick=async()=>{
  const w=$('#cloud-wrap');
  if(!w.classList.contains('playing')){cloudGames=[];loadCloudGames();return}
  if(cmCurrent)playCloudGame(cmCurrent);
  else cmOpenPortal();
};
$('#cloud-fs').onclick=()=>{
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  else $('#cloud-wrap').requestFullscreen().catch(()=>{});
};
function showLauncher(){mainWin.style.display='flex';mainWin.classList.remove('closing');winMin=false;$('#tb-home').classList.add('active')}
function hideLauncher(){mainWin.classList.add('closing');onCloseDone(mainWin,()=>{mainWin.style.display='none';mainWin.classList.remove('closing')});$('#tb-home').classList.remove('active')}
$('#btn-close').onclick=()=>{click();hideLauncher()};
$('#btn-minimize').onclick=()=>{click();hideLauncher()};
$('#btn-maximize').onclick=()=>{click();winMax=!winMax;const s=mainWin.style;s.transition='all .25s var(--ease)';if(winMax){s.left='0';s.top='0';s.width='100%';s.height='100%';s.transform='none';s.borderRadius='0'}else{s.left='';s.top='';s.width='';s.height='';s.transform='';s.borderRadius=''}setTimeout(()=>s.transition='',260)};

/* ═══════════════════════════════════════════════════════════
   AUTH
   ═══════════════════════════════════════════════════════════ */
let authMode='register',currentUsername='Guest',currentRole='guest',vmLimit=30*60;
function setAuthMode(m){authMode=m;const L=m==='login';$('#auth-title').textContent=L?'Welcome back':'Create your account';$('#auth-submit').textContent=L?'Log in':'Create account';$('#auth-alt-text').textContent=L?'New here?':'Already have an account?';$('#login-button').textContent=L?'Create an account':'Log in';$('#auth-password').autocomplete=L?'current-password':'new-password';$('#auth-error').textContent=''}
function acceptAuth(d,fresh){
  vmLimit=(d.vmMinutes||30)*60;currentUsername=d.username||'Guest';
  currentRole=d.role||(d.account?'member':'guest');
  root.dataset.account=d.account?'on':'off';
  root.dataset.owner=currentRole==='owner'?'on':'off';
  $('#auth-wrap').classList.add('hidden');setUser();connectChat();
  if(d.account)syncStart(currentUsername);
  toast(`Welcome, ${currentUsername}! ${d.vmMinutes||30} min of VM time.`,'ok');
  if(fresh)window.motion?.celebrate();
}
function setUser(){const a=currentUsername[0].toUpperCase();['#tb-avatar','#start-avatar','#acct-avatar'].forEach(s=>$(s).textContent=a);['#tb-username','#start-username','#settings-username'].forEach(s=>$(s).textContent=currentUsername);$('#settings-vmtime').textContent=`${Math.round(vmLimit/60)} min VM time per session`;updateHero()}
async function checkAuth(){try{const r=await fetch('/api/auth/me'),d=await r.json();if(d.loggedIn)acceptAuth(d);return d}catch(_){return null}}
$('#auth-card').addEventListener('submit',async e=>{e.preventDefault();const u=$('#auth-username').value.trim(),p=$('#auth-password').value,btn=$('#auth-submit');btn.disabled=true;try{const r=await fetch(authMode==='login'?'/api/auth/login':'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Authentication failed.');acceptAuth(d,true)}catch(err){$('#auth-error').textContent=err.message;window.motion?.shake($('#auth-card'))}finally{btn.disabled=false}});
$('#guest-button').onclick=async()=>{try{const r=await fetch('/api/auth/guest',{method:'POST'}),d=await r.json();if(!r.ok)throw 0;acceptAuth(d)}catch(_){acceptAuth({username:'Guest',vmMinutes:30})}};
$('#login-button').onclick=()=>setAuthMode(authMode==='login'?'register':'login');
function logoutUser(){fetch('/api/auth/logout',{method:'POST'}).catch(()=>{});location.reload()}
$('#logout-btn').onclick=logoutUser;

/* ═══════════════════════════════════════════════════════════
   SETTINGS SYNC
   Accounts keep settings, bookmarks, favourite games and the music library
   on the server. syncMeta.server is the server copy this device last synced
   with; dirty means something changed here since. When both sides changed,
   the newer one wins.
   ═══════════════════════════════════════════════════════════ */
function syncSaveMeta(){try{localStorage.setItem('wvm.sync',JSON.stringify(syncMeta))}catch(_){}}
function syncTouch(){
  if(syncApplying)return;
  syncMeta.dirty=true;syncMeta.localAt=Date.now();syncSaveMeta();
  if(syncOn&&S.sync){clearTimeout(syncT);syncT=setTimeout(syncPush,2500)}
}
function syncSnapshot(){
  const settings={};
  for(const [k,v] of Object.entries(S)){
    if(SYNC_LOCAL_ONLY.includes(k))continue;
    if(k==='wallpaperUrl'&&String(v).startsWith('data:'))continue; // an uploaded image is too big to sync
    settings[k]=v;
  }
  const data={v:1,settings};
  for(const k of SYNC_KEYS)data[k]=store(k,null);
  return data;
}
function syncApply(data){
  syncApplying=true;
  try{
    if(data.settings&&typeof data.settings==='object'){
      const keep={};SYNC_LOCAL_ONLY.forEach(k=>keep[k]=S[k]);
      if(S.wallpaperUrl.startsWith('data:')&&!data.settings.wallpaperUrl)keep.wallpaperUrl=S.wallpaperUrl;
      S={...DEFAULTS,...data.settings,...keep};
      save();applyAll();syncControls();
    }
    if(Array.isArray(data.bookmarks)){bookmarks=data.bookmarks;put('bookmarks',bookmarks);renderBookmarks()}
    if(Array.isArray(data.favGames)){favGames=data.favGames;put('favGames',favGames)}
    if(data.music&&typeof data.music==='object'){put('music',data.music);window.music?.reload()}
  }finally{syncApplying=false}
}
function syncStatus(text){const el=$('#sync-status');if(el)el.textContent=text}
async function syncPush(){
  if(!syncOn||!S.sync)return;
  clearTimeout(syncT);
  try{
    const d=await postJSON('/api/account/settings',{data:syncSnapshot()},'PUT');
    syncMeta.server=d.updatedAt;syncMeta.dirty=false;syncSaveMeta();
    syncStatus('Synced just now.');
  }catch(e){syncStatus('Not synced: '+e.message)}
}
async function syncPull(){
  if(!syncOn||!S.sync)return;
  syncPulledAt=Date.now();
  let d;
  try{const r=await fetch('/api/account/settings',{cache:'no-store'});if(!r.ok)throw 0;d=await r.json()}
  catch(_){syncStatus("Couldn't reach the server to sync.");return}
  if(!d.data)return syncPush(); // first device on this account, or the server was reset
  if(d.updatedAt===syncMeta.server){if(syncMeta.dirty)syncPush();else syncStatus('Up to date.');return}
  // another device saved since. Keep ours only if we changed after it did.
  if(syncMeta.dirty&&(syncMeta.localAt||0)>d.updatedAt)return syncPush();
  syncApply(d.data);
  syncMeta.server=d.updatedAt;syncMeta.dirty=false;syncSaveMeta();
  syncStatus('Updated from your other devices.');
}
function syncStart(username){
  syncOn=true;
  // a different account on this device: its server copy wins over what's here
  if(syncMeta.user!==username){syncMeta={user:username,server:0,dirty:false};syncSaveMeta()}
  syncPull();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&syncOn&&Date.now()-syncPulledAt>30000)syncPull()});
$('#sync-now').onclick=async()=>{click();syncStatus('Syncing…');await syncPull();if(syncMeta.dirty)await syncPush()};
document.addEventListener('click',e=>{if(e.target.closest('.switch[data-setting="sync"]')&&S.sync&&syncOn)syncPull()});

/* account security ------------------------------------------------ */
$('#pw-btn').onclick=()=>dcModal({
  title:'Change password',sub:'You stay signed in here. Every other device gets signed out.',
  okLabel:'Change password',
  fields:[{key:'password',label:'Current password',type:'password'},
          {key:'newPassword',label:'New password',type:'password',placeholder:'8+ characters',autocomplete:'new-password'},
          {key:'repeat',label:'Repeat new password',type:'password',autocomplete:'new-password'}],
  onOk:async v=>{
    if(v.newPassword.length<8)throw new Error('New password must be at least 8 characters.');
    if(v.newPassword!==v.repeat)throw new Error("The new passwords don't match.");
    await postJSON('/api/account/password',{password:v.password,newPassword:v.newPassword});
    toast('Password changed. Other devices are signed out.','ok');window.motion?.celebrate();
  }
});
$('#signout-others-btn').onclick=async()=>{
  if(!confirm('Sign out every other device using this account?'))return;
  try{await postJSON('/api/account/signout-others');toast('Signed out everywhere else','ok')}
  catch(e){toast(e.message,'err')}
};
$('#delete-acct-btn').onclick=()=>dcModal({
  title:'Delete your account',danger:true,
  sub:'This removes your account, your messages, your DMs and your reactions. It cannot be undone.',
  okLabel:'Delete forever',
  fields:[{key:'confirm',label:`Type your username (${currentUsername}) to confirm`,placeholder:currentUsername},
          {key:'password',label:'Password',type:'password'}],
  onOk:async v=>{
    await postJSON('/api/account/delete',{confirm:v.confirm.trim().toLowerCase(),password:v.password});
    toast('Account deleted. Bye!','ok');setTimeout(()=>location.reload(),1200);
  }
});
$('#guest-upgrade-btn').onclick=()=>{fetch('/api/auth/logout',{method:'POST'}).catch(()=>{}).finally(()=>location.reload())};
async function fetchPlayerCount(){try{const c=new AbortController(),t=setTimeout(()=>c.abort(),5000),r=await fetch('/api/stats',{signal:c.signal,cache:'no-store'});clearTimeout(t);if(!r.ok)throw 0;const d=await r.json(),n=d.online??d.count??d.players;if(n!=null)$('#player-count-text').textContent=`${n} online`}catch(_){}}

/* ═══════════════════════════════════════════════════════════
   VM
   ═══════════════════════════════════════════════════════════ */
let containerId=null,vmType=null,vmUrl=null,pollI=null,vmTimerI=null,vmStart=null,pollT=null,warned={};
const fmt=s=>{const p=v=>String(v).padStart(2,'0'),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${p(h)}:${p(m)}:${p(x)}`:`${p(m)}:${p(x)}`};
function tickVM(){if(!vmStart)return;const e=Math.floor((Date.now()-vmStart)/1000),left=vmLimit-e,t=$('#vm-timer');if(left<=0){toast('Your VM time has ended.','err');closeVM(true);return}t.textContent=fmt(left)+' left';t.className=left<=60?'crit':left<=300?'low':'';if(S.vmwarn){if(left<=300&&!warned[5]){warned[5]=1;toast('5 minutes of VM time left')}if(left<=60&&!warned[1]){warned[1]=1;toast('1 minute of VM time left','err')}}}
function openVM(url,label){vmUrl=url;const f=$('#vm-frame'),w=$('#vm-wrap');$('#vm-label').textContent=label||'Private VM';f.src='about:blank';w.style.display='flex';w.classList.remove('closing');warned={};vmStart=Date.now();clearInterval(vmTimerI);vmTimerI=setInterval(tickVM,1000);tickVM();setTimeout(()=>f.src=url,50);setStatus('VM connected.');setLaunching(false);toast('VM launched!','ok');$('#tb-vm').classList.add('active');closeAllPanels()}
async function closeVM(force){
  if(!force&&S.vmconfirm&&!confirm('Close the VM? Your session will end.'))return;
  clearInterval(pollI);clearInterval(vmTimerI);vmStart=null;$('#vm-timer').textContent='00:00';$('#vm-timer').className='';
  const w=$('#vm-wrap');w.classList.add('closing');onCloseDone(w,()=>{w.style.display='none';w.classList.remove('closing')});setTimeout(()=>$('#vm-frame').src='about:blank',220);
  const id=containerId,type=vmType;containerId=vmType=vmUrl=null;
  if(id&&type==='gpu')fetch(`/api/vm/${encodeURIComponent(id)}`,{method:'DELETE'}).catch(()=>{});
  if(id&&type==='e2b')fetch(`/api/e2b/${encodeURIComponent(id)}`,{method:'DELETE'}).catch(()=>{});
  setStatus('VM closed.');$('#tb-vm').classList.remove('active');
}
$('#vm-close').onclick=()=>closeVM();
$('#vm-fs').onclick=async()=>{try{if(!document.fullscreenElement)await $('#vm-wrap').requestFullscreen();else await document.exitFullscreen()}catch(e){toast('Fullscreen failed: '+e.message,'err')}};
async function launchE2BVM(){if(containerId){$('#vm-wrap').style.display='flex';return}clearInterval(pollI);setLaunching(true);setStatus('Starting desktop sandbox…',true);try{const r=await fetch('/api/e2b/start',{method:'POST',headers:{'Content-Type':'application/json'}}),d=await r.json();if(!r.ok)throw new Error(d.error||d.message||`HTTP ${r.status}`);if(d.status&&d.status!=='success')throw new Error(d.error||d.message||'Sandbox did not start.');if(!d.sandboxId||!d.url)throw new Error('Sandbox returned no stream URL.');containerId=d.sandboxId;vmType='e2b';openVM(d.url,'VM #1 · Desktop')}catch(e){setStatus('Error: '+e.message);toast('VM #1 failed: '+e.message,'err');containerId=vmType=null;setLaunching(false)}}
async function launchGPUVM(){if(containerId){$('#vm-wrap').style.display='flex';return}clearInterval(pollI);setLaunching(true);setStatus('Requesting GPU instance…',true);try{const r=await fetch('/api/launch?gpu=true'),d=await r.json();if(!r.ok)throw new Error(d.error||d.message||`HTTP ${r.status}`);if(d.status==='success'){containerId=d.container_id;vmType='gpu';openVM(d.url,'VM #2 · GPU');return}if(d.status==='queued'){setStatus(`Queued — position ${d.position??'?'}…`,true);pollQueue(d.token);return}throw new Error(d.error||d.message||'Unexpected response')}catch(e){setStatus('Error: '+e.message);toast('VM #2 failed: '+e.message,'err');setLaunching(false)}}
function pollQueue(token){clearInterval(pollI);if(!token){setLaunching(false);return}pollI=setInterval(async()=>{try{const r=await fetch(`/api/queue?token=${encodeURIComponent(token)}`),d=await r.json().catch(()=>({}));if(!r.ok){if([401,403,404].includes(r.status)){clearInterval(pollI);setStatus('Error: '+(d.error||`HTTP ${r.status}`));toast('VM #2 failed: '+(d.error||`HTTP ${r.status}`),'err');setLaunching(false)}return}if(d.status==='allocated'){clearInterval(pollI);containerId=d.container_id;vmType='gpu';openVM(d.url,'VM #2 · GPU');return}if(d.status==='failed'){clearInterval(pollI);setStatus('Failed: '+(d.reason||'unknown'));toast('Queue failed: '+(d.reason||'unknown'),'err');setLaunching(false);return}setStatus(d.position!==undefined?`Queued — position ${d.position}…`:'Waiting for GPU…',true)}catch(_){}},4000)}

/* ═══════════════════════════════════════════════════════════
   BROWSER (proxy engines)
   Settings > Browser > Proxy engine picks one of four:
     sj2  Scramjet v2 alpha: its own controller + libcurl
     wj   WillieJet, ours (public/wj/), the default (fast mode on): the Scramjet v2
          core with the work in a background worker, a smart cache and a shared rewriter
     sj1  Scramjet v1
     uv   Ultraviolet
   sj1 and uv share one bare-mux connection running the same libcurl over /wisp/
   (through js/libcurl-bare.mjs). All three
   run in the same service worker (public/sw.js). A tab keeps the engine it
   loaded with until its next navigation, which moves it to the current one.
   ═══════════════════════════════════════════════════════════ */
const PROXIES={sj2:'Scramjet v2',wj:'WillieJet',sj1:'Scramjet v1',uv:'Ultraviolet'};
const PROXY_SHORT={sj2:'v2',wj:'WJ',sj1:'v1',uv:'UV'};
const proxyId=()=>PROXIES[S.proxy]?S.proxy:'wj';
/* per-site engine picks (toolbar menu, or a fallback after a failure); this device only */
let siteEngines=store('wvm.siteEngines',{});
let siteNoFast=store('wvm.siteNoFast',[]); // hosts WillieJet's fast mode stays off for
let siteAdsOff=store('wvm.siteAdsOff',[]); // hosts WillieJet's ad blocker stays off for
const hostOf=u=>{try{return new URL(u).hostname}catch(_){return''}};
const engineFor=u=>{const e=siteEngines[hostOf(u)];return PROXIES[e]?e:proxyId()};
function setSiteEngine(url,engine){const h=hostOf(url);if(!h)return;if(engine)siteEngines[h]=engine;else delete siteEngines[h];put('wvm.siteEngines',siteEngines)}
const proxies={}; // engine id -> Promise<{frame(iframe)}>
let swControl=null,swActive=null,bareConn=null;
const scripts={};
function bstatus(msg,show=true){const el=$('#browser-status');el.textContent=msg;el.style.display=show?'block':'none'}
async function waitForControl(reg){
  if(navigator.serviceWorker.controller)return navigator.serviceWorker.controller;
  const ex=reg.active||reg.waiting||reg.installing;
  if(ex&&ex.state!=='activated')await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('SW timeout')),10000);ex.addEventListener('statechange',()=>{if(ex.state==='activated'){clearTimeout(to);res()}else if(ex.state==='redundant'){clearTimeout(to);rej(new Error('SW redundant'))}})});
  if(navigator.serviceWorker.controller)return navigator.serviceWorker.controller;
  if(sessionStorage.getItem('scramjet_sw_reload')!=='1'){sessionStorage.setItem('scramjet_sw_reload','1');throw new Error('Refreshing once so the proxy can control this page.')}
  throw new Error('Proxy worker active but not controlling. Please refresh.');
}
const wispUrl=()=>`${location.protocol==='https:'?'wss':'ws'}://${location.host}/wisp/`;
function loadScript(src){return scripts[src]||=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>{delete scripts[src];rej(new Error(`Couldn't load ${src}`))};document.head.appendChild(s)})}
function proxyWorker(){
  return swControl||=(async()=>{
    if(!('serviceWorker'in navigator))throw new Error('This browser has no service-worker support.');
    // wait for deferred scripts if needed
    for(let i=0;i<50&&typeof window.registerScramjetServiceWorker!=='function';i++)await new Promise(r=>setTimeout(r,100));
    if(typeof window.registerScramjetServiceWorker!=='function')throw new Error('register-sw.js missing.');
    const reg=await window.registerScramjetServiceWorker(),was=navigator.serviceWorker.controller;
    // after a deploy there may be a new worker; pick it up now and start the engines on it, not on the one leaving
    if(was){
      await reg.update().catch(()=>{});
      for(let i=0;i<150&&navigator.serviceWorker.controller===was&&(reg.installing||reg.waiting||reg.active!==was);i++)await new Promise(r=>setTimeout(r,100));
    }
    const sw=await waitForControl(reg);
    if(!swActive)setInterval(()=>navigator.serviceWorker.controller?.postMessage({keepalive:true}),15000);
    swActive=sw;
    return sw;
  })().catch(e=>{swControl=null;throw e});
}
/* A new worker took over mid-session: the engines were set up with the old one, so start them again.
   Open tabs move over on their next navigation or Reload. */
navigator.serviceWorker?.addEventListener('controllerchange',()=>{
  if(!swActive||navigator.serviceWorker.controller===swActive)return;
  swControl=null;for(const k in proxies)delete proxies[k];
  tabs.forEach(t=>{if(t.px)t.stale=true});
});
function bareMux(){
  return bareConn||=(async()=>{
    const{BareMuxConnection}=await import('/baremux/index.mjs');
    const conn=new BareMuxConnection('/baremux/worker.js');
    await conn.setTransport('/js/libcurl-bare.mjs',[{wisp:wispUrl()}]);
    return conn;
  })().catch(e=>{bareConn=null;throw e});
}
/* history.replaceState(state,title) with no URL (or a null one) means "stay here", but the
   Scramjet v2 core turns the missing URL into the text "undefined" and the page lands on
   /undefined (claude.ai's router does this). Hand the core the current URL instead. Scramjet v2
   gets this through its frame init hook; WillieJet does the same in wj/inject.js. */
function keepUrlOnHistory(client,win){
  const proto=win.History?.prototype;if(!proto)return;
  for(const name of['pushState','replaceState']){
    const desc=Object.getOwnPropertyDescriptor(proto,name);if(!desc||typeof desc.value!=='function')continue;
    Object.defineProperty(proto,name,{...desc,value:new Proxy(desc.value,{apply(target,that,args){if(args.length>=2&&args[2]==null)args=[args[0],args[1],client.url.href];return Reflect.apply(target,that,args)}})});
  }
}
const PROXY_START={
  async sj2(sw){
    if(typeof $scramjetController==='undefined')throw new Error('controller.api.js missing.');
    const{default:LibcurlClient}=await import('/libcurl/index.mjs');
    const c=new $scramjetController.Controller({serviceworker:sw,transport:new LibcurlClient({wisp:wispUrl()}),config:{prefix:'/~/sj/',scramjetPath:'/scramjet/scramjet.js',wasmPath:'/scramjet/scramjet.wasm',injectPath:'/controller/controller.inject.js'},scramjetConfig:{flags:{captureErrors:true,allowInvalidJs:true}}});
    await c.wait();
    return{frame:f=>{
      const fr=c.createFrame(f);
      new $scramjetController.ManagedPlugin('wvm-keep-url',[]).tap(fr.hooks.init.post,({client,window:w})=>{try{keepUrlOnHistory(client,w)}catch(e){console.warn('keepUrlOnHistory:',e)}});
      return fr;
    }};
  },
  async wj(){
    const{start}=await import('/wj/engine.mjs');
    return start({
      wisp:wispUrl(),cache:!S.incognito, // incognito leaves no cached files behind
      fast:S.wjFast,fastSkip:siteNoFast,ads:S.wjAds,adsSkip:siteAdsOff,
      onfastblocked:origin=>toast(`${hostOf(origin)} turns away fast mode, so it loads the normal way`),
      onrestart:()=>{const open=tabs.filter(t=>t.engine==='wj'&&t.url&&t.url!=='about:blank');toast('WillieJet restarted itself'+(open.length?', reloading your tabs':''));open.forEach(t=>navigate(t.url,t,true))},
    });
  },
  async sj1(){
    await Promise.all([loadScript('/sj1/scramjet.all.js'),bareMux()]);
    const{ScramjetController}=$scramjetLoadController();
    const c=new ScramjetController({prefix:'/~/sj1/',files:{wasm:'/sj1/scramjet.wasm.wasm',all:'/sj1/scramjet.all.js',sync:'/sj1/scramjet.sync.js'},flags:{captureErrors:true,allowInvalidJs:true}});
    await c.init();
    return{frame:f=>c.createFrame(f)};
  },
  async uv(){
    await Promise.all([loadScript('/uv/uv.bundle.js').then(()=>loadScript('/uv/uv.config.js')),bareMux()]);
    const cfg=self.__uv$config;
    return{frame:f=>({
      go:u=>{f.src=cfg.prefix+cfg.encodeUrl(u)},
      back:()=>f.contentWindow?.history.back(),
      forward:()=>f.contentWindow?.history.forward(),
      reload:()=>f.contentWindow?.location.reload(),
    })};
  },
};
function proxyEngine(id=proxyId()){
  return proxies[id]||=(async()=>{
    bstatus(`Starting ${PROXIES[id]}…`);
    const e=await PROXY_START[id](await proxyWorker());
    sessionStorage.removeItem('scramjet_sw_reload');bstatus('',false);
    return e;
  })().catch(e=>{delete proxies[id];throw e});
}
function makeFrame(id){const f=document.createElement('iframe');f.addEventListener('load',()=>frameLoaded(f));f.className='browser-frame';f.title='Tab '+id;f.allow='fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture';f.referrerPolicy='no-referrer';return f}
/* the tab's frame, driven by the current engine; a tab changing engine (or worker) gets a fresh iframe */
async function tabProxy(t){
  const id=engineFor(t.url);
  if(t.px&&!t.stale&&t.engine===id)return t.px;
  const e=await proxyEngine(id);
  if(t.px&&!t.stale&&t.engine===id)return t.px;
  if(t.px){const f=makeFrame(t.id);f.classList.toggle('active',t.frame.classList.contains('active'));try{t.frame.src='about:blank'}catch(_){}t.frame.replaceWith(f);t.frame=f}
  t.engine=id;t.stale=false;t.px=e.frame(t.frame);
  return t.px;
}
function proxyFailed(err,label='Error'){console.error(err);if(String(err?.message).includes('Refreshing once')){toast('Proxy installing — refreshing…');setTimeout(()=>location.reload(),700)}else bstatus(label+': '+(err?.message||err))}
/* Settings changed the engine: open tabs reload in the new one */
function proxyChanged(){
  const id=proxyId(),open=tabs.filter(t=>t.engine&&t.engine!==engineFor(t.url)&&t.url&&t.url!=='about:blank');
  open.forEach(t=>navigate(t.url,t,true));
  toast(`Browser now uses ${PROXIES[id]}`+(open.length?` · reloaded ${open.length} tab${open.length>1?'s':''}`:''),'ok');
}
const GLOBE='<svg class="i i-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z"/></svg>';
let tabs=[],activeTab=null,tabN=0;
const getTab=()=>tabs.find(t=>t.id===activeTab)||null;
function renderTabs(){
  const list=$('#tab-list'),frag=document.createDocumentFragment();
  tabs.forEach(t=>{const el=document.createElement('div');el.className='tab'+(t.id===activeTab?' active':'');el.dataset.id=t.id;el.title=t.url||'';const f=favicon(t.url,32);el.innerHTML=`<span class="fv">${f?`<img src="${f}" alt="" onerror="this.parentNode.innerHTML='${GLOBE.replace(/"/g,'&quot;')}'">`:GLOBE}</span><span class="tt"></span><span class="tx" title="Close">${'<svg class="i i-sm" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>'}</span>`;el.querySelector('.tt').textContent=t.title;frag.appendChild(el)});
  list.replaceChildren(frag);
}
$('#tab-list').addEventListener('click',e=>{const el=e.target.closest('.tab');if(!el)return;const id=+el.dataset.id;if(e.target.closest('.tx'))closeTab(id);else switchTab(id)});
$('#tab-list').addEventListener('auxclick',e=>{const el=e.target.closest('.tab');if(el&&e.button===1){e.preventDefault();closeTab(+el.dataset.id)}});
function switchTab(id){tabs.forEach(t=>t.frame.classList.toggle('active',t.id===id));activeTab=id;const t=getTab();if(t){$('#browser-address').value=t.url&&t.url!=='about:blank'?t.url:'';setOmniIcon(t.url)}renderTabs();engineLabel()}
/* toolbar engine button: which engine this tab's site uses, and a menu to change it */
function engineLabel(){const t=getTab(),id=t?.engine||engineFor(t?.url||'');const b=$('#b-engine');b.textContent=PROXY_SHORT[id]||'WJ';b.title=`Proxy engine: ${PROXIES[id]} (click to change for this site)`}
$('#b-engine').onclick=e=>{
  click();const pop=$('#b-engine-pop'),t=getTab();
  if(pop.classList.contains('show')){pop.classList.remove('show');return}
  const url=t?.url||'',host=hostOf(url),cur=t?.engine||engineFor(url),pinned=!!siteEngines[host];
  pop.replaceChildren();
  const h=document.createElement('h4');h.textContent=host?`Engine for ${host}`:'Proxy engine';pop.appendChild(h);
  for(const[id,name]of Object.entries(PROXIES)){
    const b=document.createElement('button');b.className='item';b.setAttribute('role','menuitem');
    b.innerHTML=`<span></span>${id===proxyId()?' <small>default</small>':''}${id===cur?'<span class="ck">✓</span>':''}`;b.firstChild.textContent=name;
    b.disabled=!host;
    b.onclick=()=>{pop.classList.remove('show');setSiteEngine(url,id===proxyId()?null:id);toast(`${host} now opens with ${name}`,'ok');if(t)navigate(url,t,true)};
    pop.appendChild(b);
  }
  if(host&&cur==='wj'&&S.wjFast){
    const off=siteNoFast.includes(host),b=document.createElement('button');b.className='item';b.setAttribute('role','menuitem');
    b.innerHTML=`<span>Fast mode for this site</span>${off?'':'<span class="ck">✓</span>'}`;
    b.onclick=()=>{pop.classList.remove('show');siteNoFast=off?siteNoFast.filter(h=>h!==host):[...siteNoFast,host];put('wvm.siteNoFast',siteNoFast);
      proxies.wj?.then(e=>e.setFast(S.wjFast,siteNoFast)).then(()=>{toast(`Fast mode ${off?'on':'off'} for ${host}`,'ok');if(t)navigate(url,t,true)})};
    pop.appendChild(b);
  }
  if(host&&cur==='wj'&&S.wjAds){
    const off=siteAdsOff.includes(host),b=document.createElement('button');b.className='item';b.setAttribute('role','menuitem');
    b.innerHTML=`<span>Block ads on this site <small></small></span>${off?'':'<span class="ck">✓</span>'}`;
    proxies.wj?.then(e=>e.stats()).then(st=>{const n=st?.ads?.byHost?.[host];if(n)b.querySelector('small').textContent=`· ${n} blocked`}).catch(()=>{});
    b.onclick=()=>{pop.classList.remove('show');siteAdsOff=off?siteAdsOff.filter(h=>h!==host):[...siteAdsOff,host];put('wvm.siteAdsOff',siteAdsOff);
      proxies.wj?.then(e=>e.setAds(S.wjAds,siteAdsOff)).then(()=>{toast(`Ad blocker ${off?'on':'off'} for ${host}`,'ok');if(t)navigate(url,t,true)})};
    pop.appendChild(b);
  }
  if(cur==='wj'&&proxies.wj){const b=document.createElement('button');b.className='item';b.setAttribute('role','menuitem');b.textContent='Copy debug info';b.onclick=()=>{pop.classList.remove('show');wjDebugReport(t)};pop.appendChild(b)}
  if(pinned){const b=document.createElement('button');b.className='item';b.textContent='Use my default engine';b.onclick=()=>{pop.classList.remove('show');setSiteEngine(url,null);if(t)navigate(url,t,true)};pop.appendChild(b)}
  const r=e.currentTarget.getBoundingClientRect();pop.style.top=r.bottom+6+'px';pop.style.left=Math.max(8,Math.min(r.right-230,innerWidth-238))+'px';pop.classList.add('show');
};
document.addEventListener('pointerdown',e=>{const pop=$('#b-engine-pop');if(pop.classList.contains('show')&&!pop.contains(e.target)&&e.target!==$('#b-engine'))pop.classList.remove('show')},true);
/* WillieJet's error page: "open with another engine", or an automatic retry when the
   engine itself (not the network) failed. Only from our own tabs' frames. */
window.addEventListener('message',e=>{
  const d=e.data;if(e.origin!==location.origin||!d||typeof d!=='object'||typeof d.wj!=='string')return;
  const t=tabs.find(x=>x.frame.contentWindow===e.source);if(!t)return;
  if(d.wj==='open'&&/^https?:/i.test(d.url)){navigate(d.url,t,true);return} // "Open anyway" on a site the ad blocker stopped
  if(hostOf(d.url)!==hostOf(t.url))return;
  if(d.wj==='switch'&&PROXIES[d.engine]){setSiteEngine(d.url,d.engine);toast(`${hostOf(d.url)} now opens with ${PROXIES[d.engine]}`,'ok');navigate(d.url,t,true)}
  else if(d.wj==='failed'&&!d.network&&t.engine==='wj'&&t.retried!==d.url){t.retried=d.url;setSiteEngine(d.url,'uv');toast(`WillieJet couldn't load ${hostOf(d.url)}, trying Ultraviolet`);navigate(d.url,t,true)}
});
/* ── the page inside a tab: its real address and title, and whether it looks broken ── */
const CLIENT_KEY=Symbol.for('scramjet client global');
function realUrl(t){
  let w;try{w=t.frame.contentWindow;if(!w||w.location.href==='about:blank')return null}catch(_){return null}
  try{const u=w[CLIENT_KEY]?.url;if(u)return String(u.href||u)}catch(_){} // Scramjet v2, WillieJet, Scramjet v1
  try{const c=self.__uv$config,p=w.location.pathname;if(t.engine==='uv'&&c&&p.startsWith(c.prefix))return c.decodeUrl(p.slice(c.prefix.length))}catch(_){}
  return null;
}
function renameHistory(url,title){const h=historyData.find(x=>x.url===url);if(h&&h.title!==title){h.title=title;put('history',historyData)}}
/* clicking around inside a site: the address bar, tab, history and bookmarks follow along */
function syncTab(t){
  // the page we're navigating away from is still showing: its address isn't the tab's any more
  if(t.leaving){let d=null;try{d=t.frame.contentDocument}catch(_){}if(d===t.leaving&&Date.now()-t.leavingAt<30000)return;t.leaving=null}
  const u=realUrl(t);let title='',changed=false;
  try{title=(t.frame.contentDocument?.title||'').trim().slice(0,80)}catch(_){}
  if(u&&/^https?:/i.test(u)&&u!==t.url){
    t.url=u;changed=true;if(!S.incognito)addHistory(u,title);
    if(t.id===activeTab){if(document.activeElement!==$('#browser-address'))$('#browser-address').value=u;setOmniIcon(u)}
  }
  if(title&&title!==t.title){t.title=title;changed=true;if(!S.incognito)renameHistory(t.url,title)}
  if(changed)renderTabs();
}
setInterval(()=>{if($('#browser-wrap').style.display==='flex')tabs.forEach(syncTab)},1500); // for sites that change the address without reloading
const FALLBACK_ORDER=['wj','sj2','uv','sj1'];
function frameLoaded(f){
  const t=tabs.find(x=>x.frame===f);if(!t)return;
  let proxied=false;try{proxied=f.contentWindow.location.pathname.startsWith('/~/')}catch(_){}
  if(!proxied)return;
  syncTab(t);
  t.errors=0;try{const w=f.contentWindow;w.addEventListener('error',()=>t.errors++);w.addEventListener('unhandledrejection',()=>t.errors++)}catch(_){}
  clearTimeout(t.healthT);const url=t.url,engine=t.engine,since=Date.now();
  t.healthT=setTimeout(()=>checkHealth(t,url,engine,since),6000);
}
/* blank, or nearly empty and throwing errors: judged only on the tab you're looking at */
function looksBroken(t){
  let d;try{d=t.frame.contentDocument}catch(_){return false}
  if(!d||!d.body)return !!d;
  const text=(d.body.innerText||'').trim().length;
  const visible=[...d.querySelectorAll('img,canvas,video,iframe,svg,embed,object,input,button,textarea,select')].some(e=>{const r=e.getBoundingClientRect();return r.width>8&&r.height>8});
  return (!text&&!visible)||((t.errors||0)>=10&&text<200&&!visible);
}
function checkHealth(t,url,engine,since){
  if(!tabs.includes(t)||t.url!==url||t.engine!==engine)return;
  let loading=false;try{loading=t.frame.contentDocument?.readyState!=='complete'}catch(_){}
  if(t.id!==activeTab||(loading&&Date.now()-since<25000)){t.healthT=setTimeout(()=>checkHealth(t,url,engine,since),3000);return}
  if(!looksBroken(t))return;
  const tried=((t.tried||={})[url]||=new Set());tried.add(engine);
  if(tried.size>1)return; // one automatic retry per page
  const next=[...FALLBACK_ORDER.slice(FALLBACK_ORDER.indexOf(engine)+1),...FALLBACK_ORDER].find(e=>!tried.has(e));
  if(!next)return;
  tried.add(next);setSiteEngine(url,next);
  toast(`${hostOf(url)} looked broken on ${PROXIES[engine]}, trying ${PROXIES[next]}`);
  navigate(url,t,true);
}

/* "Copy debug info" (engine badge, WillieJet): what pages did lately, where their
   own code tried to navigate, and a look at that code, for sites that misbehave */
async function wjDebugReport(t){
  const eng=await proxies.wj,log=eng.debugLog(),at=/(https?:\/\/[^\s()]+?):(\d+):(\d+)/;
  const realOf=u=>{try{const x=new URL(u);return x.origin===location.origin&&x.pathname.startsWith('/~/wj/')?decodeURIComponent(x.pathname.split('/').slice(4).join('/')):u}catch(_){return u}};
  const lines=[`WillieJet debug info, ${new Date().toISOString()}`,`Tab: ${t?.url||'?'} (engine ${t?.engine||'?'}, fast mode ${S.wjFast?'on':'off'}${siteNoFast.includes(hostOf(t?.url||''))?', off for this site':''})`,`Browser: ${navigator.userAgent}`,''];
  const sources={};
  for(const e of log.slice(-60)){
    const time=new Date(e.at).toTimeString().slice(0,8);
    lines.push(e.kind==='navigate'?`[${time}] ${e.how} navigation to "${e.to}" (from ${e.from})`:`[${time}] ${e.kind}: ${e.message}${e.at?' at '+realOf(String(e.at)):''} (on ${e.from})`);
    const frames=String(e.stack||'').split('\n').filter(l=>at.test(l)&&!/\/scramjet\/scramjet|\/wj\/inject\.js|\/controller\//.test(l)).slice(0,6); // skip our own files, not proxied ones (/~/wj/)
    for(const f of frames)lines.push('    '+f.trim().replace(at,(m,u,l,c)=>`${realOf(u)}:${l}:${c}`));
    if(e.kind==='navigate'&&frames[0]){
      const[,u,l,c]=frames[0].match(at),real=realOf(u);
      const src=sources[real]??=await eng.source(real,{rewrite:/\.m?js(\?|$)/i.test(real)||!/\.\w+(\?|$)/.test(new URL(real).pathname),module:/\.mjs(\?|$)/i.test(real)}).catch(()=>null); // stack positions are in the rewritten script
      const code=src?.split('\n')[+l-1];
      if(code)lines.push(`    code there: ...${code.slice(Math.max(0,+c-200),+c+200)}...`);
    }
  }
  if(!log.length)lines.push('(Nothing recorded yet. Reload the page in this tab, then copy again.)');
  const text=lines.join('\n');
  try{await navigator.clipboard.writeText(text);toast('Debug info copied','ok')}catch(_){}
  dcModal({title:'Debug info',sub:'Copied to your clipboard. It lists the addresses this tab visited, so only share it with someone you trust.',fields:[{key:'log',label:'Debug info',type:'textarea',rows:12,value:text,readonly:true}],okLabel:'Done',onOk:()=>{}});
}

/* ── WillieJet in Settings: cache stats, clearing, the panic wipe, the speed test ── */
function wjWipe(){try{caches.delete('wj-http-v1');caches.delete('wj-rewrite-v1');indexedDB.deleteDatabase('williejet')}catch(_){}loginsWipe()}
async function wjStats(){
  const el=$('#wj-stats');if(!proxies.wj)return;
  const st=await proxies.wj.then(e=>e.stats()).catch(()=>null);if(!st)return;
  if(!st.cache){el.textContent='Caching is off (incognito mode).';return}
  const h=st.http,r=st.rewrites,f=st.fast;
  const total=h.hits+h.revalidated+h.misses;
  el.textContent=`This session: ${h.hits} files from cache, ${h.revalidated} rechecked, ${h.misses} downloaded${total?` (${Math.round((h.hits+h.revalidated)*100/total)}% reused)`:''}. ${r.hits} scripts skipped rewriting. `+(f.on?`Fast mode fetched ${f.fast}. `:'')+(st.ads?.on?`Blocked ${st.ads.blocked} ads and trackers. `:'')+(st.preload?.used?`${st.preload.used} files were ready before pages asked.`:'');
}
$('#snav').addEventListener('click',e=>{if(e.target.closest('[data-page="browser"]'))wjStats()});
$('#wj-clear').onclick=async()=>{
  click();wjWipe();
  if(proxies.wj)await proxies.wj.then(e=>e.clear()).catch(()=>{});
  toast('WillieJet cache cleared','ok');wjStats();
};
/* ── Saved logins (WillieJet tabs) ──
   wj/inject.js tells us when you sign in. Once the sign-in went through (the password
   left the page), we offer to save it. The key button in the address bar fills saved
   logins back in, only on the site they're for, and only when you click it.
   Stored on this device only: IndexedDB wvm-logins, encrypted with an AES key the
   browser won't let even this page export, so a copy of the files can't be read.
   Never synced and never sent to our server. */
const LOGINS_KEY=Symbol.for('wj.logins');
let loginsNever=store('wvm.loginsNever',[]); // sites you said "never" for
const loginHints={}; // host -> {username, at}: the name typed on a two-step sign-in's first page
let loginsCache=null,pendingLogin=null,loginAskT=null;
function loginsDb(){return loginsDb.p||=new Promise((ok,no)=>{const r=indexedDB.open('wvm-logins',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
const kvGet=(db,k)=>new Promise((ok,no)=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
const kvPut=(db,k,v)=>new Promise((ok,no)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>ok();t.onerror=()=>no(t.error)});
async function loginsCrypto(db){let k=await kvGet(db,'key');if(!k){k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await kvPut(db,'key',k)}return k}
async function loginsLoad(){
  if(loginsCache)return loginsCache;
  try{const db=await loginsDb(),v=await kvGet(db,'vault');loginsCache=v?JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:v.iv},await loginsCrypto(db),v.data))):[]}
  catch(e){console.warn('Saved logins:',e);loginsCache=[]}
  return loginsCache;
}
async function loginsStore(list){
  const db=await loginsDb(),iv=crypto.getRandomValues(new Uint8Array(12));
  await kvPut(db,'vault',{iv,data:await crypto.subtle.encrypt({name:'AES-GCM',iv},await loginsCrypto(db),new TextEncoder().encode(JSON.stringify(list)))});
  loginsCache=list;renderLogins();
}
function loginsWipe(){loginsCache=[];const p=loginsDb.p;loginsDb.p=null;Promise.resolve(p).then(db=>db?.close()).catch(()=>{}).finally(()=>{try{indexedDB.deleteDatabase('wvm-logins')}catch(_){}})}
/* a proxied page reports a sign-in (or a two-step sign-in's name) */
window[LOGINS_KEY]=(e,win)=>{try{loginSeen(e,win)}catch(_){}};
function loginSeen(e,win){
  if(!e||typeof e!=='object'||!S.saveLogins||S.incognito)return;
  const host=String(e.host||'').toLowerCase();if(!host||loginsNever.includes(host))return;
  const username=String(e.username||'').slice(0,200);
  if(e.kind==='user'){if(username)loginHints[host]={username,at:Date.now()};return}
  const password=String(e.password||'');if(e.kind!=='login'||!password||password.length>512)return;
  const hint=loginHints[host],c={host,username:username||(hint&&Date.now()-hint.at<600000?hint.username:''),password};
  const t=tabs.find(x=>{try{for(let w=win;w;w=w.parent){if(w===x.frame.contentWindow)return true;if(w===w.parent)break}}catch(_){}return false});
  if(t)waitForSignIn(t,c);
}
/* Offer only once the password isn't sitting in the page any more (the sign-in went
   through: a new page, or the form went away), for up to 30 s. */
function waitForSignIn(t,c){
  const since=Date.now(),tick=async()=>{
    if(!tabs.includes(t))return;
    if(loginFields(t,c.host).some(f=>f.pw&&f.pw.value===c.password)){if(Date.now()-since<30000)setTimeout(tick,600);return}
    const list=await loginsLoad(),same=list.find(l=>l.host===c.host&&l.username===c.username);
    if(same?.password===c.password||(pendingLogin&&pendingLogin.host===c.host&&pendingLogin.username===c.username&&pendingLogin.password===c.password))return;
    askToSave(c,!!same);
  };
  setTimeout(tick,600);
}
function askToSave(c,update){
  pendingLogin=c;
  const box=$('#login-ask');
  box.innerHTML=`<h4></h4><div class="la-user"></div><div class="la-btns"><button class="btn sm primary" data-a="save"></button><button class="btn sm" data-a="no">Not now</button><button class="btn sm" data-a="never">Never for this site</button></div>`;
  box.querySelector('h4').textContent=update?`Update your saved password for ${c.host}?`:`Save your login for ${c.host}?`;
  box.querySelector('.la-user').textContent=c.username||'(no username)';
  box.querySelector('[data-a=save]').textContent=update?'Update':'Save';
  const r=$('.omni').getBoundingClientRect();
  box.style.top=(r.height?r.bottom+8:64)+'px';box.style.left=Math.max(8,Math.min((r.width?r.right:innerWidth)-320,innerWidth-328))+'px';
  box.classList.add('show');
  clearTimeout(loginAskT);loginAskT=setTimeout(()=>{box.classList.remove('show');pendingLogin=null},60000);
}
$('#login-ask').addEventListener('click',async e=>{
  const a=e.target.closest('[data-a]')?.dataset.a,c=pendingLogin;if(!a||!c)return;
  $('#login-ask').classList.remove('show');pendingLogin=null;clearTimeout(loginAskT);
  if(a==='never'){loginsNever=[...new Set([...loginsNever,c.host])];put('wvm.loginsNever',loginsNever);renderLogins();return}
  if(a!=='save')return;
  try{await loginsStore([...(await loginsLoad()).filter(l=>!(l.host===c.host&&l.username===c.username)),{...c,at:Date.now()}]);toast(`Login saved for ${c.host}`,'ok');updateKeyButton()}
  catch(err){toast('Could not save the login: '+(err?.message||err),'err')}
});
/* sign-in fields on a tab's page (and its frames on the same site) */
const USERISH=/user|e-?mail|login|account|identifier|phone/i;
function loginFields(t,host){
  const out=[],shown=i=>!i.disabled&&!i.readOnly&&(i.offsetWidth>0||i.offsetHeight>0);
  const walk=(w,depth)=>{
    let d,h='';try{d=w.document;const u=w[CLIENT_KEY]?.url;h=new URL(String(u?.href||u)).hostname}catch(_){return}
    if(h===host){
      const inputs=[...d.querySelectorAll('input')].filter(shown),pw=inputs.find(i=>i.type==='password')||null;
      const text=inputs.filter(i=>/^(text|email|tel)$/i.test(i.type));
      const user=text.find(i=>/username|email/i.test(i.autocomplete||''))||(pw?text.filter(i=>i.compareDocumentPosition(pw)&4).pop():text.find(i=>i.type==='email'||USERISH.test(`${i.name} ${i.id} ${i.placeholder||''} ${i.getAttribute('aria-label')||''}`)))||null;
      if(pw||user)out.push({win:w,pw,user});
    }
    if(depth<3)for(const f of d.querySelectorAll('iframe,frame'))try{walk(f.contentWindow,depth+1)}catch(_){}
  };
  try{walk(t.frame.contentWindow,0)}catch(_){}
  return out;
}
/* types a value the way a person would, so the site's own scripts (React too) see it */
function typeInto(win,el,value){
  el.focus();Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(el,value);
  el.dispatchEvent(new win.Event('input',{bubbles:true}));el.dispatchEvent(new win.Event('change',{bubbles:true}));
}
function fillLogin(t,l){
  if(hostOf(t.url)!==l.host)return;
  let n=0;
  for(const f of loginFields(t,l.host)){if(f.user&&l.username){typeInto(f.win,f.user,l.username);n++}if(f.pw){typeInto(f.win,f.pw,l.password);n++}}
  toast(n?`Filled your login for ${l.host}`:'No sign-in form on this page',n?'ok':'err');
}
/* the key button shows on a sign-in page of a site with saved logins */
async function updateKeyButton(){
  const t=getTab(),b=$('#b-key'),host=hostOf(t?.url||'');
  let show=false;
  if(host&&t?.engine==='wj'&&(loginsCache||(await loginsLoad())).some(l=>l.host===host))show=loginFields(t,host).length>0;
  b.hidden=!show;
}
setInterval(()=>{if($('#browser-wrap').style.display==='flex')updateKeyButton()},1500);
$('#b-key').onclick=async e=>{
  click();const pop=$('#b-key-pop'),t=getTab(),host=hostOf(t?.url||'');
  if(pop.classList.contains('show')){pop.classList.remove('show');return}
  pop.replaceChildren();
  const h=document.createElement('h4');h.textContent=`Saved logins for ${host}`;pop.appendChild(h);
  for(const l of (await loginsLoad()).filter(l=>l.host===host)){
    const b=document.createElement('button');b.className='item';b.setAttribute('role','menuitem');b.textContent=l.username||'(no username)';
    b.onclick=()=>{pop.classList.remove('show');fillLogin(t,l)};pop.appendChild(b);
  }
  const m=document.createElement('button');m.className='item';m.textContent='Manage saved logins';m.onclick=()=>{pop.classList.remove('show');openSettings();$('#snav [data-page="browser"]')?.click()};pop.appendChild(m);
  const r=e.currentTarget.getBoundingClientRect();pop.style.top=r.bottom+6+'px';pop.style.left=Math.max(8,Math.min(r.right-230,innerWidth-238))+'px';pop.classList.add('show');
};
document.addEventListener('pointerdown',e=>{const pop=$('#b-key-pop');if(pop.classList.contains('show')&&!pop.contains(e.target)&&!$('#b-key').contains(e.target))pop.classList.remove('show')},true);
/* Settings > Browser > Saved logins */
async function renderLogins(){
  const list=(await loginsLoad()).slice().sort((a,b)=>a.host.localeCompare(b.host)||a.username.localeCompare(b.username)),box=$('#logins-list');
  $('#logins-count').textContent=(list.length?`${list.length} saved on this device.`:'None yet.')+(loginsNever.length?` Never saving for ${loginsNever.length} site${loginsNever.length>1?'s':''}.`:'');
  box.replaceChildren(...list.map(l=>{
    const row=document.createElement('div');row.className='lg';row.innerHTML=`<span class="lg-host"></span><span class="lg-user"></span><button class="btn sm danger" title="Delete this login">Delete</button>`;
    row.querySelector('.lg-host').textContent=l.host;row.querySelector('.lg-user').textContent=l.username||'(no username)';
    row.querySelector('button').onclick=async()=>{await loginsStore((await loginsLoad()).filter(x=>!(x.host===l.host&&x.username===l.username)));toast('Login deleted','ok')};
    return row;
  }));
}
$('#snav').addEventListener('click',e=>{if(e.target.closest('[data-page="browser"]'))renderLogins()});
$('#logins-clear').onclick=async()=>{
  if(!confirm('Delete every saved login on this device?'))return;
  loginsWipe();loginsNever=[];put('wvm.loginsNever',[]);renderLogins();updateKeyButton();toast('Saved logins deleted','ok');
};

/* times real sites on each engine in an off-screen frame, from this browser */
async function speedTest(){
  const sites=$('#st-sites').value.split('\n').map(s=>s.trim()).filter(Boolean).map(normalizeUrl).filter(u=>/^https?:/i.test(u)).slice(0,12);
  if(!sites.length)return toast('Add at least one site','err');
  const ids=Object.keys(PROXIES),out=$('#st-results'),btn=$('#st-run');
  btn.disabled=true;btn.textContent='Testing…';
  const results=sites.map(()=>({}));
  const draw=()=>{
    const head='<tr><th>Site</th>'+ids.map(id=>`<th>${PROXIES[id]}</th>`).join('')+'<th></th></tr>';
    out.innerHTML=`<table class="st-table">${head}${sites.map((u,i)=>{
      const ok=ids.filter(id=>typeof results[i][id]==='number');const best=ok.sort((a,b)=>results[i][a]-results[i][b])[0];
      return `<tr><td>${esc(hostOf(u))}</td>${ids.map(id=>{const v=results[i][id];return `<td class="${id===best?'best':typeof v==='number'?'':'bad'}">${v===undefined?'…':typeof v==='number'?v+' ms':esc(v)}</td>`}).join('')}<td>${best?`<button class="btn sm" data-site="${esc(u)}" data-e="${best}">Use ${PROXY_SHORT[best]}</button>`:''}</td></tr>`}).join('')}</table>`;
  };
  draw();
  const box=document.createElement('div');box.style.cssText='position:fixed;left:-12000px;top:0;width:1024px;height:700px;pointer-events:none;opacity:0';document.body.appendChild(box);
  try{
    for(const id of ids){
      let eng;try{eng=await proxyEngine(id)}catch(e){sites.forEach((_,i)=>results[i][id]='unavailable');draw();continue}
      for(let i=0;i<sites.length;i++){
        const f=makeFrame('speed');box.replaceChildren(f);
        const px=eng.frame(f),t0=performance.now();
        results[i][id]=await new Promise(resolve=>{
          const done=v=>{clearTimeout(to);resolve(v)};
          const to=setTimeout(()=>done('timed out'),20000);
          f.addEventListener('load',function onl(){let path='';try{path=f.contentWindow.location.pathname}catch(_){}if(!path.startsWith('/~/'))return;f.removeEventListener('load',onl);const ms=Math.round(performance.now()-t0);setTimeout(()=>done(looksBroken({frame:f})?'blank':ms),800)});
          px.go(sites[i]);
        });
        draw();
      }
    }
  }finally{box.remove();btn.disabled=false;btn.textContent='Run speed test'}
}
$('#st-run').onclick=()=>{click();speedTest()};
$('#st-results').addEventListener('click',e=>{const b=e.target.closest('button[data-site]');if(!b)return;setSiteEngine(b.dataset.site,b.dataset.e===proxyId()?null:b.dataset.e);toast(`${hostOf(b.dataset.site)} now opens with ${PROXIES[b.dataset.e]}`,'ok')});
function setOmniIcon(url){const el=$('#browser-favicon'),src=url&&url!=='about:blank'?favicon(url):'';if(src){el.src=src;el.style.display='block';el.onerror=()=>el.style.display='none'}else el.style.display='none'}
function closeTab(id){const i=tabs.findIndex(t=>t.id===id);if(i<0)return;const t=tabs[i];try{t.frame.src='about:blank'}catch(_){}t.frame.remove();tabs.splice(i,1);if(!tabs.length){closeBrowser();return}if(id===activeTab)switchTab(tabs[Math.min(i,tabs.length-1)].id);else renderTabs()}
async function newTab(url){
  const id=++tabN,f=makeFrame(id);$('#browser-frames').appendChild(f);
  const initial=url||(S.autoblank?'about:blank':S.homepage);
  const tab={id,title:'New Tab',url:initial,frame:f,px:null,engine:null};tabs.push(tab);switchTab(id);
  try{await tabProxy(tab);if(initial!=='about:blank')await navigate(initial,tab);else{$('#browser-address').focus()}}
  catch(err){proxyFailed(err)}
}
async function openBrowser(url){const b=$('#browser-wrap');b.style.display='flex';b.classList.remove('closing');$('#vm-wrap').style.display='none';$('#tb-browser').classList.add('active');closeAllPanels();renderBookmarks();if(!tabs.length)await newTab(url);else if(url)await navigate(url)}
function searchUrl(q){return(ENGINES[S.engine]||ENGINES.google)+encodeURIComponent(q)}
function normalizeUrl(v){if(/^[a-z][a-z0-9+.-]*:\/\//i.test(v))return v;if(/^about:|^data:|^javascript:/i.test(v))return v;if(/^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(v)&&!/\s/.test(v))return'https://'+v;if(/^localhost(:\d+)?/.test(v))return'http://'+v;return searchUrl(v)}
async function navigate(value,tab,quiet){
  const t=tab||getTab();if(!t)return;
  try{
    const raw=typeof value==='string'?value.trim():$('#browser-address').value.trim();if(!raw)return;
    const url=normalizeUrl(raw);
    // until the new page replaces the one on screen, syncTab mustn't read the old one's address back
    try{t.leaving=t.frame.contentDocument;t.leavingAt=Date.now()}catch(_){t.leaving=null}
    t.url=url;t.title=(()=>{try{return new URL(url).hostname.replace(/^www\./,'')||'Loading…'}catch(_){return'Loading…'}})();renderTabs();
    if(t.id===activeTab){$('#browser-address').value=url;setOmniIcon(url)}
    if(!S.incognito&&!quiet)addHistory(url);
    const px=await tabProxy(t);
    if(t.id===activeTab)engineLabel();
    bstatus('Loading…');px.go(url);setTimeout(()=>bstatus('',false),1200)
  }
  catch(err){t.leaving=null;proxyFailed(err,'Navigation error')}
}
$('#browser-address').addEventListener('keydown',e=>{if(e.key==='Enter')navigate()});
/* warm up the connection to where you're typing, so the page starts sooner (WillieJet) */
let warmT;$('#browser-address').addEventListener('input',e=>{clearTimeout(warmT);warmT=setTimeout(()=>{const v=e.target.value.trim();if(v.length<4)return;const url=normalizeUrl(v);if(!/^https?:/i.test(url)||engineFor(url)!=='wj'||!proxies.wj)return;proxies.wj.then(en=>en.warm(url)).catch(()=>{})},300)});
$('#browser-address').addEventListener('focus',e=>e.target.select());
$('#b-back').onclick=()=>getTab()?.px?.back();$('#b-fwd').onclick=()=>getTab()?.px?.forward();
$('#b-reload').onclick=e=>{const t=getTab();if(t?.stale)navigate(t.url,t,true);else t?.px?.reload();const ic=e.currentTarget.querySelector('.i');ic.classList.remove('spinning');void ic.offsetWidth;ic.classList.add('spinning')};
$('#b-home').onclick=()=>navigate(S.homepage);
$('#b-fs').onclick=async()=>{try{if(!document.fullscreenElement)await $('#browser-wrap').requestFullscreen();else await document.exitFullscreen()}catch(_){}};
$('#tab-new').onclick=()=>{click();newTab()};
$('#b-close').onclick=()=>closeBrowser();$('#b-hist').onclick=()=>openHistory();$('#b-bm').onclick=()=>addBookmark();
function closeBrowser(){const b=$('#browser-wrap');b.classList.add('closing');onCloseDone(b,()=>{b.style.display='none';b.classList.remove('closing')});tabs.forEach(t=>{try{t.frame.src='about:blank'}catch(_){}t.frame.remove()});tabs=[];activeTab=null;$('#tab-list').innerHTML='';$('#tb-browser').classList.remove('active');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}

/* bookmarks */
function addBookmark(){const t=getTab();if(!t||!t.url||t.url==='about:blank')return toast('Nothing to bookmark','err');if(bookmarks.some(b=>b.url===t.url))return toast('Already bookmarked');bookmarks.push({title:t.title,url:t.url});put('bookmarks',bookmarks);renderBookmarks();syncControls();toast('Bookmarked!','ok')}
function renderBookmarks(){const bar=$('#bookmarks-bar'),frag=document.createDocumentFragment();bookmarks.forEach((b,i)=>{const el=document.createElement('div');el.className='bm';el.title=b.url;const f=favicon(b.url);el.innerHTML=`${f?`<img src="${f}" alt="" loading="lazy">`:''}<span></span>`;el.lastChild.textContent=b.title;el.onclick=()=>navigate(b.url);el.oncontextmenu=e=>{e.preventDefault();bookmarks.splice(i,1);put('bookmarks',bookmarks);renderBookmarks();syncControls();toast('Bookmark removed')};frag.appendChild(el)});bar.replaceChildren(frag)}
/* history */
function addHistory(url,title){historyData=historyData.filter(h=>h.url!==url);historyData.unshift({url,title:title||(()=>{try{return new URL(url).hostname}catch(_){return url}})(),time:Date.now()});if(historyData.length>200)historyData.length=200;put('history',historyData)}
function openHistory(){openPanel('history-panel');renderHistory()}
function renderHistory(){const l=$('#history-list');if(!historyData.length){l.innerHTML='<div class="empty">No history yet</div>';return}const frag=document.createDocumentFragment();historyData.forEach((h,i)=>{const el=document.createElement('div');el.className='hitem';const f=favicon(h.url);const when=typeof h.time==='number'?new Date(h.time).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):h.time;el.innerHTML=`${f?`<img src="${f}" alt="" loading="lazy">`:''}<div class="ht"><span></span><small></small></div><span class="hd"></span><span class="hx" title="Remove"><svg class="i i-sm" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></span>`;el.querySelector('.ht span').textContent=h.title;el.querySelector('.ht small').textContent=h.url;el.querySelector('.hd').textContent=when;el.querySelector('.hx').onclick=e=>{e.stopPropagation();historyData.splice(i,1);put('history',historyData);renderHistory()};el.onclick=()=>{closePanel('history-panel');openBrowser(h.url)};frag.appendChild(el)});l.replaceChildren(frag)}
$('#clear-history').onclick=()=>{if(!historyData.length)return;if(!confirm('Clear all history?'))return;historyData=[];put('history',historyData);renderHistory();toast('History cleared')};

/* ═══════════════════════════════════════════════════════════
   GAMES
   ═══════════════════════════════════════════════════════════ */
const GAMES=[
  {name:"Roblox",img:"/img/roblox.png",url:"https://nowgg.fun/apps/a/19900/b.html",tag:"nowgg"},
  {name:"Stumble Guys",img:"/img/stumbleguys.jpg",url:"https://nowgg.fun/apps/a/10011/b.html",tag:"nowgg"},
  {name:"Fortnite",img:"/img/fortnite.png",url:"https://nowgg.fun/apps/aptoide/5874/aptoide.html?deep_link=aptoidesearch://com.epicgames.fortnite",tag:"nowgg"},
  {name:"Call of Duty",img:"/img/cod.jpg",url:"https://nowgg.fun/apps/a/10008/b.html",tag:"nowgg"},
  {name:"Melon Sandbox",img:"/img/melon-sandbox.png",url:"https://nowgg.fun/apps/playducky/7199/melon-sandbox.html",tag:"nowgg"},
  {name:"Aptoide Store",img:"/img/aptoide.png",url:"https://nowgg.fun/apps/aptoide/5874/aptoide.html",tag:"nowgg"},
  {name:"Android Cloud",img:"/img/android.jpg",url:"https://nowgg.fun/apps/uncube/7074/now.html",tag:"nowgg"},
  {name:"Cookie Run",img:"/img/cookierun.png",url:"https://nowgg.fun/apps/a/10019/b.html",tag:"nowgg"},
  {name:"Geometry Dash",img:"/img/geodash.jpeg",url:"https://nowgg.fun/apps/robtop-games/1400/geometry-dash.html",tag:"nowgg"},
  {name:"Rocket League Sideswipe",img:"/img/rocketleague.jpeg",url:"https://nowgg.fun/apps/psyonix-studios/4656/rocket-league.html",tag:"nowgg"},
  {name:"Minecraft",img:"/img/minecraft.png",url:"https://nowgg.fun/apps/aptoide/5874/aptoide.html?deep_link=aptoidesearch://com.mojang.minecrafttrialpe",tag:"nowgg"},
  {name:"GN-Math Hub",img:"",url:"https://storage.googleapis.com/mathlearning/ilovessp/500k/gn-math_4",tag:"gnmath"},
  {name:"GN-Math Hub 2",img:"",url:"https://storage.googleapis.com/mathlearning/ilovessp/500k/gn-math_25",tag:"gnmath"},
  {name:"Opium Games",img:"",url:"https://opiumisbest.s3.amazonaws.com/index.html",tag:"gnmath"},
  ...["Slope","Moto X3M","Smash Karts","1v1.LOL","Stickman Hook","Run 3","Friday Night Funkin","Krunker.io","2048","Dino Game","Basketball Stars","Chess","Drift Hunters","Shell Shockers","Venge.io","Subway Surfers","Temple Run 2","Paper.io 2","Agar.io","Slither.io","Crossy Road","Penalty Shooters 2","Ragdoll Archers","Monkey Mart","Candy Clicker"].map(n=>{const s=n.toLowerCase().replace(/\./g,'-').replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-');return{name:n,img:`https://radon.games/thumbnails/${s}.jpg`,url:`https://radon.games/game/${s}`,tag:"html5"}})
];
const TAGN={nowgg:'Cloud',gnmath:'Hub',html5:'HTML5'};
$('#games-count').textContent=GAMES.length+' games';
let gameTag='all',gameQ='';
function renderGames(){
  let list=GAMES;if(gameTag==='fav')list=list.filter(g=>favGames.includes(g.name));else if(gameTag!=='all')list=list.filter(g=>g.tag===gameTag);
  if(gameQ)list=list.filter(g=>g.name.toLowerCase().includes(gameQ));
  if(S.gsort==='az')list=[...list].sort((a,b)=>a.name.localeCompare(b.name));
  else if(S.gsort==='za')list=[...list].sort((a,b)=>b.name.localeCompare(a.name));
  else if(S.gsort==='fav')list=[...list].sort((a,b)=>(favGames.includes(b.name)?1:0)-(favGames.includes(a.name)?1:0));
  else if(S.gsort==='random')list=[...list].sort(()=>Math.random()-.5);
  $('#games-heading').textContent=(gameTag==='all'?'All games':gameTag==='fav'?'Favorites':TAGN[gameTag]+' games')+` · ${list.length}`;
  const grid=$('#games-grid');
  if(!list.length){grid.innerHTML=`<div class="empty" style="grid-column:1/-1">${gameTag==='fav'?'No favorites yet — hover a game and hit the star':'No games match'}</div>`;return}
  const frag=document.createDocumentFragment();
  list.forEach((g,gi)=>{const c=document.createElement('button');c.className='gcard';c.style.setProperty('--i',Math.min(gi,24));c.dataset.name=g.name;const fav=favGames.includes(g.name);c.innerHTML=`<div class="im">${g.img?`<img src="${esc(g.img)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`:`<div class="ph"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.6L2 16a2.5 2.5 0 0 0 4.5 1.5L8 15h8l1.5 2.5A2.5 2.5 0 0 0 22 16l-.7-7.4A4 4 0 0 0 17.32 5z"/></svg></div>`}<span class="fav${fav?' on':''}" title="Favorite">${fav?'<svg class="i star-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>':'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>'}</span></div><div class="nm"><span></span><span class="t">${TAGN[g.tag]||''}</span></div>`;c.querySelector('.nm span').textContent=g.name;frag.appendChild(c)});
  grid.replaceChildren(frag);
}
$('#games-grid').addEventListener('click',e=>{const c=e.target.closest('.gcard');if(!c)return;const g=GAMES.find(x=>x.name===c.dataset.name);if(!g)return;if(e.target.closest('.fav')){e.stopPropagation();toggleFav(g);return}click();launchGame(g)});
function toggleFav(g){const i=favGames.indexOf(g.name);if(i<0){favGames.push(g.name);toast(`${g.name} added to favorites`,'ok')}else{favGames.splice(i,1);toast(`Removed ${g.name} from favorites`)}put('favGames',favGames);renderGames()}
$('#game-tags').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;click();gameTag=b.dataset.tag;$$('#game-tags .chip').forEach(c=>c.classList.toggle('active',c===b));renderGames()});
let gq;$('#games-search').addEventListener('input',e=>{clearTimeout(gq);gq=setTimeout(()=>{gameQ=e.target.value.toLowerCase().trim();renderGames()},80)});
function openGames(){openPanel('games-panel');renderGames();renderRecent();$('#tb-games').classList.add('active')}
function launchGame(g){closePanel('games-panel');if(S.recent)addRecent(g);const b=$('#browser-wrap');b.style.display='flex';b.classList.remove('closing');$('#vm-wrap').style.display='none';$('#tb-browser').classList.add('active');renderBookmarks();if(S.gopen==='current'&&tabs.length)navigate(g.url);else newTab(g.url)}
function addRecent(g){recentGames=recentGames.filter(x=>x.name!==g.name);recentGames.unshift({name:g.name,img:g.img,url:g.url});if(recentGames.length>10)recentGames.length=10;put('recentGames',recentGames)}
function renderRecent(){const sec=$('#recent-sec'),row=$('#recent-row');if(!S.recent||!recentGames.length){sec.style.display='none';return}sec.style.display='';const frag=document.createDocumentFragment();recentGames.forEach(g=>{const el=document.createElement('button');el.className='ritem';el.innerHTML=`<img src="${esc(g.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span></span>`;el.lastChild.textContent=g.name;el.onclick=()=>{click();launchGame(g)};frag.appendChild(el)});row.replaceChildren(frag)}

/* ═══════════════════════════════════════════════════════════
   LINKS
   ═══════════════════════════════════════════════════════════ */
const LINKS=[
  {name:'AuroraOS',tag:'NEW',urls:['https://os4e.s3.amazonaws.com/index.html','https://os4e.s3.us-east-1.amazonaws.com/index.html','https://os4e.s3.dualstack.us-east-1.amazonaws.com/index.html','https://s3.amazonaws.com/os4e/index.html','https://s3.dualstack.us-east-1.amazonaws.com/os4e/index.html','https://quietbirchstudy.s3.amazonaws.com/index.html','https://quietbirchstudy.s3.us-east-1.amazonaws.com/index.html','https://s3.amazonaws.com/quietbirchstudy/index.html','https://s3.us-east-1.amazonaws.com/quietbirchstudy/index.html','https://aurora.kkmsilvia.com']},
  {name:'Voya',tag:'Updated',urls:['https://voya.adfos.com','https://voya.noordware.com','https://voya.fiwers.cl','https://voya.alexlan.org','https://voya.blackfaldsabbey.ca']},
  {name:'DogeUb',urls:['https://oic4.s3.amazonaws.com/index.html','https://oic4.s3.us-east-1.amazonaws.com/index.html','https://o7ry.s3.us-east-1.amazonaws.com/index.html','https://o7ry.s3-external-1.amazonaws.com/index.html','https://s3-external-1.amazonaws.com/o7ry/index.html']},
  {name:'Space',urls:['https://space.colegioitalocomposto.cl','https://space.asirargentina.com.ar','https://space.kkmsilvia.com','https://space.alexlan.org']},
  {name:'gn-math & Opium',urls:['https://storage.googleapis.com/mathlearning/ilovessp/500k/gn-math_4','https://storage.googleapis.com/mathlearning/ilovessp/500k/gn-math_25','https://opiumisbest.s3.amazonaws.com/index.html','https://cdn.jsdelivr.net/gh/opiumbest/svg/index.svg']},
  {name:'Nocturne & Quasar',urls:['https://responsibleuse.org/','https://cdn.jsdelivr.net/gh/lolration/svg/index.svg','https://noc.zaka13.com/','https://thermowavetherapy.com/','https://bakersfieldps.com/','https://noc.exploits-bg.com/']}
];
function renderLinks(q=''){
  q=q.toLowerCase().trim();let n=0;
  $('#links-grid').innerHTML=LINKS.map(sec=>{const urls=sec.urls.filter(u=>!q||u.toLowerCase().includes(q)||sec.name.toLowerCase().includes(q));if(!urls.length)return'';return`<div class="lcard"><h3>${esc(sec.name)}${sec.tag?` <span class="ltag">${sec.tag}</span>`:''}<span class="n">${urls.length} mirrors</span></h3><div class="ls">${urls.map(u=>{n++;const h=(()=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch(_){return u}})();return`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}"><svg class="i i-sm" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></svg>${n}. ${esc(h)}</a>`}).join('')}</div></div>`}).join('')||'<div class="empty" style="grid-column:1/-1">No links match</div>';
}
function openLinks(){openPanel('links-panel');renderLinks($('#links-search').value)}
$('#links-search').addEventListener('input',e=>renderLinks(e.target.value));

/* ═══════════════════════════════════════════════════════════
   COMMUNITY (channels, DMs, roles)
   ═══════════════════════════════════════════════════════════ */
/* connection state ------------------------------------------- */
let chatWS=null,chatReady=false,chatRetry=0,chatRetryT=null;
let chatMe=null,chatMeAccount=false,chatMeRole='guest',chatOwner='william',chatRoles=['owner','admin','mod','member'];
let dcChannels=[],dcDMs=[],dcMembers=[],dcProfiles=[];
let dcActive='general',dcActiveIsDM=false,dcMessages=[],dcOldest=null;
let dcTypers=new Map(),dcTypingSent=null,dcTypingT=null;
let dcAtBottom=true,dcUnread={},dcLastSeen=store('dcLastSeen',{});
let dcReply=null,dcEdit=null,dcFresh=new Set(),dcBump=null,dcBanned=null;
let dcFile=null; // a picture or file waiting to be sent: {file, id, pct, xhr, url, send, channel}
const DC_EMOJI=['👍','❤️','😂','🔥','😮','😢','🎉','👀','💯','🙏','😎','🤯','👎','✅','❌','🤣','😭','🥳','🤔','💀','🫡','⚡','🍿','🐐'];
const ROLE_COLOR={owner:'#f5b301',admin:'#ef4444',mod:'#3b82f6',member:'',guest:''};
const ROLE_RANK={owner:4,admin:3,mod:2,member:1,guest:0};
const rank=r=>ROLE_RANK[r]??0;

function chatState(v){document.documentElement.dataset.chat=v}
function userHue(n){let h=0;for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))>>>0;return h%360}
function userColor(n,override){return override||`hsl(${userHue(n)} 62% 52%)`}
function profileFor(n){return dcProfiles.find(p=>p.username===n)||dcMembers.find(m=>m.name===n)||null}
function nameOf(n){const p=profileFor(n);return p?(p.displayName||p.username||p.name||n):n}
function colorOf(n){const p=profileFor(n);return userColor(n,p&&p.color)}
function roleOf(n){const p=profileFor(n);return (p&&p.role)||(n&&n.startsWith('guest-')?'guest':'member')}
function avatar(n,cls='av'){const d=document.createElement('div');d.className=cls;d.style.background=colorOf(n);d.textContent=(nameOf(n)[0]||'?');return d}

/* connection -------------------------------------------------- */
function connectChat(){
  if(chatWS&&(chatWS.readyState===0||chatWS.readyState===1))return;
  clearTimeout(chatRetryT);
  chatState('off');
  let ws;
  try{ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/chat/')}
  catch(_){scheduleChatRetry();return}
  chatWS=ws;
  ws.onopen=()=>{chatReady=true;chatRetry=0;chatState('on');dcSyncCompose()};
  ws.onmessage=e=>{let d;try{d=JSON.parse(e.data)}catch(_){return}dcHandle(d)};
  ws.onclose=ev=>{
    chatReady=false;chatWS=null;dcTypers.clear();dcRenderTyping();dcSyncCompose();
    if(ev.code===1008){chatState('err');return}
    if(ev.code===4003){chatState('err');dcSyncCompose();return} // banned: don't hammer the door
    if(ev.code===4005){ // signed out (password change, deletion, admin)
      checkAuth().then(d=>{if(d&&d.loggedIn)scheduleChatRetry();else{toast('You were signed out.','err');setTimeout(()=>location.reload(),1500)}});
      return;
    }
    if(ev.code===4004){toast('You were kicked from chat. Reconnecting in a bit…','err');chatRetry=5}
    chatState('off');scheduleChatRetry();
  };
  ws.onerror=()=>chatState('err');
}
function scheduleChatRetry(){
  chatRetry++;
  const wait=Math.min(1000*Math.pow(1.6,chatRetry),20000);
  clearTimeout(chatRetryT);chatRetryT=setTimeout(connectChat,wait);
}
function dcSend(payload){if(chatWS&&chatWS.readyState===1){chatWS.send(JSON.stringify(payload));return true}return false}

/* incoming ---------------------------------------------------- */
function dcHandle(d){
  switch(d.type){
    case 'ready':
      chatMe=d.you;chatMeAccount=d.account;chatMeRole=d.role;chatOwner=d.owner;chatRoles=d.roles||chatRoles;
      dcChannels=d.channels||[];dcDMs=d.dms||[];dcMembers=d.members||[];
      if(d.profile)dcProfiles=[d.profile];
      dcActive=d.channel;dcActiveIsDM=false;
      dcMessages=d.messages||[];
      dcSend({type:'directory'});
      dcRenderAll();dcScroll(true);
      window.voice?.setRooms(d.voice||{});
      break;
    case 'directory': dcProfiles=d.profiles||[];dcRenderMembers();dcRenderMessages();break;
    case 'channels':
      dcChannels=d.channels||[];
      if(d.removed===dcActive)dcOpen(dcChannels[0]?.slug);
      dcRenderChannels();dcRenderHeader();
      break;
    case 'members': dcMembers=d.members||dcMembers;if(d.profiles)dcProfiles=d.profiles;dcRenderMembers();dcRenderMessages();break;
    case 'presence': dcMembers=d.members||[];dcRenderMembers();break;
    case 'profile': if(d.profile){dcUpsertProfile(d.profile);chatMeRole=d.profile.role||chatMeRole}dcRenderMe();break;
    case 'profile.view': if(d.profile){dcUpsertProfile(d.profile);dcRenderMembers()}break;
    case 'dms': dcDMs=d.dms||[];dcRenderChannels();break;
    case 'dm.opened':
      if(!dcDMs.some(x=>x.channel===d.channel))dcDMs.push({channel:d.channel,with:d.with});
      dcActive=d.channel;dcActiveIsDM=true;dcMessages=d.messages||[];
      dcMarkSeen();dcRenderAll();dcScroll(true);
      break;
    case 'history':
      if(d.channel!==dcActive)return;
      if(d.reset){dcMessages=d.messages||[];dcRenderMessages();dcScroll(true)}
      else if(d.messages&&d.messages.length){
        const box=$('#dc-msgs'),prev=box.scrollHeight;
        dcMessages=[...d.messages,...dcMessages];dcRenderMessages();
        box.scrollTop=box.scrollHeight-prev;
      }
      break;
    case 'msg': dcOnMessage(d);break;
    case 'voice': window.voice?.setRoom(d.channel,d.members);break; // who's in a channel's voice (js/voice.js)
    case 'deleted':
      if(d.channel===dcActive){
        dcMessages=dcMessages.filter(m=>m.id!==d.id);
        dcMessages.forEach(m=>{if(m.replyTo&&m.replyTo.id===d.id)m.replyTo={id:d.id,missing:true}});
        if(dcReply&&dcReply.id===d.id)dcSetMode(null);
        if(dcEdit&&dcEdit.id===d.id)dcSetMode(null);
        dcRenderMessages();
      }
      break;
    case 'edited': {
      const m=d.message;if(!m||m.channel!==dcActive)break;
      const i=dcMessages.findIndex(x=>x.id===m.id);if(i>=0)dcMessages[i]={...dcMessages[i],...m};
      dcMessages.forEach(x=>{if(x.replyTo&&x.replyTo.id===m.id)x.replyTo={...x.replyTo,text:m.text.slice(0,140)}});
      dcRenderMessages();
      break;
    }
    case 'reactions': {
      if(d.channel!==dcActive)break;
      const m=dcMessages.find(x=>x.id===d.id);if(!m)break;
      m.reactions=d.reactions||[];
      dcBump={id:d.id,emoji:d.emoji};
      dcRenderMessages();dcBump=null;
      break;
    }
    case 'announce': dcAnnounce(d);break;
    case 'banned':
      dcBanned=d;
      toast(d.until?`You're banned from chat until ${new Date(d.until).toLocaleString()}.`:"You're banned from chat.",'err');
      dcSyncCompose();
      break;
    case 'typing': {
      if(d.name===chatMe||d.channel!==dcActive)break;
      d.on?dcTypers.set(d.name,Date.now()):dcTypers.delete(d.name);
      dcRenderTyping();break;
    }
    case 'join': case 'leave': break;
    case 'system': toast(d.text);break;
    case 'error': toast(d.text,'err');break;
    default: if(typeof d.type==='string'&&d.type.startsWith('call.'))window.calls?.onMessage(d);
  }
}

function dcUpsertProfile(p){
  const i=dcProfiles.findIndex(x=>x.username===p.username);
  if(i<0)dcProfiles.push(p);else dcProfiles[i]=p;
}

function dcMentionsMe(text){
  if(!chatMe||!text)return false;
  const me=chatMe.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(^|[^a-z0-9_-])@'+me+'(?![a-z0-9_-])','i').test(text);
}
function dcOnMessage(m){
  const mention=m.username!==chatMe&&dcMentionsMe(m.text);
  if(m.channel===dcActive){
    dcFresh.add(m.id);
    dcMessages.push(m);
    if(dcMessages.length>300)dcMessages=dcMessages.slice(-300);
    dcRenderMessages();
    if(m.username===chatMe||dcAtBottom)dcScroll();
    dcMarkSeen();
  }else{
    dcUnread[m.channel]=(dcUnread[m.channel]||0)+1;
    if(m.channel.startsWith('dm:')&&!dcDMs.some(x=>x.channel===m.channel)){
      dcDMs.push({channel:m.channel,with:m.username});
    }
    dcRenderChannels();
  }
  if(m.username!==chatMe){
    chatPing(mention);
    const open=$('#chat-window').classList.contains('show');
    if(!open)bumpBadge();
    const say=m.text||(m.file?(m.file.image?'📷 sent a picture':'📎 sent a file'):'');
    if(mention&&(!open||m.channel!==dcActive))toast(`${nameOf(m.username)} mentioned you: ${say.slice(0,80)}`,'ok');
    const dm=m.channel.startsWith('dm:');
    if(dm||mention)notify(dm?nameOf(m.username):`${nameOf(m.username)} mentioned you`,say,{tag:m.channel,onclick:()=>{openChat();if(m.channel!==dcActive)dcOpen(m.channel)}});
  }
}

/* channel + DM list ------------------------------------------- */
function dcOpen(slug){
  if(!slug)return;
  if(slug!==dcActive)dcUnstage(); // a staged file belongs to the channel it was uploaded into
  dcActive=slug;dcActiveIsDM=slug.startsWith('dm:');
  dcSetMode(null);
  dcTypers.clear();dcRenderTyping();
  delete dcUnread[slug];
  dcMessages=[];
  dcSend({type:'open',channel:slug});
  dcMarkSeen();
  dcRenderChannels();dcRenderHeader();dcRenderMessages();dcSyncCompose();
  $('#chat-window').classList.remove('show-side');
  setTimeout(()=>$('#dc-input').focus(),60);
}
function dcMarkSeen(){dcLastSeen[dcActive]=Date.now();put('dcLastSeen',dcLastSeen)}

function dcRenderChannels(){
  const list=$('#dc-channels'),frag=document.createDocumentFragment();
  dcChannels.forEach(c=>{
    const b=document.createElement('button');
    b.className='dc-ch'+(c.slug===dcActive?' active':'')+(dcUnread[c.slug]?' unread':'');
    b.innerHTML='<span class="hash">#</span><span class="nm"></span>';
    b.querySelector('.nm').textContent=c.name;
    if(c.locked){
      const l=document.createElement('span');l.className='lock';l.textContent='🔒';b.appendChild(l);
    }
    const vb=window.voice?.badge(c.slug);if(vb)b.appendChild(vb);
    const dot=document.createElement('span');dot.className='dot';b.appendChild(dot);
    b.onclick=()=>{click();dcOpen(c.slug)};
    frag.appendChild(b);
  });
  list.replaceChildren(frag);

  const dms=$('#dc-dms'),f2=document.createDocumentFragment();
  dcDMs.forEach(d=>{
    const b=document.createElement('button');
    b.className='dc-ch'+(d.channel===dcActive?' active':'')+(dcUnread[d.channel]?' unread':'');
    b.appendChild(avatar(d.with));
    const nm=document.createElement('span');nm.className='nm';nm.textContent=nameOf(d.with);b.appendChild(nm);
    const dot=document.createElement('span');dot.className='dot';b.appendChild(dot);
    b.onclick=()=>{click();dcOpen(d.channel)};
    f2.appendChild(b);
  });
  if(!dcDMs.length){
    const e=document.createElement('div');
    e.style.cssText='padding:6px 10px;font-size:.78em;color:var(--text-3)';
    e.textContent=chatMeAccount?'No DMs yet.':'Make an account to use DMs.';
    f2.appendChild(e);
  }
  dms.replaceChildren(f2);
  $('#dc-add-channel').hidden=rank(chatMeRole)<3;
}

function dcRenderHeader(){
  const dm=dcActiveIsDM;
  const ch=dcChannels.find(c=>c.slug===dcActive);
  const partner=dm?(dcDMs.find(d=>d.channel===dcActive)||{}).with:null;
  $('#dc-top-hash').textContent=dm?'@':'#';
  $('#dc-top-name').textContent=dm?nameOf(partner||''):(ch?ch.name:dcActive);
  $('#dc-top-topic').textContent=dm?'Direct message':(ch?ch.topic:'');
  $('#dc-edit-channel').hidden=dm||rank(chatMeRole)<3;
  $('#dc-call').hidden=!dm||!chatMeAccount;$('#dc-call').dataset.to=partner||'';
  $('#dc-del-channel').hidden=dm||rank(chatMeRole)<3||dcChannels.length<=1;
  const label=dm?'@'+nameOf(partner||''):'#'+(ch?ch.name:dcActive);
  $('#dc-input').placeholder='Message '+label;
  window.voice?.header();
}

/* messages ---------------------------------------------------- */
function dcDayLabel(ts){
  const d=new Date(ts),n=new Date();
  const a=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const b=new Date(n.getFullYear(),n.getMonth(),n.getDate());
  const diff=Math.round((b-a)/86400000);
  if(diff===0)return 'Today';
  if(diff===1)return 'Yesterday';
  return d.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
}
/* links open in the proxied browser; @names become clickable mentions */
function dcRichText(el,text){
  const re=/(https?:\/\/[^\s]+)|(^|[^a-z0-9_-])@([a-z0-9_-]{3,24})(?![a-z0-9_-])/gi;
  let last=0,m;
  while((m=re.exec(text))){
    if(m[1]){
      // each handler keeps its own URL; sharing the loop variable made every link point at null
      const url=m[1];
      if(m.index>last)el.appendChild(document.createTextNode(text.slice(last,m.index)));
      const a=document.createElement('a');
      a.textContent=url;a.href='#';a.title=url;
      a.onclick=ev=>{ev.preventDefault();closeChat();openBrowser(url)};
      el.appendChild(a);last=m.index+url.length;
    }else{
      const start=m.index+m[2].length,name=m[3].toLowerCase();
      if(start>last)el.appendChild(document.createTextNode(text.slice(last,start)));
      const sp=document.createElement('span');
      sp.className='dc-mention'+(name===chatMe?' me':'');
      sp.textContent='@'+m[3];
      sp.onclick=ev=>{ev.stopPropagation();dcUserMenu(name,sp)};
      el.appendChild(sp);last=start+1+m[3].length;
    }
  }
  if(last<text.length)el.appendChild(document.createTextNode(text.slice(last)));
}

const ICON={
  react:'<svg class="i i-sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
  reply:'<svg class="i i-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
  edit:'<svg class="i i-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  del:'<svg class="i i-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
};
function dcTool(title,icon,fn,cls=''){
  const b=document.createElement('button');b.title=title;b.className=cls;b.innerHTML=icon;
  b.onclick=e=>{e.stopPropagation();fn(e.currentTarget)};return b;
}
function dcCanPost(){
  const ch=dcChannels.find(c=>c.slug===dcActive);
  return chatReady&&!dcBanned&&!(!dcActiveIsDM&&ch&&ch.locked&&rank(chatMeRole)<2);
}

function dcRenderMessages(){
  const box=$('#dc-msgs'),frag=document.createDocumentFragment();

  const intro=document.createElement('div');
  intro.className='dc-intro';
  const ch=dcChannels.find(c=>c.slug===dcActive);
  const partner=dcActiveIsDM?(dcDMs.find(d=>d.channel===dcActive)||{}).with:null;
  intro.innerHTML='<h3></h3><p></p>';
  intro.querySelector('h3').textContent=dcActiveIsDM?nameOf(partner||''):'#'+(ch?ch.name:dcActive);
  intro.querySelector('p').textContent=dcActiveIsDM
    ? 'This is the start of your conversation. Only the two of you can see it.'
    : (ch&&ch.topic?ch.topic:'This is the beginning of the channel.');
  frag.appendChild(intro);

  const canPost=dcCanPost();
  let lastDay='',lastUser='',lastAt=0;
  dcMessages.forEach(m=>{
    const day=dcDayLabel(m.createdAt);
    if(day!==lastDay){
      const s=document.createElement('div');s.className='dc-day';s.textContent=day;
      frag.appendChild(s);lastDay=day;lastUser='';
    }
    // a reply always shows its header, so the quote has someone to belong to
    const fresh=m.username!==lastUser||m.createdAt-lastAt>7*60000||!!m.replyTo;
    const mine=m.username===chatMe;
    const row=document.createElement('div');
    row.className='dc-m'+(fresh?' fresh':'')+(mine?' own':'')
      +(!mine&&dcMentionsMe(m.text)?' mention':'')
      +(dcFresh.has(m.id)?' new':'')
      +(dcEdit&&dcEdit.id===m.id?' editing':'')
      +(dcReply&&dcReply.id===m.id?' replying':'');
    row.dataset.id=m.id;

    const stamp=document.createElement('span');
    stamp.className='stamp';
    stamp.textContent=new Date(m.createdAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    row.appendChild(stamp);

    row.appendChild(avatar(m.username));

    const body=document.createElement('div');body.className='dc-body';

    if(m.replyTo){
      const q=document.createElement('button');q.className='dc-quote';
      if(m.replyTo.missing){q.classList.add('gone');q.textContent='Original message was deleted'}
      else{
        const who=document.createElement('b');who.textContent=nameOf(m.replyTo.username);who.style.color=colorOf(m.replyTo.username);
        const sn=document.createElement('span');sn.textContent=m.replyTo.text;
        q.append(who,sn);
        q.onclick=()=>dcJumpTo(m.replyTo.id);
      }
      body.appendChild(q);
    }

    if(fresh){
      const head=document.createElement('div');head.className='dc-name';
      const b=document.createElement('b');
      b.textContent=nameOf(m.username);
      b.style.color=roleOf(m.username)==='member'?'':ROLE_COLOR[roleOf(m.username)]||colorOf(m.username);
      if(!b.style.color)b.style.color=colorOf(m.username);
      b.onclick=e=>dcUserMenu(m.username,e.currentTarget);
      head.appendChild(b);
      const r=roleOf(m.username);
      if(r!=='member'&&r!=='guest'){
        const tag=document.createElement('span');
        tag.className='dc-badge';tag.textContent=r;tag.style.background=ROLE_COLOR[r];
        head.appendChild(tag);
      }
      if(r==='guest'){
        const tag=document.createElement('span');
        tag.className='dc-badge';tag.textContent='guest';tag.style.background='var(--glass-3)';tag.style.color='var(--text-3)';
        head.appendChild(tag);
      }
      const when=document.createElement('span');
      when.className='when';
      when.textContent=new Date(m.createdAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
      head.appendChild(when);
      body.appendChild(head);
    }
    if(m.text||!m.file){
      const txt=document.createElement('div');txt.className='dc-text';
      dcRichText(txt,m.text);
      if(m.editedAt){
        const ed=document.createElement('span');ed.className='dc-edited';ed.textContent='(edited)';
        ed.title='Edited '+new Date(m.editedAt).toLocaleString();
        txt.appendChild(ed);
      }
      body.appendChild(txt);
    }
    if(m.file)body.appendChild(dcFileEl(m.file));

    if(m.reactions&&m.reactions.length){
      const rx=document.createElement('div');rx.className='dc-reacts';
      m.reactions.forEach(r=>{
        const chip=document.createElement('button');
        chip.className='dc-react'+(r.users.includes(chatMe)?' mine':'')+(dcBump&&dcBump.id===m.id&&dcBump.emoji===r.emoji?' bump':'');
        chip.title=r.users.map(nameOf).join(', ');
        const em=document.createElement('span');em.className='em';em.textContent=r.emoji;
        const n=document.createElement('span');n.className='n';n.textContent=r.users.length;
        chip.append(em,n);
        chip.onclick=e=>{e.stopPropagation();dcReact(m.id,r.emoji,chip)};
        rx.appendChild(chip);
      });
      if(canPost){
        const add=document.createElement('button');add.className='dc-react add';add.title='Add reaction';add.innerHTML=ICON.react;
        add.onclick=e=>{e.stopPropagation();dcEmojiPicker(m.id,add)};
        rx.appendChild(add);
      }
      body.appendChild(rx);
    }
    row.appendChild(body);

    const tools=document.createElement('div');tools.className='dc-tools';
    if(canPost){
      tools.appendChild(dcTool('Add reaction',ICON.react,el=>dcEmojiPicker(m.id,el)));
      tools.appendChild(dcTool('Reply',ICON.reply,()=>dcSetMode('reply',m)));
    }
    if(mine&&canPost)tools.appendChild(dcTool('Edit',ICON.edit,()=>dcSetMode('edit',m)));
    if(mine||rank(chatMeRole)>=2){
      tools.appendChild(dcTool('Delete message',ICON.del,()=>{if(confirm('Delete this message?'))dcSend({type:'delete',id:m.id})},'danger'));
    }
    if(tools.children.length)row.appendChild(tools);
    row.ondblclick=e=>{if(canPost&&!e.target.closest('a,button,.dc-mention')&&!getSelection().toString())dcReact(m.id,'❤️',row)};

    frag.appendChild(row);
    lastUser=m.username;lastAt=m.createdAt;
  });

  box.replaceChildren(frag);
  dcFresh.clear();
}

function dcJumpTo(id){
  const el=$(`#dc-msgs .dc-m[data-id="${id}"]`);
  if(!el)return toast('That message is further up. Scroll to load it.');
  el.scrollIntoView({behavior:S.motion?'auto':'smooth',block:'center'});
  el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');
}

/* reactions ---------------------------------------------------- */
function dcReact(id,emoji,from){
  if(!dcCanPost())return;
  const m=dcMessages.find(x=>x.id===id);
  const adding=!(m&&m.reactions&&m.reactions.some(r=>r.emoji===emoji&&r.users.includes(chatMe)));
  dcSend({type:'react',id,emoji});
  if(adding&&from)window.motion?.emojiBurst(emoji,from);
}
function dcEmojiPicker(id,anchor){
  const pop=$('#dc-emoji');
  pop.replaceChildren(...DC_EMOJI.map(e=>{
    const b=document.createElement('button');b.textContent=e;b.title=e;
    b.onclick=ev=>{ev.stopPropagation();pop.classList.remove('show');dcReact(id,e,anchor)};
    return b;
  }));
  pop.classList.add('show');
  const r=anchor.getBoundingClientRect(),pw=pop.offsetWidth,ph=pop.offsetHeight;
  pop.style.left=Math.max(10,Math.min(innerWidth-pw-10,r.right-pw))+'px';
  pop.style.top=(r.top-ph-8<10?r.bottom+8:r.top-ph-8)+'px';
}
document.addEventListener('pointerdown',e=>{
  const pop=$('#dc-emoji');
  if(pop.classList.contains('show')&&!pop.contains(e.target))pop.classList.remove('show');
},true);

/* reply / edit mode on the composer ------------------------------ */
function dcSetMode(mode,m){
  const input=$('#dc-input'),bar=$('#dc-replybar');
  const wasEdit=!!dcEdit;
  dcReply=mode==='reply'?m:null;
  dcEdit=mode==='edit'?m:null;
  if(!mode){
    bar.classList.remove('show');
    if(wasEdit){input.value='';dcGrow()}
  }else{
    $('#dc-reply-label').textContent=mode==='edit'?'Editing your message':'Replying to';
    $('#dc-reply-name').textContent=mode==='edit'?'':nameOf(m.username);
    $('#dc-reply-snip').textContent=(m.text||(m.file?'📎 '+(m.file.name||'file'):'')).slice(0,120);
    bar.classList.toggle('editing',mode==='edit');
    bar.classList.remove('show');void bar.offsetWidth;bar.classList.add('show');
    if(mode==='edit'){input.value=m.text;dcGrow()}
    setTimeout(()=>{input.focus();const n=input.value.length;input.setSelectionRange(n,n)},30);
  }
  dcSyncCompose();
  if($('#chat-window').classList.contains('show'))dcRenderMessages();
}
$('#dc-reply-cancel').onclick=()=>dcSetMode(null);

function dcScroll(instant){
  const box=$('#dc-msgs');
  if(instant)box.style.scrollBehavior='auto';
  box.scrollTop=box.scrollHeight;
  if(instant)requestAnimationFrame(()=>box.style.scrollBehavior='');
  dcAtBottom=true;
}

/* members ----------------------------------------------------- */
function dcRenderMembers(){
  const box=$('#dc-members'),frag=document.createDocumentFragment();
  const online=new Set(dcMembers.map(m=>m.name));
  const rows=[...dcMembers.map(m=>({name:m.name,role:m.role,online:true}))];
  dcProfiles.forEach(p=>{if(!online.has(p.username))rows.push({name:p.username,role:p.role,online:false})});

  const groups={};
  rows.forEach(r=>{(groups[r.role]=groups[r.role]||[]).push(r)});
  ['owner','admin','mod','member','guest'].forEach(role=>{
    const g=groups[role];
    if(!g||!g.length)return;
    const h=document.createElement('div');
    h.className='dc-cat';
    h.textContent=(role==='mod'?'moderator':role)+' — '+g.length;
    frag.appendChild(h);
    g.sort((a,b)=>Number(b.online)-Number(a.online)||a.name.localeCompare(b.name)).forEach(r=>{
      const b=document.createElement('button');
      b.className='dc-mem'+(r.online?'':' off');
      b.appendChild(avatar(r.name));
      const nm=document.createElement('span');
      nm.className='nm';nm.textContent=nameOf(r.name);
      if(ROLE_COLOR[r.role])nm.style.color=ROLE_COLOR[r.role];
      b.appendChild(nm);
      b.onclick=e=>dcUserMenu(r.name,e.currentTarget);
      frag.appendChild(b);
    });
  });
  box.replaceChildren(frag);
}

function dcRenderMe(){
  const p=profileFor(chatMe)||{};
  $('#dc-me-av').textContent=(nameOf(chatMe||'?')[0]||'?');
  $('#dc-me-av').style.background=colorOf(chatMe||'?');
  $('#dc-me-name').textContent=nameOf(chatMe||'…');
  const r=chatMeRole;
  $('#dc-me-role').textContent=r==='guest'?'guest — no account':r;
  $('#dc-me-role').style.color=ROLE_COLOR[r]||'';
  $('#dc-me-edit').hidden=!chatMeAccount;
}

function dcRenderAll(){dcRenderChannels();dcRenderHeader();dcRenderMessages();dcRenderMembers();dcRenderMe();dcSyncCompose()}

/* user menu --------------------------------------------------- */
function dcUserMenu(name,anchor){
  const pop=$('#dc-user-pop');
  const r=roleOf(name),me=name===chatMe;
  const myRank=rank(chatMeRole),theirRank=rank(r);
  const p=profileFor(name)||{};

  pop.replaceChildren();
  const who=document.createElement('div');who.className='who';
  who.appendChild(avatar(name));
  const nm=document.createElement('div');nm.className='nm';
  const b=document.createElement('b');b.textContent=nameOf(name);
  if(ROLE_COLOR[r])b.style.color=ROLE_COLOR[r];
  const sm=document.createElement('small');sm.textContent='@'+name+' · '+r;
  nm.append(b,sm);who.appendChild(nm);
  pop.appendChild(who);

  if(p.bio){const bio=document.createElement('div');bio.className='bio';bio.textContent=p.bio;pop.appendChild(bio)}

  const item=(label,fn,danger,disabled)=>{
    const el=document.createElement('button');
    el.className='item'+(danger?' danger':'');
    el.textContent=label;el.disabled=!!disabled;
    el.onclick=()=>{pop.classList.remove('show');fn()};
    pop.appendChild(el);return el;
  };

  if(!me&&!name.startsWith('guest-')){
    item(chatMeAccount?'Message':'Message (account needed)',()=>dcSend({type:'dm.open',name}),false,!chatMeAccount);
    item(chatMeAccount?'Voice call':'Voice call (account needed)',()=>window.calls?.start(name),false,!chatMeAccount);
  }

  const canRole=myRank>=3&&theirRank<myRank&&name!==chatOwner&&!name.startsWith('guest-');
  if(canRole){
    const sep=document.createElement('div');sep.className='sep';pop.appendChild(sep);
    const h=document.createElement('h4');h.textContent='Role';pop.appendChild(h);
    chatRoles.forEach(role=>{
      if(rank(role)>=myRank)return;
      item((role===r?'✓ ':'')+role,()=>dcSend({type:'role.set',name,role}));
    });
  }

  if(myRank>=2&&theirRank<myRank&&!me){
    const sep=document.createElement('div');sep.className='sep';pop.appendChild(sep);
    item('Time out 5 min',()=>dcSend({type:'timeout',name,minutes:5,channel:dcActive}),true);
    item('Time out 1 hour',()=>dcSend({type:'timeout',name,minutes:60,channel:dcActive}),true);
    item('Lift timeout',()=>dcSend({type:'untimeout',name}));
  }
  if(myRank>=3&&theirRank<myRank&&!me){
    item('Ban for 1 day',()=>{if(confirm(`Ban ${name} from chat for a day?`))dcSend({type:'ban',name,hours:24})},true);
    item('Ban permanently',()=>{if(confirm(`Ban ${name} from chat for good?`))dcSend({type:'ban',name,hours:null})},true);
    item('Unban',()=>dcSend({type:'unban',name}));
  }
  if(!me&&chatMeAccount&&!dcActiveIsDM&&dcCanPost()){
    item('Mention',()=>{const i=$('#dc-input');i.value=(i.value&&!/\s$/.test(i.value)?i.value+' ':i.value)+'@'+name+' ';i.focus();dcSyncCompose()});
  }

  pop.classList.add('show');
  const rect=anchor.getBoundingClientRect(),ph=pop.offsetHeight,pw=pop.offsetWidth;
  let top=Math.min(rect.top,innerHeight-ph-12),left=rect.left-pw-10;
  if(left<10)left=Math.min(rect.right+10,innerWidth-pw-10);
  pop.style.top=Math.max(10,top)+'px';
  pop.style.left=Math.max(10,left)+'px';
}
document.addEventListener('pointerdown',e=>{
  const pop=$('#dc-user-pop');
  if(pop.classList.contains('show')&&!pop.contains(e.target))pop.classList.remove('show');
},true);

/* dialogs ----------------------------------------------------- */
let dcModalOk=null;
/* onOk may be async; throwing keeps the dialog open and shows the message */
function dcModal({title,sub,fields,okLabel='Save',onOk,danger=false}){
  $('#dc-modal-title').textContent=title;
  $('#dc-modal-sub').textContent=sub||'';
  $('#dc-modal-err').textContent='';
  $('#dc-modal-ok').classList.toggle('danger',danger);
  $('#dc-modal-ok').classList.toggle('primary',!danger);
  const box=$('#dc-modal-fields');box.replaceChildren();
  fields.forEach(f=>{
    const wrap=document.createElement('div');
    const lab=document.createElement('label');lab.textContent=f.label;wrap.appendChild(lab);
    let input;
    if(f.type==='textarea'){input=document.createElement('textarea');input.rows=f.rows||3}
    else{input=document.createElement('input');input.type=f.type||'text'}
    input.className='field';input.id='dcf-'+f.key;
    input.value=f.value||'';
    if(f.readonly)input.readOnly=true;
    if(f.type==='password')input.autocomplete=f.autocomplete||'current-password';
    if(f.type!=='textarea')input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#dc-modal-ok').click()}});
    if(f.placeholder)input.placeholder=f.placeholder;
    if(f.maxlength)input.maxLength=f.maxlength;
    wrap.appendChild(input);box.appendChild(wrap);
  });
  $('#dc-modal-ok').textContent=okLabel;
  dcModalOk=()=>{
    const out={};
    fields.forEach(f=>{out[f.key]=$('#dcf-'+f.key).value});
    return onOk(out);
  };
  $('#dc-modal').classList.add('show');
  setTimeout(()=>{const first=box.querySelector('.field');if(first)first.focus()},60);
}
function dcCloseModal(){$('#dc-modal').classList.remove('show');dcModalOk=null}
$('#dc-modal-cancel').onclick=dcCloseModal;
$('#dc-modal-ok').onclick=async()=>{
  const ok=$('#dc-modal-ok');if(!dcModalOk||ok.disabled)return;
  ok.disabled=true;
  try{await dcModalOk();dcCloseModal()}
  catch(e){$('#dc-modal-err').textContent=e.message||String(e);window.motion?.shake($('#dc-modal .dc-card'))}
  finally{ok.disabled=false}
};
$('#dc-modal').onclick=e=>{if(e.target===$('#dc-modal'))dcCloseModal()};

$('#dc-add-channel').onclick=()=>dcModal({
  title:'New channel',sub:'Letters, numbers and dashes. Admins and the owner only.',
  okLabel:'Create',
  fields:[{key:'name',label:'Name',placeholder:'homework-help',maxlength:24},
          {key:'topic',label:'Topic',placeholder:'What is this for?',maxlength:120}],
  onOk:v=>{if(v.name.trim())dcSend({type:'channel.create',name:v.name,topic:v.topic})}
});

$('#dc-edit-channel').onclick=()=>{
  const ch=dcChannels.find(c=>c.slug===dcActive);
  if(!ch)return;
  dcModal({
    title:'Edit #'+ch.name,
    sub:'Set "locked" to yes so only mods and above can post.',
    fields:[{key:'name',label:'Name',value:ch.name,maxlength:24},
            {key:'topic',label:'Topic',value:ch.topic,maxlength:120},
            {key:'locked',label:'Locked (yes/no)',value:ch.locked?'yes':'no'}],
    onOk:v=>dcSend({type:'channel.update',channel:ch.slug,name:v.name,topic:v.topic,locked:/^y/i.test(v.locked)})
  });
};

$('#dc-del-channel').onclick=()=>{
  const ch=dcChannels.find(c=>c.slug===dcActive);
  if(!ch)return;
  if(confirm(`Delete #${ch.name} and every message in it? This cannot be undone.`)){
    dcSend({type:'channel.delete',channel:ch.slug});
  }
};

$('#dc-new-dm').onclick=()=>{
  if(!chatMeAccount)return toast('Make an account to use DMs.','err');
  dcModal({
    title:'New direct message',sub:'Type the username you want to message.',
    okLabel:'Open',
    fields:[{key:'name',label:'Username',placeholder:'lena',maxlength:24}],
    onOk:v=>{const n=v.name.trim().toLowerCase();if(n)dcSend({type:'dm.open',name:n})}
  });
};

$('#dc-me-edit').onclick=()=>{
  const p=profileFor(chatMe)||{};
  dcModal({
    title:'Your profile',sub:'How you appear to everyone else.',
    fields:[{key:'displayName',label:'Display name',value:p.displayName||chatMe,maxlength:24},
            {key:'color',label:'Color',type:'color',value:p.color||'#4f8cff'},
            {key:'bio',label:'About you',type:'textarea',value:p.bio||'',maxlength:160}],
    onOk:v=>dcSend({type:'profile.set',displayName:v.displayName,color:v.color,bio:v.bio})
  });
};

/* composer ---------------------------------------------------- */
function dcSyncCompose(){
  const ch=dcChannels.find(c=>c.slug===dcActive);
  const locked=!dcActiveIsDM&&ch&&ch.locked&&rank(chatMeRole)<2;
  const input=$('#dc-input');
  input.disabled=!chatReady||locked||!!dcBanned;
  $('#dc-send').disabled=input.disabled||(!input.value.trim()&&!dcFile);
  $('#dc-attach').hidden=!chatMeAccount;$('#dc-attach').disabled=input.disabled||!!dcEdit;
  $('#dc-hint').textContent=dcBanned?(dcBanned.until?`You're banned from chat until ${new Date(dcBanned.until).toLocaleString()}.`:"You're banned from chat.")
    :!chatReady?'Connecting…'
    :locked?'This channel is locked. Only moderators and above can post.'
    :dcEdit?'Enter to save · Esc to cancel'
    :dcReply?'Enter to reply · Esc to cancel'
    :'Enter to send · Shift+Enter for a new line · ↑ to edit your last message · @ to mention';
}
function dcGrow(){const i=$('#dc-input');i.style.height='auto';i.style.height=Math.min(i.scrollHeight,180)+'px'}
function dcSignalTyping(on){
  const want=on?dcActive:null;
  if(want===dcTypingSent)return;
  if(dcTypingSent)dcSend({type:'typing',channel:dcTypingSent,on:false});
  if(want)dcSend({type:'typing',channel:want,on:true});
  dcTypingSent=want;
}
function sendChat(){
  const i=$('#dc-input'),t=i.value.trim();
  if(!t&&!(dcFile&&!dcEdit))return;
  if(!chatReady)return toast('Not connected yet.','err');
  if(dcEdit){
    if(!t)return;
    if(t!==dcEdit.text&&!dcSend({type:'edit',id:dcEdit.id,text:t}))return;
    i.value='';dcSetMode(null);dcGrow();return;
  }
  if(dcFile&&!dcFile.id){dcFile.send=true;dcRenderStage();return} // goes as soon as the upload is done
  if(!dcSend({type:'msg',channel:dcActive,text:t,replyTo:dcReply?dcReply.id:undefined,file:dcFile?.id}))return;
  if(dcFile){if(dcFile.url)URL.revokeObjectURL(dcFile.url);dcFile=null;dcRenderStage()}
  dcSignalTyping(false);clearTimeout(dcTypingT);
  i.value='';dcGrow();
  if(dcReply)dcSetMode(null);else dcSyncCompose();
  window.motion?.pop($('#dc-send'));
}
$('#dc-send').onclick=sendChat;

/* pictures and files (files.js on the server): picked, pasted or dropped in, uploaded
   straight away into this channel, and sent with the next message (with or without text) */
const DC_MAX_FILE=8*1024*1024;
const dcFmtSize=n=>n<1024?n+' B':n<1048576?Math.round(n/1024)+' KB':(n/1048576).toFixed(1)+' MB';
function dcStage(file){
  if(!file)return;
  if(!chatMeAccount)return toast('Make an account to share pictures and files.','err');
  if(dcEdit)return toast('Finish editing first.','err');
  if($('#dc-input').disabled)return;
  if(file.size>DC_MAX_FILE)return toast('Files can be up to 8 MB.','err');
  dcUnstage();
  const f={file,id:null,pct:0,xhr:null,url:/^image\//.test(file.type)?URL.createObjectURL(file):null,send:false,channel:dcActive};
  dcFile=f;dcRenderStage();dcSyncCompose();
  const x=new XMLHttpRequest();f.xhr=x;
  x.open('POST',`/api/chat/files?channel=${encodeURIComponent(dcActive)}&name=${encodeURIComponent(file.name||'pasted-picture.png')}`);
  x.setRequestHeader('content-type','application/octet-stream');
  x.upload.onprogress=e=>{if(dcFile===f&&e.lengthComputable){f.pct=Math.round(e.loaded*100/e.total);dcRenderStage()}};
  x.onload=()=>{
    if(dcFile!==f)return;
    let d={};try{d=JSON.parse(x.responseText)}catch(_){}
    if(x.status!==200||!d.id){toast(d.error||`Upload failed (${x.status}).`,'err');dcUnstage();return}
    f.id=d.id;f.pct=100;f.xhr=null;dcRenderStage();dcSyncCompose();
    if(f.send)sendChat();
  };
  x.onerror=()=>{if(dcFile===f){toast('Upload failed. Check your connection.','err');dcUnstage()}};
  x.send(file);
  $('#dc-input').focus();
}
function dcUnstage(){
  if(!dcFile)return;
  try{dcFile.xhr?.abort()}catch(_){}
  if(dcFile.url)URL.revokeObjectURL(dcFile.url);
  dcFile=null;dcRenderStage();dcSyncCompose();
}
function dcRenderStage(){
  const box=$('#dc-att-stage');box.hidden=!dcFile;
  if(!dcFile){box.replaceChildren();return}
  box.innerHTML=`${dcFile.url?'<img alt="">':'<span class="ic">📎</span>'}<span class="nm"></span><small></small><button type="button" title="Remove" aria-label="Remove">✕</button>`;
  if(dcFile.url)box.querySelector('img').src=dcFile.url;
  box.querySelector('.nm').textContent=dcFile.file.name||'picture';
  box.querySelector('small').textContent=dcFile.id?dcFmtSize(dcFile.file.size):dcFile.send?`Sending when uploaded… ${dcFile.pct}%`:`Uploading ${dcFile.pct}%`;
  box.querySelector('button').onclick=()=>{click();dcUnstage()};
}
/* a message's picture (shown, tap for full size) or file (a download) */
function dcFileEl(f){
  if(f.missing){const d=document.createElement('div');d.className='dc-att gone';d.textContent='This file is no longer available.';return d}
  const url='/api/chat/files/'+encodeURIComponent(f.id);
  if(f.image){
    const b=document.createElement('button');b.className='dc-img';b.title=f.name;
    const img=document.createElement('img');img.alt=f.name;img.loading='lazy';img.src=url;
    if(f.w&&f.h){const sc=Math.min(1,360/f.w,280/f.h);img.width=Math.max(1,Math.round(f.w*sc));img.height=Math.max(1,Math.round(f.h*sc))}
    img.onload=()=>{if(dcAtBottom)dcScroll()};
    img.onerror=()=>{b.replaceWith(dcFileEl({missing:true}))};
    b.appendChild(img);b.onclick=()=>dcViewImage(f,url);
    return b;
  }
  const a=document.createElement('a');a.className='dc-att';a.href=url+'?download=1';a.download=f.name;
  a.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/></svg><span class="nm"></span><small></small>';
  a.querySelector('.nm').textContent=f.name;a.querySelector('small').textContent=dcFmtSize(f.size||0);
  return a;
}
function dcViewImage(f,url){
  const v=$('#dc-viewer');
  v.querySelector('img').src=url;v.querySelector('img').alt=f.name;
  v.querySelector('.nm').textContent=f.name;
  const dl=v.querySelector('a');dl.href=url+'?download=1';dl.download=f.name;
  v.hidden=false;
}
$('#dc-viewer').addEventListener('click',e=>{if(e.target===e.currentTarget||e.target.id==='dc-viewer-x')$('#dc-viewer').hidden=true});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#dc-viewer').hidden){e.stopPropagation();$('#dc-viewer').hidden=true}},true);
$('#dc-attach').onclick=()=>{click();$('#dc-file').click()};
$('#dc-file').onchange=e=>{dcStage(e.target.files[0]);e.target.value=''};
$('#dc-input').addEventListener('paste',e=>{const f=[...(e.clipboardData?.files||[])][0];if(f){e.preventDefault();dcStage(f)}});
$('.dc-main').addEventListener('dragover',e=>{if([...(e.dataTransfer?.types||[])].includes('Files')){e.preventDefault();$('.dc-main').classList.add('dropping')}});
$('.dc-main').addEventListener('dragleave',e=>{if(!e.currentTarget.contains(e.relatedTarget))$('.dc-main').classList.remove('dropping')});
$('.dc-main').addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0];$('.dc-main').classList.remove('dropping');if(f){e.preventDefault();dcStage(f)}});
$('#dc-input').addEventListener('input',()=>{
  dcGrow();dcSyncCompose();dcSuggest();
  if(dcEdit)return; // editing isn't typing a new message
  if($('#dc-input').value.trim()){
    dcSignalTyping(true);
    clearTimeout(dcTypingT);
    dcTypingT=setTimeout(()=>dcSignalTyping(false),2500);
  }else dcSignalTyping(false);
});
$('#dc-input').addEventListener('keydown',e=>{
  const sug=$('#dc-suggest');
  if(sug.classList.contains('show')){
    const items=$$('button',sug),cur=items.findIndex(b=>b.classList.contains('on'));
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      const n=(cur+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
      items.forEach((b,i)=>b.classList.toggle('on',i===n));return;
    }
    if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();(items[cur]||items[0]).click();return}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();sug.classList.remove('show');return}
  }
  if(e.key==='Escape'&&(dcEdit||dcReply)){e.preventDefault();e.stopPropagation();dcSetMode(null);return}
  if(e.key==='ArrowUp'&&!e.target.value&&!dcEdit){
    const last=[...dcMessages].reverse().find(m=>m.username===chatMe);
    if(last){e.preventDefault();dcSetMode('edit',last)}
    return;
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}
});

/* @mention autocomplete ------------------------------------------ */
function dcSuggest(){
  const i=$('#dc-input'),sug=$('#dc-suggest');
  const before=i.value.slice(0,i.selectionStart);
  const m=/(^|\s)@([a-z0-9_-]{0,24})$/i.exec(before);
  if(!m){sug.classList.remove('show');return}
  const q=m[2].toLowerCase();
  const names=new Map();
  dcMembers.forEach(x=>names.set(x.name,true));
  dcProfiles.forEach(p=>{if(!names.has(p.username))names.set(p.username,false)});
  const list=[...names].filter(([n])=>n!==chatMe&&!n.startsWith('guest-')&&(n.includes(q)||nameOf(n).toLowerCase().includes(q)))
    .sort((a,b)=>Number(b[1])-Number(a[1])||a[0].localeCompare(b[0])).slice(0,6);
  if(!list.length){sug.classList.remove('show');return}
  sug.replaceChildren(...list.map(([n,online],idx)=>{
    const b=document.createElement('button');b.className=idx===0?'on':'';
    b.appendChild(avatar(n));
    const nm=document.createElement('span');nm.textContent=nameOf(n);
    const at=document.createElement('small');at.textContent='@'+n+(online?' · online':'');
    b.append(nm,at);
    b.onmousedown=e=>e.preventDefault();
    b.onclick=()=>{
      const start=before.length-m[2].length;
      i.value=i.value.slice(0,start)+n+' '+i.value.slice(i.selectionStart);
      const pos=start+n.length+1;i.setSelectionRange(pos,pos);
      sug.classList.remove('show');i.focus();dcSyncCompose();
    };
    return b;
  }));
  sug.classList.add('show');
}
$('#dc-input').addEventListener('click',dcSuggest);

/* announcements --------------------------------------------------- */
let annT=null;
function dcAnnounce(d){
  const el=$('#announce');
  el.replaceChildren();
  const ic=document.createElement('span');ic.className='mega';ic.textContent='📣';
  const tx=document.createElement('div');
  const b=document.createElement('b');b.textContent='Announcement from '+nameOf(d.by||'the owner');
  const p=document.createElement('p');p.textContent=d.text;
  tx.append(b,p);
  const x=document.createElement('button');x.innerHTML='<svg class="i i-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';x.title='Dismiss';
  x.onclick=()=>el.classList.remove('show');
  el.append(ic,tx,x);
  el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  chatPing(true);
  clearTimeout(annT);annT=setTimeout(()=>el.classList.remove('show'),12000);
}
$('#dc-input').addEventListener('blur',()=>dcSignalTyping(false));
$('#dc-msgs').addEventListener('scroll',()=>{
  const b=$('#dc-msgs');
  dcAtBottom=b.scrollHeight-b.scrollTop-b.clientHeight<80;
  if(b.scrollTop<40&&dcMessages.length)dcSend({type:'more',channel:dcActive,before:dcMessages[0].id});
});

function dcRenderTyping(){
  const box=$('#dc-typing'),names=[...dcTypers.keys()].map(nameOf);
  if(!names.length){box.classList.remove('on');return}
  $('#dc-typing-text').textContent=
    names.length===1?`${names[0]} is typing…`:
    names.length===2?`${names[0]} and ${names[1]} are typing…`:
    `${names.length} people are typing…`;
  box.classList.add('on');
}

/* badge ------------------------------------------------------- */
function bumpBadge(){
  const b=$('#chat-badge');
  const n=(parseInt(b.textContent,10)||0)+1;
  b.textContent=n>99?'99+':n;b.classList.add('show');
}
function clearBadge(){const b=$('#chat-badge');b.textContent='0';b.classList.remove('show')}

/* window ------------------------------------------------------ */
function toggleChat(){const w=$('#chat-window');if(w.classList.contains('show'))closeChat();else openChat()}
function openChat(){
  const w=$('#chat-window');
  w.classList.remove('closing');w.classList.add('show');
  $('#tb-chat').classList.add('active');
  closeAllPanels();
  clearBadge();
  connectChat();
  dcRenderMe();
  setTimeout(()=>{dcScroll(true);$('#dc-input').focus()},80);
}
function closeChat(){
  const w=$('#chat-window');
  if(!w.classList.contains('show'))return;
  dcSignalTyping(false);
  $('#dc-user-pop').classList.remove('show');
  $('#dc-emoji').classList.remove('show');
  $('#dc-suggest').classList.remove('show');
  dcCloseModal();
  w.classList.add('closing');
  onCloseDone(w,()=>w.classList.remove('show','closing'));
  $('#tb-chat').classList.remove('active');
}
$('#dc-close').onclick=closeChat;
$('#dc-toggle-members').onclick=()=>$('#chat-window').classList.toggle('hide-members');

/* ═══════════════════════════════════════════════════════════
   ADMIN DASHBOARD (owner only; every call is checked server-side)
   ═══════════════════════════════════════════════════════════ */
let adData=null,adTimer=null,adFilter='';
function openAdmin(){
  if(currentRole!=='owner')return toast('The admin dashboard is for the owner.','err');
  openPanel('admin-panel');adRefresh();
  clearInterval(adTimer);
  adTimer=setInterval(()=>{if($('#admin-panel').classList.contains('show')&&!document.hidden)adRefresh();else if(!$('#admin-panel').classList.contains('show'))clearInterval(adTimer)},5000);
}
async function adRefresh(){
  const live=$('#ad-live');
  try{
    const r=await fetch('/api/admin/overview',{cache:'no-store'});
    if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'HTTP '+r.status);
    adData=await r.json();live.classList.remove('err');live.lastChild.textContent='Live';adRender();
  }catch(e){live.classList.add('err');live.lastChild.textContent=' '+e.message}
}
async function adAct(url,body,method='POST',done){
  try{await postJSON(url,body,method);if(done)toast(done,'ok');adRefresh()}
  catch(e){toast(e.message,'err')}
}
const adAgo=t=>{if(!t)return'never';const s=Math.max(0,Math.round((Date.now()-t)/1000));return s<60?s+'s ago':s<3600?Math.round(s/60)+'m ago':s<86400?Math.round(s/3600)+'h ago':Math.round(s/86400)+'d ago'};
const adLeft=t=>{if(!t)return'';const s=Math.max(0,Math.round((t-Date.now())/1000));return s<60?s+'s left':s<3600?Math.round(s/60)+'m left':Math.round(s/3600)+'h left'};
function adRow(main,sub,actions=[],cls=''){
  const row=document.createElement('div');row.className='ad-row '+cls;
  const txt=document.createElement('div');txt.className='t';
  const b=document.createElement('b');b.textContent=main;const sm=document.createElement('small');sm.textContent=sub;
  txt.append(b,sm);row.appendChild(txt);
  const acts=document.createElement('div');acts.className='a';
  actions.forEach(a=>{if(!a)return;const el=a.el||document.createElement('button');if(!a.el){el.className='btn sm'+(a.danger?' danger':'');el.textContent=a.label;el.onclick=a.fn}acts.appendChild(el)});
  row.appendChild(acts);return row;
}
function adEmpty(text){const e=document.createElement('div');e.className='ad-empty';e.textContent=text;return e}
function adCount(el,n){
  const prev=+el.dataset.n||0;el.dataset.n=n;
  if(prev===n){el.textContent=n;return}
  window.motion?.countUp(el,prev,n)||(el.textContent=n);
}
function adRender(){
  const d=adData;if(!d)return;
  /* stat tiles */
  const stats=$('#ad-stats');
  const tiles=[['online','Online now',d.counts.online],['accounts','Accounts',d.counts.accounts],['vms','Live VMs',d.counts.vms],['messages','Messages',d.counts.messages],['pcs','Remote PCs',d.remote.agents.length]];
  if(!stats.children.length)stats.innerHTML=tiles.map(t=>`<div class="ad-stat" data-k="${t[0]}"><b data-n="0">0</b><span>${t[1]}</span></div>`).join('');
  tiles.forEach(t=>adCount($(`.ad-stat[data-k="${t[0]}"] b`,stats),t[2]));

  /* VMs */
  $('#ad-vms-n').textContent=d.vms.length||'';
  $('#ad-vms').replaceChildren(...(d.vms.length?d.vms.map(v=>adRow(`${v.kind==='gpu'?'GPU':'Desktop'} · ${v.owner}`,`${v.id.slice(0,14)} · started ${adAgo(v.startedAt)} · ${adLeft(v.expiresAt)}`,[{label:'Stop',danger:true,fn:()=>{if(confirm(`Stop ${v.owner}'s VM now?`))adAct(`/api/admin/vms/${encodeURIComponent(v.id)}/kill`,null,'POST','VM stopped')}}])):[adEmpty('No VMs running.')]));

  /* online */
  $('#ad-online-n').textContent=d.online.length||'';
  const seen=new Set();
  const online=d.online.filter(o=>!seen.has(o.name)&&seen.add(o.name));
  $('#ad-online').replaceChildren(...(online.length?online.map(o=>adRow(o.name,`${o.role} · here ${adAgo(o.since).replace(' ago','')}`,o.role==='owner'?[]:[
    {label:'Kick',fn:()=>adAct(`/api/admin/users/${encodeURIComponent(o.name)}/kick`,null,'POST',`${o.name} kicked`)},
    {label:'Mute',fn:()=>adMute(o.name)},
    {label:'Ban',danger:true,fn:()=>adBan(o.name)}
  ],'role-'+o.role)):[adEmpty('Nobody is connected to chat.')]));

  /* accounts */
  $('#ad-users-n').textContent=d.users.length||'';
  const users=d.users.filter(u=>!adFilter||u.username.includes(adFilter)||(u.displayName||'').toLowerCase().includes(adFilter));
  $('#ad-users').replaceChildren(...(users.length?users.slice(0,150).map(u=>{
    if(u.role==='owner')return adRow(u.username,`owner · seen ${adAgo(u.lastSeen)}`,[],'role-owner');
    const sel=document.createElement('select');sel.className='field ad-role';
    ['admin','mod','member'].forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;o.selected=u.role===r;sel.appendChild(o)});
    sel.onchange=()=>adAct(`/api/admin/users/${encodeURIComponent(u.username)}/role`,{role:sel.value},'POST',`${u.username} is now ${sel.value}`);
    return adRow(u.displayName!==u.username?`${u.displayName} (@${u.username})`:u.username,`joined ${adAgo(u.createdAt)} · seen ${adAgo(u.lastSeen)}`,[
      {el:sel},
      {label:'Sign out',fn:()=>{if(confirm(`Sign ${u.username} out on every device?`))adAct(`/api/admin/users/${encodeURIComponent(u.username)}/signout`,null,'POST',`${u.username} signed out`)}},
      {label:'Ban',danger:true,fn:()=>adBan(u.username)},
      {label:'Delete',danger:true,fn:()=>{if(prompt(`Type ${u.username} to delete this account and all its messages.`)===u.username)adAct(`/api/admin/users/${encodeURIComponent(u.username)}`,null,'DELETE','Account deleted')}}
    ],'role-'+u.role);
  }):[adEmpty(adFilter?'No accounts match.':'No accounts yet.')]));

  /* sanctions */
  $('#ad-sanctions-n').textContent=d.sanctions.length||'';
  $('#ad-sanctions').replaceChildren(...(d.sanctions.length?d.sanctions.map(x=>adRow(`${x.username} · ${x.kind==='ban'?'banned':'muted'}`,`${x.until?adLeft(x.until):'permanent'} · by ${x.by}${x.reason?' · '+x.reason:''}`,[
    {label:x.kind==='ban'?'Unban':'Unmute',fn:()=>adAct(`/api/admin/sanctions/${encodeURIComponent(x.username)}/${x.kind}`,null,'DELETE',`${x.username} ${x.kind==='ban'?'unbanned':'unmuted'}`)}
  ],'kind-'+x.kind)):[adEmpty('Nobody is muted or banned.')]));

  /* remote */
  const rm=d.remote;
  $('#ad-remote').replaceChildren(...(!rm.configured?[adEmpty('Off. Set REMOTE_KEY on the server to enable it.')]:rm.agents.length?rm.agents.map(a=>adRow(a.name,`${a.meta?a.meta.w+'×'+a.meta.h+(a.meta.monitors&&a.meta.monitors.length>1?` · ${a.meta.monitors.length} screens`:''):'starting'} · online ${adAgo(a.since).replace(' ago','')} · ${a.viewers} watching`,[{label:'Open',fn:()=>{closePanel('admin-panel');openRemote()}}])):[adEmpty('No PCs connected. Run the agent on one.')]));

  /* server */
  const up=d.server.uptime,h=Math.floor(up/3600),m=Math.floor(up%3600/60);
  const kv=[['Uptime',h?`${h}h ${m}m`:`${m}m`],['Memory',`${d.server.rssMb} MB (heap ${d.server.heapMb} MB)`],['Node',d.server.node],['Desktop VMs (E2B)',d.server.e2bConfigured?'configured':'no API key'],['GPU VMs (XENV)',d.server.xenvConfigured?'configured':'no API key']];
  $('#ad-server').innerHTML=kv.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

  /* activity */
  const feed=$('#ad-activity');
  feed.replaceChildren(...(d.activity.length?d.activity.map(a=>{const el=document.createElement('div');el.className='ad-ev k-'+a.kind;const t=document.createElement('time');t.textContent=new Date(a.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});const tx=document.createElement('span');tx.textContent=a.text;el.append(t,tx);return el}):[adEmpty('Nothing yet. Sign-ups, logins, VMs and moderation show up here.')]));
}
function adMute(name){
  dcModal({title:`Mute ${name}`,sub:'They can still read chat but cannot post, react or edit.',okLabel:'Mute',
    fields:[{key:'minutes',label:'Minutes',type:'number',value:'30'},{key:'reason',label:'Reason (optional)',maxlength:200}],
    onOk:v=>postJSON(`/api/admin/users/${encodeURIComponent(name)}/mute`,{minutes:+v.minutes||30,reason:v.reason}).then(()=>{toast(`${name} muted`,'ok');adRefresh()})});
}
function adBan(name){
  dcModal({title:`Ban ${name}`,danger:true,sub:'Kicks them from chat and keeps them out. Leave hours empty for a permanent ban. Guest bans also follow their network address.',okLabel:'Ban',
    fields:[{key:'hours',label:'Hours (empty = permanent)',type:'number',placeholder:'permanent'},{key:'reason',label:'Reason (optional)',maxlength:200}],
    onOk:v=>postJSON(`/api/admin/users/${encodeURIComponent(name)}/ban`,{hours:v.hours.trim()?+v.hours:null,reason:v.reason}).then(()=>{toast(`${name} banned`,'ok');adRefresh()})});
}
$('#admin-refresh').onclick=()=>{adRefresh();window.motion?.spin($('#admin-refresh'))};
$('#ad-user-filter').addEventListener('input',e=>{adFilter=e.target.value.trim().toLowerCase();adRender()});
$('#ad-announce').addEventListener('submit',async e=>{
  e.preventDefault();const i=$('#ad-announce-text'),t=i.value.trim();if(!t)return;
  try{await postJSON('/api/admin/announce',{text:t});i.value='';toast('Announcement sent','ok');adRefresh()}catch(err){toast(err.message,'err')}
});

/* install as an app (PWA). Chrome hands us the prompt once it decides the
   site is installable; other browsers get instructions instead. */
let installPrompt=null;
const installed=()=>matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: window-controls-overlay)').matches||navigator.standalone===true;
function renderInstall(){
  const b=$('#install-btn'),sub=$('#install-sub');if(!b)return;
  if(installed()){b.textContent='Installed';b.disabled=true;sub.textContent="You're using the app right now.";return}
  b.disabled=false;b.textContent='Install';
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;renderInstall()});
window.addEventListener('appinstalled',()=>{installPrompt=null;toast('Installed! Open it from your shelf or home screen.','ok');window.motion?.celebrate();renderInstall()});
$('#install-btn').onclick=async()=>{
  if(installPrompt){
    installPrompt.prompt();
    const {outcome}=await installPrompt.userChoice.catch(()=>({}));
    installPrompt=null;
    if(outcome!=='accepted')toast('No worries, you can install it later.');
    renderInstall();return;
  }
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  dcModal({title:'Install william\'s vm',okLabel:'Got it',
    sub:ios?'In Safari, tap the Share button, then “Add to Home Screen”.'
       :'Open the browser menu (⋮) and pick “Install william\'s vm” (or “Cast, save and share” → “Install page as app”). If you don\'t see it, the browser may already have it installed, or it doesn\'t support installing sites.',
    fields:[],onOk:()=>{}});
};
renderInstall();

/* settings open */
function openSettings(){openPanel('settings-panel');syncControls();$('#tb-settings').classList.add('active')}

/* ═══════════════════════════════════════════════════════════
   KEYBOARD
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('keydown',e=>{
  if(locked){e.preventDefault();unlockScreen();return}
  if(S.panic&&e.key===S.panicKey&&!typing()){e.preventDefault();panicNow();return}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$('#start').classList.contains('show'))toggleStart();else $('#start-search').focus();return}
  if(e.key==='Escape'){closeAllPanels();$('#tb-settings').classList.remove('active');$('#tb-games').classList.remove('active');return}
  if(e.key==='/'&&$('#games-panel').classList.contains('show')&&!typing()){e.preventDefault();$('#games-search').focus();return}
  if(!e.altKey||e.ctrlKey||e.metaKey)return;
  const k=e.key.toLowerCase();const map={b:()=>openBrowser(),g:()=>openGames(),v:()=>APPS.vm(),s:()=>openSettings(),l:()=>openLinks(),c:()=>toggleChat(),m:()=>APPS.music(),a:()=>APPS.ai(),k:()=>{closeAllPanels();lockScreen()},' ':()=>toggleStart(),t:()=>{if($('#browser-wrap').style.display==='flex')newTab()},w:()=>{if($('#browser-wrap').style.display==='flex'&&activeTab)closeTab(activeTab)},d:()=>{if($('#browser-wrap').style.display==='flex'){$('#browser-address').focus()}}};
  if(map[k]){e.preventDefault();map[k]()}
});
/* panel close → clear active state */
new MutationObserver(()=>{$('#tb-admin').classList.toggle('active',$('#admin-panel').classList.contains('show'));$('#tb-settings').classList.toggle('active',$('#settings-panel').classList.contains('show'));$('#tb-games').classList.toggle('active',$('#games-panel').classList.contains('show'));$('#tb-links').classList.toggle('active',$('#links-panel').classList.contains('show'))}).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});

/* ═══════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════ */
applyAll();syncControls();setUser();
if(!S.showlauncher){mainWin.style.display='none';$('#tb-home').classList.remove('active')}else $('#tb-home').classList.add('active');
checkAuth();
if(S.startapp&&S.startapp!=='none')setTimeout(()=>{const fn=APPS[S.startapp];if(fn)fn()},600);
requestIdleCallback?.(()=>{fetchPlayerCount();setInterval(fetchPlayerCount,30000);renderBookmarks();if(S.preload||proxyId()==='wj')proxyEngine().catch(()=>{})},{timeout:2000})??setTimeout(()=>{fetchPlayerCount();renderBookmarks()},500);
window.addEventListener('beforeunload',e=>{if(containerId){e.preventDefault();e.returnValue=''}});
