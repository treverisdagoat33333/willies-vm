/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   OWNER ANALYTICS (the Admin panel's top card)
   Numbers from GET /api/stats/report (analytics.js). Charts are plain SVG and
   HTML: a line for visitors, a weekday-by-hour grid for busy times, bars for
   apps and VMs, lines for chat, AI and calls, and ranked lists for songs and
   movies. Every mark has a hover tooltip; the time charts have a table view.
   Colours come from css/stats.css by role (--an-s1..3, --an-h0..6).
   Uses app.js helpers ($, $$, esc).
   ═══════════════════════════════════════════════════════════ */
(()=>{
const box=$('#an'),tip=$('#an-tip');
if(!box)return;
let days=30,data=null,loading=false;
const APP_LABEL={browser:'Browser',games:'Games',vm:'VM (taskbar)',vm1:'VM #1',vm2:'VM #2',links:'Links',remote:'Remote PC',cloud:'Cloud',movies:'Movies',music:'Music',ai:'AI',chat:'Chat',settings:'Settings',admin:'Admin'};
const fmt=n=>Number(n||0).toLocaleString();
const dayDate=d=>new Date(d+'T12:00:00Z');
const dayLabel=d=>dayDate(d).toLocaleDateString([],{month:'short',day:'numeric'});
const dayLong=d=>dayDate(d).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});
const svgNS='http://www.w3.org/2000/svg';
function el(tag,attrs={},parent){const e=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);parent?.appendChild(e);return e}
/* a round top for the axis that fits the data: 1, 2, 5 × 10^n */
function niceMax(v){if(v<=4)return 4;const p=10**Math.floor(Math.log10(v)),m=v/p;return(m<=1?1:m<=2?2:m<=5?5:10)*p}

/* ── tooltip ── */
function showTip(html,x,y){
  tip.innerHTML=html;tip.hidden=false;
  const w=tip.offsetWidth,h=tip.offsetHeight;
  tip.style.left=Math.max(8,Math.min(x+14,innerWidth-w-8))+'px';
  tip.style.top=Math.max(8,y-h-12<8?y+16:y-h-12)+'px';
}
function hideTip(){tip.hidden=true}
function table(fig,head,rows){
  const d=fig.querySelector('.an-data>div');if(!d)return;
  d.innerHTML=`<table><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td>${i?fmt(c):esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ── a line over the days: one series gets a soft area, several get a legend and labels at their ends ── */
function lines(target,series,opts={}){
  target.replaceChildren();
  // drawn at the card's real width, so text stays 11px however wide the card is
  const W=Math.max(280,Math.round(target.clientWidth)||640),H=opts.h||200,L=38,R=series.length>1?52:12,T=10,B=24,pw=W-L-R,ph=H-T-B;
  const n=data.days.length,max=niceMax(Math.max(1,...series.flatMap(s=>data.days.map(d=>d[s.key]||0))));
  if(series.length>1){
    const lg=document.createElement('div');lg.className='an-legend';
    lg.innerHTML=series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('');
    target.appendChild(lg);
  }
  const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':opts.label||''},target);
  const x=i=>L+(n<2?pw/2:i*pw/(n-1)),y=v=>T+ph-v/max*ph;
  for(let k=0;k<=4;k++){const v=max*k/4,yy=y(v);el('line',{class:k?'grid':'base',x1:L,x2:L+pw,y1:yy,y2:yy},svg);const t=el('text',{x:L-6,y:yy+3.5,'text-anchor':'end'},svg);t.textContent=fmt(v)}
  const every=Math.max(1,Math.ceil(n/Math.max(2,Math.floor(pw/70))));
  // every so often, plus the last day when it isn't crowded against the one before
  const lastToo=n>1&&((n-1)%every)*pw/(n-1)>=72;
  data.days.forEach((d,i)=>{if(i%every&&!(i===n-1&&lastToo))return;const t=el('text',{x:x(i),y:H-6,'text-anchor':i===0?'start':i===n-1?'end':'middle'},svg);t.textContent=dayLabel(d.day)});
  // labels at the lines' ends, pushed apart so they never sit on each other
  const ends=series.map(s=>({s,y:y(data.days[n-1]?.[s.key]||0)})).sort((a,b)=>a.y-b.y);
  for(let k=1;k<ends.length;k++)if(ends[k].y-ends[k-1].y<13)ends[k].y=ends[k-1].y+13;
  for(const s of series){
    const pts=data.days.map((d,i)=>[x(i),y(d[s.key]||0)]);
    const path=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join('');
    if(series.length===1)el('path',{class:'area',d:`${path}L${x(n-1)},${y(0)}L${x(0)},${y(0)}Z`,fill:s.color},svg);
    el('path',{class:'line',d:path,stroke:s.color},svg);
    if(series.length>1){const t=el('text',{class:'lab',x:pts[n-1][0]+6,y:ends.find(e=>e.s===s).y+4},svg);t.textContent=s.label}
  }
  // hover: a crosshair and every series' value that day
  const cross=el('line',{class:'cross',y1:T,y2:T+ph,visibility:'hidden'},svg);
  const dots=series.map(s=>el('circle',{class:'dot',r:4.5,fill:s.color,visibility:'hidden'},svg));
  const hit=el('rect',{class:'hit',x:L,y:T,width:pw,height:ph},svg);
  const move=e=>{
    const r=svg.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*W;
    const i=Math.max(0,Math.min(n-1,Math.round(n<2?0:(px-L)/pw*(n-1)))),d=data.days[i];
    cross.setAttribute('x1',x(i));cross.setAttribute('x2',x(i));cross.setAttribute('visibility','visible');
    series.forEach((s,k)=>{dots[k].setAttribute('cx',x(i));dots[k].setAttribute('cy',y(d[s.key]||0));dots[k].setAttribute('visibility','visible')});
    showTip(`<b>${esc(dayLong(d.day))}</b>${series.map(s=>`<div class="row"><i style="background:${s.color}"></i>${esc(s.label)}: <b>${fmt(d[s.key])}</b>${s.extra?` ${esc(s.extra(d))}`:''}</div>`).join('')}`,e.clientX,e.clientY);
  };
  hit.addEventListener('pointermove',move);hit.addEventListener('pointerdown',move);
  hit.addEventListener('pointerleave',()=>{cross.setAttribute('visibility','hidden');dots.forEach(d=>d.setAttribute('visibility','hidden'));hideTip()});
}

/* ── one bar a day ── */
function dayBars(target,key,color,label){
  target.replaceChildren();
  const W=Math.max(280,Math.round(target.clientWidth)||640),H=170,L=38,R=8,T=10,B=24,pw=W-L-R,ph=H-T-B,n=data.days.length;
  const max=niceMax(Math.max(1,...data.days.map(d=>d[key]||0)));
  if(!data.days.some(d=>d[key])){target.innerHTML='<div class="an-empty">None yet in this range.</div>';return}
  const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':label},target);
  const slot=pw/n,bw=Math.max(2,slot-2),y=v=>T+ph-v/max*ph;
  for(let k=0;k<=4;k++){const v=max*k/4,yy=y(v);el('line',{class:k?'grid':'base',x1:L,x2:L+pw,y1:yy,y2:yy},svg);const t=el('text',{x:L-6,y:yy+3.5,'text-anchor':'end'},svg);t.textContent=fmt(v)}
  const every=Math.max(1,Math.ceil(n/Math.max(2,Math.floor(pw/70))));
  data.days.forEach((d,i)=>{
    const v=d[key]||0,x=L+i*slot+1,h=v/max*ph;
    if(v){
      // a 4px rounded top, square on the baseline
      const r=Math.min(4,bw/2,h),top=T+ph-h;
      el('path',{class:'bar',fill:color,d:`M${x},${T+ph}V${top+r}Q${x},${top} ${x+r},${top}H${x+bw-r}Q${x+bw},${top} ${x+bw},${top+r}V${T+ph}Z`},svg);
    }
    const hit=el('rect',{class:'hit',x:L+i*slot,y:T,width:slot,height:ph},svg);
    const show=e=>showTip(`<b>${esc(dayLong(d.day))}</b><div>${fmt(v)} ${esc(label)}</div>`,e.clientX,e.clientY);
    hit.addEventListener('pointermove',show);hit.addEventListener('pointerdown',show);hit.addEventListener('pointerleave',hideTip);
    if(i%every===0||(i===n-1&&(i%every)*slot>=72)){const t=el('text',{x:L+i*slot+slot/2,y:H-6,'text-anchor':'middle'},svg);t.textContent=dayLabel(d.day)}
  });
}

/* ── ranked lists ── */
function ranked(target,rows,labelOf,unit){
  if(!rows.length){target.innerHTML='<div class="an-empty">None yet in this range.</div>';return}
  const max=rows[0].n;
  target.innerHTML=`<div class="an-bars">${rows.map((r,i)=>`<div class="an-bar" data-i="${i}"><span class="nm">${esc(labelOf(r.name))}</span><span class="v">${fmt(r.n)}</span><span class="tr"><span class="fl" style="width:${Math.max(1,r.n/max*100)}%"></span></span></div>`).join('')}</div>`;
  $$('.an-bar',target).forEach(b=>{
    const r=rows[+b.dataset.i],show=e=>showTip(`<b>${esc(labelOf(r.name))}</b><div>${fmt(r.n)} ${esc(unit)}</div>`,e.clientX,e.clientY);
    b.addEventListener('pointermove',show);b.addEventListener('pointerleave',hideTip);
  });
}

/* ── busiest times: the server's UTC day and hour, turned into your weekday and hour ── */
function heat(target,fig){
  const grid=Array.from({length:7},()=>new Array(24).fill(0));
  for(const h of data.hours){const t=new Date(`${h.day}T${String(h.hour).padStart(2,'0')}:00:00Z`);grid[t.getDay()][t.getHours()]+=h.n}
  const max=Math.max(0,...grid.flat());
  if(!max){target.innerHTML='<div class="an-empty">None yet in this range.</div>';table(fig,['Day'],[]);return}
  const step=v=>v?Math.min(6,1+Math.floor(v/max*5.999)):0; // 0 is nothing; 1..6 by share of the busiest hour
  const WD=[...Array(7)].map((_,i)=>new Date(2024,0,7+i).toLocaleDateString([],{weekday:'short'})); // 7 Jan 2024 was a Sunday
  const hr=h=>new Date(2024,0,1,h).toLocaleTimeString([],{hour:'numeric'});
  const order=[1,2,3,4,5,6,0]; // Monday first
  let html='<div class="an-heat" role="img" aria-label="Activity by weekday and hour"><span></span>';
  for(let h=0;h<24;h++)html+=`<span class="an-hr">${h%6===0?esc(hr(h).replace(/\s/g,'')):''}</span>`;
  for(const d of order){
    html+=`<span class="an-wd">${esc(WD[d])}</span>`;
    for(let h=0;h<24;h++)html+=`<span class="c" data-d="${d}" data-h="${h}" style="background:var(--an-h${step(grid[d][h])})"></span>`;
  }
  html+='</div><div class="an-scale">Less '+[0,1,2,3,4,5,6].map(i=>`<i style="background:var(--an-h${i})"></i>`).join('')+' More</div>';
  target.innerHTML=html;
  $$('.an-heat .c',target).forEach(c=>{
    const d=+c.dataset.d,h=+c.dataset.h,show=e=>showTip(`<b>${esc(WD[d])} ${esc(hr(h))}</b><div>${fmt(grid[d][h])} things done</div>`,e.clientX,e.clientY);
    c.addEventListener('pointermove',show);c.addEventListener('pointerleave',hideTip);
  });
  table(fig,['Hour',...order.map(d=>WD[d])],[...Array(24).keys()].map(h=>[hr(h),...order.map(d=>grid[d][h])]));
}

/* ── the headline numbers ── */
function kpis(){
  const t=data.totals,today=data.days[data.days.length-1]||{};
  const K=[['visitors','Visitors',today.visitors,'today'],['app','Apps opened',today.app],['song','Songs played',today.song],['movie','Movies started',today.movie],
    ['vm','VMs started',today.vm],['ai','AI messages',today.ai],['chat','Chat messages',today.chat],['call','Calls',today.call],['voice','Voice joins',today.voice],['signup','New accounts',today.signup]];
  $('#an-kpis').innerHTML=K.map(([k,label,td])=>`<div class="an-kpi"><b>${fmt(t[k])}</b><span>${label}</span><small>${fmt(td)} today</small></div>`).join('');
}

function render(){
  if(!data)return;
  const cs=getComputedStyle(box),c=v=>cs.getPropertyValue(v).trim();
  $('#an-since').textContent=`Counting since ${dayDate(data.since).toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'})} · counts only, never who`;
  kpis();
  const fig=id=>$(id).closest('figure');
  lines($('#an-visitors'),[{key:'visitors',label:'Visitors',color:c('--an-s1'),extra:d=>`(${fmt(d.accounts)} with accounts)`}],{label:'Visitors per day',h:190});
  table(fig('#an-visitors'),['Day','Visitors','With accounts','Visits'],data.days.map(d=>[dayLong(d.day),d.visitors,d.accounts,d.visit||0]));
  heat($('#an-heat'),fig('#an-heat'));
  ranked($('#an-apps'),data.top.app,n=>APP_LABEL[n]||n,'opens');
  dayBars($('#an-vms'),'vm',c('--an-s1'),'VMs started');
  table(fig('#an-vms'),['Day','VMs started'],data.days.map(d=>[dayLong(d.day),d.vm||0]));
  lines($('#an-social'),[{key:'chat',label:'Chat',color:c('--an-s1')},{key:'ai',label:'AI',color:c('--an-s2')},{key:'call',label:'Calls',color:c('--an-s3')}],{label:'Chat messages, AI messages and calls per day',h:180});
  table(fig('#an-social'),['Day','Chat','AI','Calls'],data.days.map(d=>[dayLong(d.day),d.chat||0,d.ai||0,d.call||0]));
  ranked($('#an-songs'),data.top.song,n=>n,'plays');
  ranked($('#an-movies'),data.top.movie,n=>n,'starts');
}
async function load(){
  if(loading)return;loading=true;
  try{
    const r=await fetch(`/api/stats/report?days=${days}`,{cache:'no-store'});
    if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'HTTP '+r.status);
    data=await r.json();render();
  }catch(e){$('#an-kpis').innerHTML=`<div class="an-empty">Couldn't load the analytics. ${esc(e.message)}</div>`}
  finally{loading=false}
}
$('#an-range').addEventListener('click',e=>{
  const b=e.target.closest('[data-d]');if(!b)return;click();
  days=+b.dataset.d;$$('#an-range button').forEach(x=>x.classList.toggle('on',x===b));load();
});
// the theme changed: the colours are read at draw time, so draw again
new MutationObserver(()=>render()).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
// and when the panel's width changes (charts are drawn at their real size)
let lastW=0,rT=0;
new ResizeObserver(()=>{const w=box.clientWidth;if(!data||Math.abs(w-lastW)<8)return;lastW=w;clearTimeout(rT);rT=setTimeout(render,120)}).observe(box);
addEventListener('scroll',hideTip,true);

window.adStats={load,get data(){return data}};
})();
