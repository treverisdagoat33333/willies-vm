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
  perf:false,motion:false,wallimg:true,preload:false,sound:false,soundpack:'soft',volume:0.5,chatsound:true,fps:false
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
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){toast('Could not save settings (storage full?)','err')}};
const store=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch(_){return d}};
const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
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
  root.dataset.theme=th;root.dataset.blur=S.blur?'on':'off';root.dataset.perf=S.perf?'on':'off';root.dataset.motion=S.motion?'off':'on';
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
  if(S.panicWipe){try{localStorage.clear();sessionStorage.clear()}catch(_){}}
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
function set(k,v){S[k]=v;save();applyAll();syncControls()}
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
document.addEventListener('change',e=>{const el=e.target;if(!el.dataset.setting)return;const k=el.dataset.setting;S[k]=el.type==='range'?parseFloat(el.value):el.value;save();applyAll();syncControls();if(k==='gsort'||k==='gsize')renderGames()});
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
$('#nuke-btn').onclick=()=>{if(!confirm('Clear ALL data for this site and reload?'))return;localStorage.clear();sessionStorage.clear();if(window.caches)caches.keys().then(k=>k.forEach(x=>caches.delete(x)));setTimeout(()=>location.reload(),300)};
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
/* a soft two-note ping, distinct from the UI click */
function chatPing(){if(!S.chatsound)return;try{
  const vol=(S.volume??.5)*.5;if(vol<=0)return;
  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  const t=audioCtx.currentTime;
  [[880,0],[1320,.09]].forEach(([f,at])=>{
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sine';o.frequency.setValueAtTime(f,t+at);
    g.gain.setValueAtTime(0,t+at);
    g.gain.linearRampToValueAtTime(vol,t+at+.012);
    g.gain.exponentialRampToValueAtTime(.0001,t+at+.16);
    o.connect(g).connect(audioCtx.destination);o.start(t+at);o.stop(t+at+.18);
  });
}catch(_){}}
function toast(msg,type=''){const box=$('#toasts'),t=document.createElement('div');t.className='toast '+type;t.innerHTML=`<span class="dot"></span><span></span>`;t.lastChild.textContent=msg;box.appendChild(t);while(box.children.length>4)box.firstChild.remove();setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),260)},3800)}
function setStatus(msg,busy=false){const el=$('#status');el.textContent=msg;el.className=(/^(error|failed)/i.test(msg)?'error':'')+(busy?' busy':'')}
function setLaunching(on){$$('.vm-btn').forEach(b=>b.disabled=on)}
function favicon(url,sz=32){try{const d=new URL(url).hostname;return d?`https://www.google.com/s2/favicons?domain=${d}&sz=${sz}`:''}catch(_){return''}}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
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
function closeAllPanels(){['links-panel','games-panel','settings-panel','history-panel'].forEach(closePanel);$('#start').classList.remove('show')}

/* app launcher (delegated) */
const APPS={
  browser:()=>openBrowser(),games:()=>openGames(),links:()=>openLinks(),chat:()=>toggleChat(),settings:()=>openSettings(),cloud:()=>toggleCloud(),remote:()=>toggleRemote(),
  vm1:()=>launchE2BVM(),vm2:()=>launchGPUVM(),vm:()=>(S.defaultVM==='gpu'?launchGPUVM():launchE2BVM())
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-app]');if(!b)return;click();const fn=APPS[b.dataset.app];if(fn)fn()});
$$('.tile').forEach(t=>t.addEventListener('pointermove',e=>{const r=t.getBoundingClientRect();t.style.setProperty('--mx',(e.clientX-r.left)+'px');t.style.setProperty('--my',(e.clientY-r.top)+'px')}));

/* taskbar auto-hide */
let tbT;const tb=$('#taskbar');
const showTb=()=>{clearTimeout(tbT);tb.classList.add('visible')},hideTb=()=>{tbT=setTimeout(()=>tb.classList.remove('visible'),400)};
$('#tb-zone').addEventListener('mouseenter',showTb);tb.addEventListener('mouseenter',showTb);tb.addEventListener('mouseleave',hideTb);

/* start menu */
const START_APPS=[['browser','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>','Browser','c1'],['games','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.6L2 16a2.5 2.5 0 0 0 4.5 1.5L8 15h8l1.5 2.5A2.5 2.5 0 0 0 22 16l-.7-7.4A4 4 0 0 0 17.32 5z"/></svg>','Games','c2'],['vm1','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10H4z"/><path d="M2 19h20"/></svg>','VM #1','c7'],['vm2','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>','VM #2','c3'],['links','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>','Links','c4'],['remote','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="12" cy="10" r="2.4"/></svg>','Remote PC','c7'],['cloud','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>','Cloud','c3'],['chat','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>','Server','c6'],['settings','<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>','Settings','c5']];
function renderStart(q=''){
  q=q.toLowerCase().trim();const g=$('#start-grid');
  let html=START_APPS.filter(a=>!q||a[2].toLowerCase().includes(q)).map(a=>`<button class="dicon" data-app="${a[0]}"><div class="ic ${a[3]}">${a[1]}</div><span>${a[2]}</span></button>`).join('');
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
let rmWS=null,rmMeta=null,rmActive=false,rmRetry=0,rmRetryT=null;
let rmDecoding=false,rmPending=null,rmRect={x:0,y:0,w:0,h:0};
let rmFrames=0,rmFps=0,rmLat=0,rmPingT=null,rmStatT=null,rmLastMove=0;
const rmKeyLS='remoteKey';

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

function rmConnect(key){
  clearTimeout(rmRetryT);
  try{if(rmWS)rmWS.close()}catch(_){}
  rmState('wait');
  $('#remote-stat').textContent='Connecting…';
  const hint=$('#remote-hint');hint.textContent='';hint.classList.remove('err');
  let ws;
  try{ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/remote/?role=viewer&key='+encodeURIComponent(key))}
  catch(_){rmState('off');return}
  ws.binaryType='arraybuffer';
  rmWS=ws;

  ws.onopen=()=>{
    rmRetry=0;
    $('#remote-stat').textContent='Waiting for your PC…';
    rmSendSettings();
    clearInterval(rmPingT);rmPingT=setInterval(()=>rmSend({t:'ping',ts:performance.now()}),2000);
    clearInterval(rmStatT);rmStatT=setInterval(rmUpdateStat,1000);
  };
  ws.onmessage=(e)=>{
    if(typeof e.data!=='string'){rmFrame(e.data);return}
    let m;try{m=JSON.parse(e.data)}catch(_){return}
    if(m.t==='up'){rmState('on');rmActive=true;$('#remote-canvas').focus()}
    else if(m.t==='down'){rmState('wait');rmActive=false;$('#remote-stat').textContent='Your PC agent is offline';}
    else if(m.t==='meta'){rmMeta={w:m.w,h:m.h}}
    else if(m.t==='pong'){rmLat=Math.round(performance.now()-m.ts)}
  };
  ws.onclose=(ev)=>{
    clearInterval(rmPingT);clearInterval(rmStatT);rmActive=false;
    if(ev.code===1008||ev.code===4001){
      rmState('off');
      const h=$('#remote-hint');h.textContent='Rejected: wrong key, or this account is not the owner.';h.classList.add('err');
      try{localStorage.removeItem(rmKeyLS)}catch(_){}
      return;
    }
    if(!remoteVisible()){rmState('off');return}
    rmState('wait');$('#remote-stat').textContent='Reconnecting…';
    rmRetry++;rmRetryT=setTimeout(()=>rmConnect(key),Math.min(1000*Math.pow(1.5,rmRetry),12000));
  };
  ws.onerror=()=>{};
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
  $('#remote-stat').textContent=[dims,rmFps+' fps',rmLat+' ms'].filter(Boolean).join('  ·  ');
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
let cloudLoaded=false,cloudGames=[],cloudCats=[],cloudCat='all',cloudQuery='';

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

/* playing ---------------------------------------------------
   The play page wants a signed-in CloudMoon session (sid + token), which
   only their client can mint, so launching hands off to it. The frame is
   loaded once and kept, so a sign-in survives going back to the grid. */
function playCloudGame(g){
  const w=$('#cloud-wrap'),f=$('#cloud-frame');
  w.classList.add('playing');
  $('#cloud-title').textContent=g.name;
  if(!cloudLoaded){
    w.classList.add('loading');
    f.onload=()=>w.classList.remove('loading');
    f.src='/cloud/app';
    cloudLoaded=true;
  }
  toast(`Opening ${g.name} — sign in to CloudMoon to start the stream`);
}

function cloudBrowse(){
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
$('#cloud-reload').onclick=()=>{
  const w=$('#cloud-wrap'),f=$('#cloud-frame');
  if(!w.classList.contains('playing')){cloudGames=[];loadCloudGames();return}
  w.classList.add('loading');
  f.onload=()=>w.classList.remove('loading');
  f.src='/cloud/app?t='+Date.now();
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
let authMode='register',currentUsername='Guest',vmLimit=30*60;
function setAuthMode(m){authMode=m;const L=m==='login';$('#auth-title').textContent=L?'Welcome back':'Create your account';$('#auth-submit').textContent=L?'Log in':'Create account';$('#auth-alt-text').textContent=L?'New here?':'Already have an account?';$('#login-button').textContent=L?'Create an account':'Log in';$('#auth-password').autocomplete=L?'current-password':'new-password';$('#auth-error').textContent=''}
function acceptAuth(d){vmLimit=(d.vmMinutes||30)*60;currentUsername=d.username||'Guest';$('#auth-wrap').classList.add('hidden');setUser();connectChat();toast(`Welcome, ${currentUsername}! ${d.vmMinutes||30} min of VM time.`,'ok')}
function setUser(){const a=currentUsername[0].toUpperCase();['#tb-avatar','#start-avatar','#acct-avatar'].forEach(s=>$(s).textContent=a);['#tb-username','#start-username','#settings-username'].forEach(s=>$(s).textContent=currentUsername);$('#settings-vmtime').textContent=`${Math.round(vmLimit/60)} min VM time per session`;updateHero()}
async function checkAuth(){try{const r=await fetch('/api/auth/me'),d=await r.json();if(d.loggedIn)acceptAuth(d)}catch(_){}}
$('#auth-card').addEventListener('submit',async e=>{e.preventDefault();const u=$('#auth-username').value.trim(),p=$('#auth-password').value,btn=$('#auth-submit');btn.disabled=true;try{const r=await fetch(authMode==='login'?'/api/auth/login':'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Authentication failed.');acceptAuth(d)}catch(err){$('#auth-error').textContent=err.message}finally{btn.disabled=false}});
$('#guest-button').onclick=async()=>{try{const r=await fetch('/api/auth/guest',{method:'POST'}),d=await r.json();if(!r.ok)throw 0;acceptAuth(d)}catch(_){acceptAuth({username:'Guest',vmMinutes:30})}};
$('#login-button').onclick=()=>setAuthMode(authMode==='login'?'register':'login');
function logoutUser(){fetch('/api/auth/logout',{method:'POST'}).catch(()=>{});location.reload()}
$('#logout-btn').onclick=logoutUser;
async function fetchPlayerCount(){try{const c=new AbortController(),t=setTimeout(()=>c.abort(),5000),r=await fetch('/api/stats',{signal:c.signal,cache:'no-store'});clearTimeout(t);if(!r.ok)throw 0;const d=await r.json(),n=d.online??d.count??d.players;if(n!=null)$('#player-count-text').textContent=`${n} online`}catch(_){}}

/* ═══════════════════════════════════════════════════════════
   VM
   ═══════════════════════════════════════════════════════════ */
let containerId=null,vmType=null,vmUrl=null,pollI=null,vmTimerI=null,vmStart=null,pollT=null,warned={};
const fmt=s=>{const p=v=>String(v).padStart(2,'0'),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${p(h)}:${p(m)}:${p(x)}`:`${p(m)}:${p(x)}`};
function tickVM(){if(!vmStart)return;const e=Math.floor((Date.now()-vmStart)/1000),left=vmLimit-e,t=$('#vm-timer');if(left<=0){toast('Your VM time has ended.','err');closeVM(true);return}t.textContent=fmt(left)+' left';t.className=left<=60?'crit':left<=300?'low':'';if(S.vmwarn){if(left<=300&&!warned[5]){warned[5]=1;toast('5 minutes of VM time left')}if(left<=60&&!warned[1]){warned[1]=1;toast('1 minute of VM time left','err')}}}
function openVM(url,label){vmUrl=url;const f=$('#vm-frame'),w=$('#vm-wrap');$('#vm-label').textContent=label||'Private VM';f.src='about:blank';w.style.display='flex';w.classList.remove('closing');warned={};vmStart=Date.now();clearInterval(vmTimerI);vmTimerI=setInterval(tickVM,1000);tickVM();setTimeout(()=>f.src=url,50);setStatus('VM connected.');setLaunching(false);toast('VM launched!','ok');$('#tb-vm').classList.add('active');$('#start').classList.remove('show')}
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
function pollQueue(token){clearInterval(pollI);if(!token){setLaunching(false);return}pollI=setInterval(async()=>{try{const r=await fetch(`/api/queue?token=${encodeURIComponent(token)}`),d=await r.json();if(!r.ok)throw 0;if(d.status==='allocated'){clearInterval(pollI);containerId=d.container_id;vmType='gpu';openVM(d.url,'VM #2 · GPU');return}if(d.status==='failed'){clearInterval(pollI);setStatus('Failed: '+(d.reason||'unknown'));toast('Queue failed: '+(d.reason||'unknown'),'err');setLaunching(false);return}setStatus(d.position!==undefined?`Queued — position ${d.position}…`:'Waiting for GPU…',true)}catch(_){}},4000)}

/* ═══════════════════════════════════════════════════════════
   BROWSER (Scramjet)
   ═══════════════════════════════════════════════════════════ */
let sjController=null,sjReady=false,sjStarting=null;
function bstatus(msg,show=true){const el=$('#browser-status');el.textContent=msg;el.style.display=show?'block':'none'}
async function waitForControl(reg){
  if(navigator.serviceWorker.controller)return navigator.serviceWorker.controller;
  const ex=reg.active||reg.waiting||reg.installing;
  if(ex&&ex.state!=='activated')await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('SW timeout')),10000);ex.addEventListener('statechange',()=>{if(ex.state==='activated'){clearTimeout(to);res()}else if(ex.state==='redundant'){clearTimeout(to);rej(new Error('SW redundant'))}})});
  if(navigator.serviceWorker.controller)return navigator.serviceWorker.controller;
  if(sessionStorage.getItem('scramjet_sw_reload')!=='1'){sessionStorage.setItem('scramjet_sw_reload','1');throw new Error('Refreshing once so the proxy can control this page.')}
  throw new Error('Proxy worker active but not controlling. Please refresh.');
}
async function initScramjet(frameEl,tab){
  if(sjReady&&sjController){if(frameEl&&tab&&!tab.sj)tab.sj=sjController.createFrame(frameEl);return}
  if(sjStarting){await sjStarting;if(frameEl&&tab&&!tab.sj)tab.sj=sjController.createFrame(frameEl);return}
  sjStarting=(async()=>{
    bstatus('Starting proxy…');
    if(!('serviceWorker'in navigator))throw new Error('This browser has no service-worker support.');
    // wait for deferred scripts if needed
    for(let i=0;i<50&&typeof window.registerScramjetServiceWorker!=='function';i++)await new Promise(r=>setTimeout(r,100));
    if(typeof window.registerScramjetServiceWorker!=='function')throw new Error('register-sw.js missing.');
    const reg=await window.registerScramjetServiceWorker(),sw=await waitForControl(reg);
    if(typeof $scramjetController==='undefined')throw new Error('controller.api.js missing.');
    bstatus('Loading engine…');
    const wisp=`${location.protocol==='https:'?'wss':'ws'}://${location.host}/wisp/`;
    const{default:LibcurlClient}=await import('/libcurl/index.mjs');
    sjController=new $scramjetController.Controller({serviceworker:sw,transport:new LibcurlClient({wisp}),config:{prefix:'/~/sj/',scramjetPath:'/scramjet/scramjet.js',wasmPath:'/scramjet/scramjet.wasm',injectPath:'/controller/controller.inject.js'},scramjetConfig:{flags:{captureErrors:true,allowInvalidJs:true}}});
    await sjController.wait();
    setInterval(()=>navigator.serviceWorker.controller?.postMessage('keepalive'),15000);
    sjReady=true;sessionStorage.removeItem('scramjet_sw_reload');bstatus('',false);
  })();
  try{await sjStarting}finally{sjStarting=null}
  if(frameEl&&tab&&!tab.sj)tab.sj=sjController.createFrame(frameEl);
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
function switchTab(id){tabs.forEach(t=>t.frame.classList.toggle('active',t.id===id));activeTab=id;const t=getTab();if(t){$('#browser-address').value=t.url&&t.url!=='about:blank'?t.url:'';setOmniIcon(t.url)}renderTabs()}
function setOmniIcon(url){const el=$('#browser-favicon'),src=url&&url!=='about:blank'?favicon(url):'';if(src){el.src=src;el.style.display='block';el.onerror=()=>el.style.display='none'}else el.style.display='none'}
function closeTab(id){const i=tabs.findIndex(t=>t.id===id);if(i<0)return;const t=tabs[i];try{t.frame.src='about:blank'}catch(_){}t.frame.remove();tabs.splice(i,1);if(!tabs.length){closeBrowser();return}if(id===activeTab)switchTab(tabs[Math.min(i,tabs.length-1)].id);else renderTabs()}
async function newTab(url){
  const id=++tabN,f=document.createElement('iframe');f.className='browser-frame';f.title='Tab '+id;f.allow='fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture';f.referrerPolicy='no-referrer';$('#browser-frames').appendChild(f);
  const initial=url||(S.autoblank?'about:blank':S.homepage);
  const tab={id,title:'New Tab',url:initial,frame:f,sj:null};tabs.push(tab);switchTab(id);
  try{await initScramjet(f,tab);if(initial!=='about:blank')await navigate(initial,tab);else{$('#browser-address').focus()}}
  catch(err){console.error(err);if(String(err.message).includes('Refreshing once')){toast('Proxy installing — refreshing…');setTimeout(()=>location.reload(),700)}else bstatus('Error: '+err.message)}
}
async function openBrowser(url){const b=$('#browser-wrap');b.style.display='flex';b.classList.remove('closing');$('#vm-wrap').style.display='none';$('#tb-browser').classList.add('active');closeAllPanels();renderBookmarks();if(!tabs.length)await newTab(url);else if(url)await navigate(url)}
function searchUrl(q){return(ENGINES[S.engine]||ENGINES.google)+encodeURIComponent(q)}
function normalizeUrl(v){if(/^[a-z][a-z0-9+.-]*:\/\//i.test(v))return v;if(/^about:|^data:|^javascript:/i.test(v))return v;if(/^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(v)&&!/\s/.test(v))return'https://'+v;if(/^localhost(:\d+)?/.test(v))return'http://'+v;return searchUrl(v)}
async function navigate(value,tab){
  const t=tab||getTab();if(!t)return;
  try{if(!t.sj)await initScramjet(t.frame,t);const raw=typeof value==='string'?value.trim():$('#browser-address').value.trim();if(!raw)return;const url=normalizeUrl(raw);t.url=url;$('#browser-address').value=url;t.title=(()=>{try{return new URL(url).hostname.replace(/^www\./,'')||'Loading…'}catch(_){return'Loading…'}})();renderTabs();setOmniIcon(url);if(!S.incognito)addHistory(url);bstatus('Loading…');t.sj.go(url);setTimeout(()=>bstatus('',false),1200)}
  catch(err){console.error(err);bstatus('Navigation error: '+(err.message||err))}
}
$('#browser-address').addEventListener('keydown',e=>{if(e.key==='Enter')navigate()});
$('#browser-address').addEventListener('focus',e=>e.target.select());
$('#b-back').onclick=()=>getTab()?.sj?.back();$('#b-fwd').onclick=()=>getTab()?.sj?.forward();
$('#b-reload').onclick=e=>{getTab()?.sj?.reload();const ic=e.currentTarget.querySelector('.i');ic.classList.remove('spinning');void ic.offsetWidth;ic.classList.add('spinning')};
$('#b-home').onclick=()=>navigate(S.homepage);
$('#b-fs').onclick=async()=>{try{if(!document.fullscreenElement)await $('#browser-wrap').requestFullscreen();else await document.exitFullscreen()}catch(_){}};
$('#tab-new').onclick=()=>{click();newTab()};
$('#b-close').onclick=()=>closeBrowser();$('#b-hist').onclick=()=>openHistory();$('#b-bm').onclick=()=>addBookmark();
function closeBrowser(){const b=$('#browser-wrap');b.classList.add('closing');onCloseDone(b,()=>{b.style.display='none';b.classList.remove('closing')});tabs.forEach(t=>{try{t.frame.src='about:blank'}catch(_){}t.frame.remove()});tabs=[];activeTab=null;$('#tab-list').innerHTML='';$('#tb-browser').classList.remove('active');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}

/* bookmarks */
function addBookmark(){const t=getTab();if(!t||!t.url||t.url==='about:blank')return toast('Nothing to bookmark','err');if(bookmarks.some(b=>b.url===t.url))return toast('Already bookmarked');bookmarks.push({title:t.title,url:t.url});put('bookmarks',bookmarks);renderBookmarks();syncControls();toast('Bookmarked!','ok')}
function renderBookmarks(){const bar=$('#bookmarks-bar'),frag=document.createDocumentFragment();bookmarks.forEach((b,i)=>{const el=document.createElement('div');el.className='bm';el.title=b.url;const f=favicon(b.url);el.innerHTML=`${f?`<img src="${f}" alt="" loading="lazy">`:''}<span></span>`;el.lastChild.textContent=b.title;el.onclick=()=>navigate(b.url);el.oncontextmenu=e=>{e.preventDefault();bookmarks.splice(i,1);put('bookmarks',bookmarks);renderBookmarks();syncControls();toast('Bookmark removed')};frag.appendChild(el)});bar.replaceChildren(frag)}
/* history */
function addHistory(url){historyData=historyData.filter(h=>h.url!==url);historyData.unshift({url,title:(()=>{try{return new URL(url).hostname}catch(_){return url}})(),time:Date.now()});if(historyData.length>200)historyData.length=200;put('history',historyData)}
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
    case 'deleted':
      if(d.channel===dcActive){dcMessages=dcMessages.filter(m=>m.id!==d.id);dcRenderMessages()}
      break;
    case 'typing': {
      if(d.name===chatMe||d.channel!==dcActive)break;
      d.on?dcTypers.set(d.name,Date.now()):dcTypers.delete(d.name);
      dcRenderTyping();break;
    }
    case 'join': case 'leave': break;
    case 'system': toast(d.text);break;
    case 'error': toast(d.text,'err');break;
  }
}

function dcUpsertProfile(p){
  const i=dcProfiles.findIndex(x=>x.username===p.username);
  if(i<0)dcProfiles.push(p);else dcProfiles[i]=p;
}

function dcOnMessage(m){
  if(m.channel===dcActive){
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
    chatPing();
    if(!$('#chat-window').classList.contains('show'))bumpBadge();
  }
}

/* channel + DM list ------------------------------------------- */
function dcOpen(slug){
  if(!slug)return;
  dcActive=slug;dcActiveIsDM=slug.startsWith('dm:');
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
  $('#dc-del-channel').hidden=dm||rank(chatMeRole)<3||dcChannels.length<=1;
  const label=dm?'@'+nameOf(partner||''):'#'+(ch?ch.name:dcActive);
  $('#dc-input').placeholder='Message '+label;
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
function dcLinkify(el,text){
  const re=/(https?:\/\/[^\s]+)/g;
  let last=0,m;
  while((m=re.exec(text))){
    if(m.index>last)el.appendChild(document.createTextNode(text.slice(last,m.index)));
    const a=document.createElement('a');
    a.textContent=m[0];a.href='#';a.title=m[0];
    a.onclick=ev=>{ev.preventDefault();closeChat();openBrowser(m[0])};
    el.appendChild(a);last=m.index+m[0].length;
  }
  if(last<text.length)el.appendChild(document.createTextNode(text.slice(last)));
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

  let lastDay='',lastUser='',lastAt=0;
  dcMessages.forEach(m=>{
    const day=dcDayLabel(m.createdAt);
    if(day!==lastDay){
      const s=document.createElement('div');s.className='dc-day';s.textContent=day;
      frag.appendChild(s);lastDay=day;lastUser='';
    }
    const fresh=m.username!==lastUser||m.createdAt-lastAt>7*60000;
    const row=document.createElement('div');
    row.className='dc-m'+(fresh?' fresh':'');

    const stamp=document.createElement('span');
    stamp.className='stamp';
    stamp.textContent=new Date(m.createdAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    row.appendChild(stamp);

    row.appendChild(avatar(m.username));

    const body=document.createElement('div');body.className='dc-body';
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
    const txt=document.createElement('div');txt.className='dc-text';
    dcLinkify(txt,m.text);
    body.appendChild(txt);
    row.appendChild(body);

    if(m.username===chatMe||rank(chatMeRole)>=2){
      const tools=document.createElement('div');tools.className='dc-tools';
      const del=document.createElement('button');
      del.className='danger';del.title='Delete message';
      del.innerHTML='<svg class="i i-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';
      del.onclick=()=>{if(confirm('Delete this message?'))dcSend({type:'delete',id:m.id})};
      tools.appendChild(del);
      row.appendChild(tools);
    }

    frag.appendChild(row);
    lastUser=m.username;lastAt=m.createdAt;
  });

  box.replaceChildren(frag);
}

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
function dcModal({title,sub,fields,okLabel='Save',onOk}){
  $('#dc-modal-title').textContent=title;
  $('#dc-modal-sub').textContent=sub||'';
  const box=$('#dc-modal-fields');box.replaceChildren();
  fields.forEach(f=>{
    const wrap=document.createElement('div');
    const lab=document.createElement('label');lab.textContent=f.label;wrap.appendChild(lab);
    let input;
    if(f.type==='textarea'){input=document.createElement('textarea');input.rows=3}
    else{input=document.createElement('input');input.type=f.type||'text'}
    input.className='field';input.id='dcf-'+f.key;
    input.value=f.value||'';
    if(f.placeholder)input.placeholder=f.placeholder;
    if(f.maxlength)input.maxLength=f.maxlength;
    wrap.appendChild(input);box.appendChild(wrap);
  });
  $('#dc-modal-ok').textContent=okLabel;
  dcModalOk=()=>{
    const out={};
    fields.forEach(f=>{out[f.key]=$('#dcf-'+f.key).value});
    onOk(out);
  };
  $('#dc-modal').classList.add('show');
  setTimeout(()=>{const first=box.querySelector('.field');if(first)first.focus()},60);
}
function dcCloseModal(){$('#dc-modal').classList.remove('show');dcModalOk=null}
$('#dc-modal-cancel').onclick=dcCloseModal;
$('#dc-modal-ok').onclick=()=>{if(dcModalOk)dcModalOk();dcCloseModal()};
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
  input.disabled=!chatReady||locked;
  $('#dc-send').disabled=!chatReady||locked||!input.value.trim();
  $('#dc-hint').textContent=!chatReady?'Connecting…'
    :locked?'This channel is locked. Only moderators and above can post.'
    :'Enter to send · Shift+Enter for a new line';
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
  if(!t)return;
  if(!chatReady)return toast('Not connected yet.','err');
  if(!dcSend({type:'msg',channel:dcActive,text:t}))return;
  dcSignalTyping(false);clearTimeout(dcTypingT);
  i.value='';dcGrow();dcSyncCompose();
}
$('#dc-send').onclick=sendChat;
$('#dc-input').addEventListener('input',()=>{
  dcGrow();dcSyncCompose();
  if($('#dc-input').value.trim()){
    dcSignalTyping(true);
    clearTimeout(dcTypingT);
    dcTypingT=setTimeout(()=>dcSignalTyping(false),2500);
  }else dcSignalTyping(false);
});
$('#dc-input').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}
});
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

/* a soft two-note ping, distinct from the UI click */
function chatPing(){if(!S.chatsound)return;try{
  const vol=(S.volume??.5)*.5;if(vol<=0)return;
  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  const t=audioCtx.currentTime;
  [[880,0],[1320,.09]].forEach(([f,at])=>{
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sine';o.frequency.setValueAtTime(f,t+at);
    g.gain.setValueAtTime(0,t+at);
    g.gain.linearRampToValueAtTime(vol,t+at+.012);
    g.gain.exponentialRampToValueAtTime(.0001,t+at+.16);
    o.connect(g).connect(audioCtx.destination);o.start(t+at);o.stop(t+at+.18);
  });
}catch(_){}}

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
  dcCloseModal();
  w.classList.add('closing');
  onCloseDone(w,()=>w.classList.remove('show','closing'));
  $('#tb-chat').classList.remove('active');
}
$('#dc-close').onclick=closeChat;
$('#dc-toggle-members').onclick=()=>$('#chat-window').classList.toggle('hide-members');

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
  const k=e.key.toLowerCase();const map={b:()=>openBrowser(),g:()=>openGames(),v:()=>APPS.vm(),s:()=>openSettings(),l:()=>openLinks(),c:()=>toggleChat(),k:()=>{closeAllPanels();lockScreen()},' ':()=>toggleStart(),t:()=>{if($('#browser-wrap').style.display==='flex')newTab()},w:()=>{if($('#browser-wrap').style.display==='flex'&&activeTab)closeTab(activeTab)},d:()=>{if($('#browser-wrap').style.display==='flex'){$('#browser-address').focus()}}};
  if(map[k]){e.preventDefault();map[k]()}
});
/* panel close → clear active state */
new MutationObserver(()=>{$('#tb-settings').classList.toggle('active',$('#settings-panel').classList.contains('show'));$('#tb-games').classList.toggle('active',$('#games-panel').classList.contains('show'));$('#tb-links').classList.toggle('active',$('#links-panel').classList.contains('show'))}).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});

/* ═══════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════ */
applyAll();syncControls();setUser();
if(!S.showlauncher){mainWin.style.display='none';$('#tb-home').classList.remove('active')}else $('#tb-home').classList.add('active');
checkAuth();
if(S.startapp&&S.startapp!=='none')setTimeout(()=>{const fn=APPS[S.startapp];if(fn)fn()},600);
requestIdleCallback?.(()=>{fetchPlayerCount();setInterval(fetchPlayerCount,30000);renderBookmarks();if(S.preload)initScramjet().catch(()=>{})},{timeout:2000})??setTimeout(()=>{fetchPlayerCount();renderBookmarks()},500);
window.addEventListener('beforeunload',e=>{if(containerId){e.preventDefault();e.returnValue=''}});
