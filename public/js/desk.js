/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   DESKTOP: theme presets, widgets, and icons you can drag
   - Presets set several settings at once (set() from app.js).
   - Widgets (clock, weather, now playing, to-do) sit in #widgets on the
     desktop and are switched on in Settings > Desktop (S.wClock and co.).
   - Where widgets and icons sit, the to-do list and the weather city live in
     localStorage "desk", which settings sync carries between devices.
     Positions are fractions of the desktop, so they survive a resize.
   Weather comes straight from Open-Meteo (free, no key, CORS) to the browser.
   Uses app.js helpers ($, $$, esc, toast, click, store, put, set, S).
   ═══════════════════════════════════════════════════════════ */
(()=>{
const DESK_DEFAULT={icons:{},widgets:{},todos:[],city:null,units:'f'};
let desk=load();
function load(){const d=store('desk',null);return{...DESK_DEFAULT,...(d&&typeof d==='object'&&!Array.isArray(d)?d:{})}}
function save(){put('desk',desk)}
const DT=$('#desktop'),WB=$('#widgets'),ICONS=$('#icons');
const motionOff=()=>document.documentElement.dataset.motion==='off'||document.documentElement.dataset.perf==='on';

/* ═══ theme presets ═══ */
const PRESETS=[
  {id:'black',name:'Black',theme:'oled',accent:'#4f8cff',accent2:'#a855f7',gradient:true,glow:false,wallpaper:'black'},
  {id:'default',name:'Classic',theme:'dark',accent:'#4f8cff',accent2:'#a855f7',gradient:true,glow:false,wallpaper:'aurora'},
  {id:'midnight',name:'Midnight',theme:'oled',accent:'#8b5cf6',accent2:'#06b6d4',gradient:true,glow:true,wallpaper:'live-stars'},
  {id:'synth',name:'Synthwave',theme:'dark',accent:'#ff2e97',accent2:'#7b2cbf',gradient:true,glow:true,wallpaper:'live-synth'},
  {id:'aurora',name:'Northern lights',theme:'dark',accent:'#22d3ee',accent2:'#22c55e',gradient:true,glow:false,wallpaper:'live-aurora'},
  {id:'ember',name:'Ember',theme:'dark',accent:'#f97316',accent2:'#ef4444',gradient:true,glow:false,wallpaper:'live-lava'},
  {id:'sea',name:'Deep sea',theme:'dark',accent:'#06b6d4',accent2:'#3b82f6',gradient:true,glow:false,wallpaper:'live-sea'},
  {id:'forest',name:'Forest',theme:'dark',accent:'#22c55e',accent2:'#14b8a6',gradient:true,glow:false,wallpaper:'forest'},
  {id:'sakura',name:'Sakura',theme:'light',accent:'#ec4899',accent2:'#a855f7',gradient:true,glow:false,wallpaper:'candy'},
  {id:'mono',name:'Graphite',theme:'dark',accent:'#d4d4d8',accent2:'#71717a',gradient:false,glow:false,wallpaper:'mono'},
];
const PRESET_KEYS=['theme','accent','accent2','gradient','glow','wallpaper'];
function applyPreset(id){
  const p=PRESETS.find(x=>x.id===id);if(!p)return false;
  // set() saves and redraws each time; the last one paints the whole look
  for(const k of PRESET_KEYS){S[k]=p[k]}
  S.autotheme=false;
  set('wallpaper',p.wallpaper);
  paintPresets();
  return true;
}
function paintPresets(){
  const box=$('#presets');if(!box)return;
  const cur=PRESETS.find(p=>PRESET_KEYS.every(k=>S[k]===p[k]));
  box.innerHTML=PRESETS.map(p=>{
    const w=WALLS.find(x=>x.id===p.wallpaper)||WALLS[0];
    const bg=w.img?`url('${w.img}') center/cover`:w.css.replace(/var\(--accent-rgb\)/g,hexToRgb(p.accent)).replace(/var\(--bg1\)/g,'#12161f').replace(/var\(--bg0\)/g,'#0b0d12');
    return `<button class="preset${cur===p?' on':''}${w.live?' live':''}" data-preset="${p.id}" style="--pa:${p.accent};--pb:${p.gradient?p.accent2:p.accent}">
      <span class="pv" style="background:${esc(bg)}"><i class="pw ${p.theme}"></i><i class="pd"></i></span><b>${esc(p.name)}</b></button>`;
  }).join('');
}
$('#presets')?.addEventListener('click',e=>{const b=e.target.closest('[data-preset]');if(b){click();applyPreset(b.dataset.preset);toast(`Theme: ${b.querySelector('b').textContent}`,'ok')}});

/* ═══ widgets ═══ */
const WIDGETS=['clock','weather','music','todo'];
const on=w=>!!S['w'+w[0].toUpperCase()+w.slice(1)];
const els={};
function build(w){
  const el=document.createElement('div');
  el.className=`wd wd-${w}`;el.dataset.w=w;
  WB.appendChild(el);els[w]=el;
  return el;
}
/* where a widget goes: its saved spot, else stacked down the right-hand side */
function place(w){
  const el=els[w];if(!el||el.hidden)return;
  const r=DT.getBoundingClientRect(),p=desk.widgets[w];
  let x,y;
  if(p&&typeof p.x==='number'){x=p.x*r.width;y=p.y*r.height}
  else{
    x=r.width-el.offsetWidth-24;
    y=24;for(const o of WIDGETS){if(o===w)break;const e=els[o];if(e&&!e.hidden&&!desk.widgets[o])y+=e.offsetHeight+14}
  }
  x=Math.max(6,Math.min(x,r.width-el.offsetWidth-6));y=Math.max(6,Math.min(y,r.height-el.offsetHeight-6));
  el.style.left=x+'px';el.style.top=y+'px';
}
function placeAll(){for(const w of WIDGETS)place(w)}
addEventListener('resize',()=>{placeAll();placeIcons()});

/* dragging, for widgets (by any bit that isn't a control) */
WB.addEventListener('pointerdown',e=>{
  const el=e.target.closest('.wd');
  if(!el||e.button!==0||e.target.closest('button,input,a,select,label,.wd-nodrag'))return;
  const r=DT.getBoundingClientRect(),b=el.getBoundingClientRect(),dx=e.clientX-b.left,dy=e.clientY-b.top;
  let moved=false;
  el.setPointerCapture(e.pointerId);
  const move=ev=>{
    if(!moved&&Math.hypot(ev.clientX-e.clientX,ev.clientY-e.clientY)<4)return;
    moved=true;el.classList.add('dragging');
    const x=Math.max(6,Math.min(ev.clientX-r.left-dx,r.width-el.offsetWidth-6)),y=Math.max(6,Math.min(ev.clientY-r.top-dy,r.height-el.offsetHeight-6));
    el.style.left=x+'px';el.style.top=y+'px';
  };
  const up=()=>{
    el.removeEventListener('pointermove',move);el.classList.remove('dragging');
    if(!moved)return;
    desk.widgets[el.dataset.w]={x:+(parseFloat(el.style.left)/r.width).toFixed(4),y:+(parseFloat(el.style.top)/r.height).toFixed(4)};save();
  };
  el.addEventListener('pointermove',move);
  el.addEventListener('pointerup',up,{once:true});el.addEventListener('pointercancel',up,{once:true});
});

/* ── clock ── */
function drawClock(){
  const el=els.clock;if(!el||el.hidden)return;
  const d=new Date();
  const t=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:!S.clock24});
  const [hm,ap]=S.clock24?[t,'']:[t.replace(/\s?[AP]M$/i,''),(t.match(/[AP]M$/i)||[''])[0]];
  el.innerHTML=`<div class="wc-time">${esc(hm)}<small>${esc(ap)}</small></div><div class="wc-date">${esc(d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'}))}</div>`;
}

/* ── weather ── */
const WMO={0:['Clear','☀️','🌙'],1:['Mostly clear','🌤️','🌙'],2:['Partly cloudy','⛅','☁️'],3:['Cloudy','☁️','☁️'],45:['Fog','🌫️','🌫️'],48:['Fog','🌫️','🌫️'],
  51:['Drizzle','🌦️','🌧️'],53:['Drizzle','🌦️','🌧️'],55:['Drizzle','🌧️','🌧️'],56:['Freezing drizzle','🌧️','🌧️'],57:['Freezing drizzle','🌧️','🌧️'],
  61:['Light rain','🌦️','🌧️'],63:['Rain','🌧️','🌧️'],65:['Heavy rain','🌧️','🌧️'],66:['Freezing rain','🌧️','🌧️'],67:['Freezing rain','🌧️','🌧️'],
  71:['Light snow','🌨️','🌨️'],73:['Snow','🌨️','🌨️'],75:['Heavy snow','❄️','❄️'],77:['Snow grains','🌨️','🌨️'],80:['Showers','🌦️','🌧️'],81:['Showers','🌧️','🌧️'],
  82:['Heavy showers','⛈️','⛈️'],85:['Snow showers','🌨️','🌨️'],86:['Snow showers','❄️','❄️'],95:['Thunderstorm','⛈️','⛈️'],96:['Thunderstorm','⛈️','⛈️'],99:['Thunderstorm','⛈️','⛈️']};
let wx=null,wxAt=0,wxBusy=false,wxErr='',wxPicking=false;
async function fetchWeather(force){
  if(!desk.city||wxBusy||(!force&&wx&&Date.now()-wxAt<30*60_000))return drawWeather();
  wxBusy=true;wxErr='';drawWeather();
  try{
    const u=desk.units==='c'?'celsius':'fahrenheit';
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${desk.city.lat}&longitude=${desk.city.lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1&temperature_unit=${u}&wind_speed_unit=${desk.units==='c'?'kmh':'mph'}`);
    const d=await r.json();
    if(!r.ok||d.error)throw new Error(d.reason||`HTTP ${r.status}`);
    wx=d;wxAt=Date.now();
  }catch(e){wxErr=/limit/i.test(e.message)?'Weather is busy. Try again later.':"Couldn't get the weather."}
  wxBusy=false;drawWeather();
}
function drawWeather(){
  const el=els.weather;if(!el||el.hidden)return;
  if(!desk.city||wxPicking){
    el.innerHTML=`<div class="wx-pick"><b>Weather</b><small>Where are you?</small>
      <form class="wx-form"><input class="field" name="q" placeholder="City" maxlength="60" autocomplete="off"><button class="btn sm primary">Set</button></form>
      <div class="wx-hits"></div><button class="btn sm wx-here" type="button">Use my location</button>${desk.city?'<button class="wx-cancel" type="button">Cancel</button>':''}</div>`;
    return;
  }
  const c=wx?.current,dly=wx?.daily,unit=desk.units==='c'?'°C':'°F';
  if(!c){el.innerHTML=`<div class="wx-top"><b>${esc(desk.city.name)}</b></div><div class="wx-msg">${esc(wxBusy?'Loading…':wxErr||'…')}</div>`;return}
  const [txt,day,night]=WMO[c.weather_code]||['—','🌡️','🌡️'];
  el.innerHTML=`<div class="wx-top"><b title="Change city">${esc(desk.city.name)}</b><button class="wx-unit" title="Switch units">${unit}</button></div>
    <div class="wx-now"><span class="wx-ic">${c.is_day?day:night}</span><span class="wx-t">${Math.round(c.temperature_2m)}°</span></div>
    <div class="wx-d">${esc(txt)} · feels ${Math.round(c.apparent_temperature)}°</div>
    <div class="wx-hl">H ${Math.round(dly.temperature_2m_max[0])}° · L ${Math.round(dly.temperature_2m_min[0])}° · wind ${Math.round(c.wind_speed_10m)} ${desk.units==='c'?'km/h':'mph'}</div>`;
}
function setCity(c){desk.city={name:String(c.name).slice(0,60),lat:+(+c.lat).toFixed(3),lon:+(+c.lon).toFixed(3)};wxPicking=false;wx=null;save();fetchWeather(true)}
WB.addEventListener('submit',async e=>{
  const f=e.target.closest('.wx-form');if(!f)return;e.preventDefault();
  const q=f.q.value.trim();if(!q)return;
  const hits=$('.wx-hits',els.weather);hits.textContent='Searching…';
  try{
    const d=await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en`)).json();
    const list=(d.results||[]).map(x=>({name:x.name,lat:x.latitude,lon:x.longitude,where:[x.admin1,x.country_code].filter(Boolean).join(', ')}));
    hits.innerHTML=list.length?list.map((x,i)=>`<button type="button" data-hit="${i}">${esc(x.name)}<small>${esc(x.where)}</small></button>`).join(''):'No places found.';
    hits._list=list;
  }catch(_){hits.textContent="Couldn't search. Try again."}
});
WB.addEventListener('click',e=>{
  const w=els.weather;if(!w||!w.contains(e.target))return;
  const hit=e.target.closest('[data-hit]');
  if(hit){click();setCity($('.wx-hits',w)._list[+hit.dataset.hit]);return}
  if(e.target.closest('.wx-here')){
    click();
    if(!navigator.geolocation){toast("This browser can't share its location.",'err');return}
    navigator.geolocation.getCurrentPosition(p=>setCity({name:'Your location',lat:p.coords.latitude,lon:p.coords.longitude}),()=>toast('Location blocked. Type your city instead.','err'),{timeout:10000,maximumAge:3600e3});
    return;
  }
  if(e.target.closest('.wx-cancel')){click();wxPicking=false;drawWeather();return}
  if(e.target.closest('.wx-unit')){click();desk.units=desk.units==='c'?'f':'c';save();fetchWeather(true);return}
  if(e.target.closest('.wx-top b')){click();wxPicking=true;drawWeather();$('.wx-form input',w)?.focus()}
});

/* ── now playing ── */
const ICO={prev:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 20 9 12l10-8zM5 19V5"/></svg>',next:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 4 10 8-10 8zM19 5v14"/></svg>',
  play:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 13 8-13 8z"/></svg>',pause:'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></svg>'};
let lastNow='';
function drawMusic(){
  const el=els.music;if(!el||!on('music'))return;
  const n=window.music?.now?.();
  // nothing playing: the widget steps aside
  const hide=!n;
  // the stack under it moves to make room (or closes the gap)
  if(el.hidden!==hide){el.hidden=hide;lastNow='';requestAnimationFrame(placeAll)}
  if(!n)return;
  const key=n.title+'|'+n.artist+'|'+n.artwork+'|'+n.playing;
  if(key!==lastNow){
    lastNow=key;
    el.innerHTML=`<div class="wm-art"${n.artwork?` style="background-image:url('${esc(n.artwork)}')"`:''}></div>
      <div class="wm-t"><b>${esc(n.title)}</b><small>${esc(n.artist)}</small><div class="wm-bar"><i></i></div></div>
      <div class="wm-btns"><button data-mu="prev" title="Back">${ICO.prev}</button><button data-mu="play" class="big" title="${n.playing?'Pause':'Play'}">${n.playing?ICO.pause:ICO.play}</button><button data-mu="next" title="Next">${ICO.next}</button></div>`;
  }
  const bar=$('.wm-bar i',el);if(bar)bar.style.width=(n.dur?Math.min(100,n.pos/n.dur*100):0)+'%';
}
WB.addEventListener('click',e=>{
  const b=e.target.closest('[data-mu]');if(!b)return;click();
  const m=window.music;if(!m)return;
  ({prev:m.prev,play:m.playPause,next:m.next})[b.dataset.mu]?.();
  setTimeout(drawMusic,120);
});
WB.addEventListener('dblclick',e=>{if(e.target.closest('.wd-music .wm-art,.wd-music .wm-t'))window.music?.open()});

/* ── to-do ── */
const MAX_TODOS=100;
function drawTodo(){
  const el=els.todo;if(!el||el.hidden)return;
  const left=desk.todos.filter(t=>!t.done).length;
  el.innerHTML=`<div class="wt-top"><b>To-do</b><small>${left?`${left} left`:desk.todos.length?'All done 🎉':''}</small>${desk.todos.some(t=>t.done)?'<button class="wt-clear" title="Remove the done ones">Clear done</button>':''}</div>
    <ul class="wt-list">${desk.todos.map((t,i)=>`<li class="${t.done?'done':''}"><label><input type="checkbox" data-td="${i}"${t.done?' checked':''}><span>${esc(t.text)}</span></label><button data-tdel="${i}" title="Delete" aria-label="Delete">×</button></li>`).join('')}</ul>
    <form class="wt-add"><input class="field" name="t" placeholder="Add a task…" maxlength="140" autocomplete="off"></form>`;
}
function addTodo(text){
  text=String(text||'').trim().slice(0,140);if(!text)return false;
  if(desk.todos.length>=MAX_TODOS){toast(`The list holds up to ${MAX_TODOS} tasks.`,'err');return false}
  desk.todos.push({text,done:false});save();drawTodo();return true;
}
WB.addEventListener('submit',e=>{
  const f=e.target.closest('.wt-add');if(!f)return;e.preventDefault();
  if(addTodo(f.t.value)){$('.wt-add input',els.todo)?.focus()}
});
WB.addEventListener('change',e=>{
  const c=e.target.closest('[data-td]');if(!c)return;
  const t=desk.todos[+c.dataset.td];if(!t)return;
  t.done=c.checked;save();drawTodo();
  if(t.done&&!desk.todos.some(x=>!x.done))window.motion?.celebrate?.();
});
WB.addEventListener('click',e=>{
  const d=e.target.closest('[data-tdel]');
  if(d){click();desk.todos.splice(+d.dataset.tdel,1);save();drawTodo();return}
  if(e.target.closest('.wt-clear')){click();desk.todos=desk.todos.filter(t=>!t.done);save();drawTodo()}
});

/* show, hide and redraw */
function apply(){
  for(const w of WIDGETS){
    const want=on(w);
    if(want&&!els[w])build(w);
    const el=els[w];if(!el)continue;
    if(w==='music'){if(!want)el.hidden=true;else drawMusic();continue}
    const was=el.hidden;el.hidden=!want;
    if(want&&(was||!el.innerHTML)){({clock:drawClock,weather:()=>{drawWeather();fetchWeather()},todo:drawTodo})[w]()}
  }
  document.documentElement.dataset.icons!=='off'&&placeIcons();
  requestAnimationFrame(placeAll);
  paintPresets();
}
setInterval(()=>{drawClock();drawMusic()},1000);
setInterval(()=>{if(on('weather'))fetchWeather()},5*60_000);

/* ═══ desktop icons you can drag ═══
   The first drag turns the grid into free spots (every icon keeps where it is),
   and icons snap to a grid of cells. A drag doesn't launch the app. */
const CELL={w:92,h:98},PAD=18;
function iconKey(el){return el.dataset.app||''}
function placeIcons(){
  const free=Object.keys(desk.icons).length>0;
  ICONS.classList.toggle('free',free);
  if(!free){$$('.dicon',ICONS).forEach(el=>{el.style.left=el.style.top=''});return}
  const r=DT.getBoundingClientRect(),cols=Math.max(1,Math.floor((r.width-PAD*2)/CELL.w)),rows=Math.max(1,Math.floor((r.height-PAD*2)/CELL.h));
  const taken=new Set();
  const list=$$('.dicon',ICONS).filter(el=>getComputedStyle(el).display!=='none');
  // saved spots first, then anything new (an app added since) in the first free cell
  for(const el of [...list.filter(e=>desk.icons[iconKey(e)]),...list.filter(e=>!desk.icons[iconKey(e)])]){
    let p=desk.icons[iconKey(el)];
    let c=p?Math.min(p.c,cols-1):0,rr=p?Math.min(p.r,rows-1):0;
    if(taken.has(c+','+rr)){ // off-screen after a resize, or new: first free cell, top to bottom, left to right
      outer:for(let cc=0;cc<cols;cc++)for(let r2=0;r2<rows;r2++)if(!taken.has(cc+','+r2)){c=cc;rr=r2;break outer}
    }
    taken.add(c+','+rr);
    el.style.left=(PAD+c*CELL.w)+'px';el.style.top=(PAD+rr*CELL.h)+'px';
  }
}
let iconDrag=null;
ICONS.addEventListener('pointerdown',e=>{
  const el=e.target.closest('.dicon');if(!el||e.button!==0)return;
  iconDrag={el,x:e.clientX,y:e.clientY,moved:false,id:e.pointerId};
});
addEventListener('pointermove',e=>{
  const d=iconDrag;if(!d||e.pointerId!==d.id)return;
  if(!d.moved){
    if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<6)return;
    d.moved=true;
    // freeze everyone where they are now, the first time
    if(!Object.keys(desk.icons).length){
      const r0=ICONS.getBoundingClientRect(),r=DT.getBoundingClientRect();
      $$('.dicon',ICONS).forEach(el=>{const b=el.getBoundingClientRect();desk.icons[iconKey(el)]={c:Math.max(0,Math.round((b.left-r.left-PAD)/CELL.w)),r:Math.max(0,Math.round((b.top-r.top-PAD)/CELL.h))}});
      void r0;placeIcons();
    }
    const b=d.el.getBoundingClientRect();d.dx=e.clientX-b.left;d.dy=e.clientY-b.top;
    d.el.classList.add('dragging');
  }
  const r=DT.getBoundingClientRect();
  d.el.style.left=Math.max(0,Math.min(e.clientX-r.left-d.dx,r.width-CELL.w))+'px';
  d.el.style.top=Math.max(0,Math.min(e.clientY-r.top-d.dy,r.height-CELL.h))+'px';
});
addEventListener('pointerup',e=>{
  const d=iconDrag;iconDrag=null;if(!d||!d.moved)return;
  d.el.classList.remove('dragging');
  const r=DT.getBoundingClientRect(),cols=Math.max(1,Math.floor((r.width-PAD*2)/CELL.w)),rows=Math.max(1,Math.floor((r.height-PAD*2)/CELL.h));
  const c=Math.max(0,Math.min(cols-1,Math.round((parseFloat(d.el.style.left)-PAD)/CELL.w))),rr=Math.max(0,Math.min(rows-1,Math.round((parseFloat(d.el.style.top)-PAD)/CELL.h)));
  // dropped on another icon: they swap
  const key=iconKey(d.el),other=Object.entries(desk.icons).find(([k,p])=>k!==key&&p.c===c&&p.r===rr);
  if(other)desk.icons[other[0]]={...desk.icons[key]};
  desk.icons[key]={c,r:rr};save();placeIcons();
  // the click that ends a drag isn't a launch
  const stop=ev=>{ev.stopPropagation();ev.preventDefault()};
  addEventListener('click',stop,{capture:true,once:true});setTimeout(()=>removeEventListener('click',stop,{capture:true}),0);
});

$('#desk-reset')?.addEventListener('click',()=>{click();desk.icons={};desk.widgets={};save();placeIcons();placeAll();toast('Layout reset')});

function reload(){desk=load();wx=null;apply();fetchWeather()}
window.desk={apply,reload,applyPreset,presets:()=>PRESETS.map(p=>({id:p.id,name:p.name})),
  addTodo,todos:()=>desk.todos.map(t=>({...t})),setCity,
  widget:(w,v)=>{if(!WIDGETS.includes(w))return false;set('w'+w[0].toUpperCase()+w.slice(1),!!v);return true}};
apply();
})();
