/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   MOTION — springs, squish, magnets, a dock, tilt and confetti

   Everything here is decoration. It checks enabled() at the moment it
   runs, so the "Bouncy extras", "Reduce motion" and "Performance"
   settings (and the OS reduced-motion preference) switch it off live.

   It only writes the individual transform properties (translate,
   rotate, scale) or CSS variables, never `transform` itself, so it
   stacks on top of the stylesheet's own hover/active transforms.
   ═══════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  function enabled(){
    return root.dataset.bouncy!=='off'&&root.dataset.motion!=='off'&&root.dataset.perf!=='on'&&!reduced.matches;
  }

  /* ── a tiny spring integrator ─────────────────────────────
     Underdamped on purpose: it overshoots and settles, which is
     what makes things feel bouncy instead of merely eased. */
  const active=new Set();
  let raf=0,last=0;
  function spring(opts){
    const s={x:opts.from??0,v:0,target:opts.from??0,k:opts.stiffness??190,c:opts.damping??11,apply:opts.apply,done:opts.done};
    s.to=t=>{s.target=t;active.add(s);kick()};
    s.snap=t=>{s.x=s.target=t;s.v=0;s.apply(t);active.delete(s)};
    return s;
  }
  function kick(){if(!raf){last=performance.now();raf=requestAnimationFrame(step)}}
  function step(now){
    const dt=Math.min(.032,(now-last)/1000);last=now;
    for(const s of active){
      // two half-steps keep stiff springs stable at low frame rates
      for(let i=0;i<2;i++){
        const a=s.k*(s.target-s.x)-s.c*s.v;
        s.v+=a*dt/2;s.x+=s.v*dt/2;
      }
      if(Math.abs(s.target-s.x)<.002&&Math.abs(s.v)<.002){s.x=s.target;s.v=0;active.delete(s);s.done?.()}
      s.apply(s.x);
    }
    raf=active.size?requestAnimationFrame(step):0;
  }
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  /* ── squish: squash-and-stretch on press, overshoot on release ── */
  const SQUISH='.btn,.tbb,.dicon,.tile,.gcard,.cg-card,.chip,.cg-chip,.dc-react,.dc-ch,.dc-mem,.switch,.sw,.wall,.ritem,.bm,.tab,.dc-compose .send,.dc-emoji button,.ad-stat,#tb-start,.dc-tools button,.snav button';
  const pressed=new WeakMap();
  document.addEventListener('pointerdown',e=>{
    if(!enabled()||e.button!==0)return;
    const el=e.target.closest(SQUISH);if(!el||el.disabled)return;
    pressed.get(el)?.cancel();
    const small=el.offsetWidth<60;
    pressed.set(el,el.animate([{scale:'1 1'},{scale:small?'.86 .9':'.95 .93'}],{duration:110,easing:'cubic-bezier(.3,.7,.4,1)',fill:'forwards'}));
    const release=()=>{
      removeEventListener('pointerup',release);removeEventListener('pointercancel',release);
      pressed.get(el)?.cancel();
      pressed.set(el,el.animate([
        {scale:small?'.86 .9':'.95 .93'},
        {scale:small?'1.14 .92':'1.05 .97',offset:.3},
        {scale:small?'.95 1.06':'.985 1.02',offset:.55},
        {scale:'1.02 .99',offset:.78},
        {scale:'1 1'}
      ],{duration:520,easing:'ease-out'}));
    };
    addEventListener('pointerup',release);addEventListener('pointercancel',release);
  },{passive:true});

  /* ── magnets: icons lean toward the cursor and spring back ── */
  const MAGNET='.tile,#icons .dicon,.dc-compose .send,.btn.primary,.ad-stat';
  const mags=new WeakMap();
  function magnet(el){
    let m=mags.get(el);if(m)return m;
    const set=()=>{el.style.translate=`${m.x.x.toFixed(2)}px ${m.y.x.toFixed(2)}px`};
    m={x:spring({stiffness:220,damping:13,apply:set}),y:spring({stiffness:220,damping:13,apply:set})};
    mags.set(el,m);return m;
  }
  document.addEventListener('pointermove',e=>{
    if(!fine.matches||!enabled())return;
    const el=e.target.closest(MAGNET);if(!el)return;
    const r=el.getBoundingClientRect(),m=magnet(el);
    const pull=el.classList.contains('tile')||el.classList.contains('ad-stat')?.08:.22;
    m.x.to(clamp((e.clientX-(r.left+r.width/2))*pull,-10,10));
    m.y.to(clamp((e.clientY-(r.top+r.height/2))*pull,-8,8));
  },{passive:true});
  document.addEventListener('pointerout',e=>{
    const el=e.target.closest?.(MAGNET);if(!el||el.contains(e.relatedTarget))return;
    const m=mags.get(el);if(m){m.x.to(0);m.y.to(0)}
  },{passive:true});

  /* ── dock: taskbar icons swell by distance from the cursor ── */
  const center=document.getElementById('tb-center');
  const dock=new WeakMap();
  function dockSpring(ic){
    let s=dock.get(ic);if(s)return s;
    s=spring({stiffness:260,damping:16,apply:v=>{ic.style.scale=String(1+v*.42);ic.style.translate=`0 ${(-v*9).toFixed(2)}px`}});
    dock.set(ic,s);return s;
  }
  if(center){
    center.addEventListener('pointermove',e=>{
      if(!fine.matches||!enabled())return;
      const bottom=root.dataset.tbside!=='top';
      for(const b of center.querySelectorAll('.tbb')){
        const ic=b.querySelector('.ic,.i');if(!ic||!b.offsetParent)continue;
        const r=b.getBoundingClientRect(),d=Math.abs(e.clientX-(r.left+r.width/2));
        const v=Math.max(0,1-d/110);
        dockSpring(ic).to(bottom?v*v:-(v*v)*.6);
      }
    },{passive:true});
    center.addEventListener('pointerleave',()=>{for(const b of center.querySelectorAll('.tbb')){const ic=b.querySelector('.ic,.i');if(ic)dockSpring(ic).to(0)}});
  }

  /* ── tilt: cards turn toward the cursor in 3D ─────────────── */
  const TILT='.gcard,.cg-card,.ad-stat';
  const tilts=new WeakMap();
  function tilt(el){
    let t=tilts.get(el);if(t)return t;
    const set=()=>{el.style.setProperty('--rx',t.rx.x.toFixed(2)+'deg');el.style.setProperty('--ry',t.ry.x.toFixed(2)+'deg')};
    t={rx:spring({stiffness:170,damping:12,apply:set}),ry:spring({stiffness:170,damping:12,apply:set})};
    tilts.set(el,t);return t;
  }
  document.addEventListener('pointermove',e=>{
    if(!fine.matches||!enabled())return;
    const el=e.target.closest(TILT);if(!el)return;
    const r=el.getBoundingClientRect(),t=tilt(el);
    const px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;
    t.ry.to(px*16);t.rx.to(-py*16);
    el.style.setProperty('--gx',(px+.5)*100+'%');el.style.setProperty('--gy',(py+.5)*100+'%');
  },{passive:true});
  document.addEventListener('pointerout',e=>{
    const el=e.target.closest?.(TILT);if(!el||el.contains(e.relatedTarget))return;
    const t=tilts.get(el);if(t){t.rx.to(0);t.ry.to(0)}
  },{passive:true});

  /* ── windows sway with drag speed, then wobble back ────────── */
  let dragWin=null,lastX=0,lastT=0;
  const sway=new WeakMap();
  function swaySpring(win){
    let s=sway.get(win);if(s)return s;
    s=spring({stiffness:150,damping:9,apply:v=>{win.style.rotate=v.toFixed(3)+'deg'}});
    sway.set(win,s);return s;
  }
  document.addEventListener('pointermove',e=>{
    const win=document.querySelector('.win.dragging');
    if(!win){if(dragWin){swaySpring(dragWin).to(0);dragWin=null}return}
    if(!enabled())return;
    const now=performance.now();
    if(dragWin!==win){dragWin=win;lastX=e.clientX;lastT=now;return}
    const vx=(e.clientX-lastX)/Math.max(8,now-lastT);
    lastX=e.clientX;lastT=now;
    swaySpring(win).to(clamp(vx*3.2,-7,7));
  },{passive:true});
  document.addEventListener('pointerup',()=>{if(dragWin){swaySpring(dragWin).to(0);dragWin=null}},{passive:true});

  /* ── boot: desktop icons drop in one after another ─────────── */
  document.querySelectorAll('#icons .dicon').forEach((d,i)=>d.style.setProperty('--i',i));
  document.querySelectorAll('#tb-center .tbb').forEach((d,i)=>d.style.setProperty('--i',i));

  /* ── the chat badge hops every time the count goes up ──────── */
  const badge=document.getElementById('chat-badge');
  if(badge)new MutationObserver(()=>{
    if(!enabled()||!badge.classList.contains('show'))return;
    badge.animate([{scale:'1'},{scale:'1.6'},{scale:'.85'},{scale:'1.12'},{scale:'1'}],{duration:600,easing:'ease-out'});
    const ic=document.querySelector('#tb-chat .ic');
    ic?.animate([{rotate:'0deg'},{rotate:'-14deg'},{rotate:'11deg'},{rotate:'-6deg'},{rotate:'3deg'},{rotate:'0deg'}],{duration:650,easing:'ease-out'});
  }).observe(badge,{childList:true,characterData:true,subtree:true});

  /* ── one-shot helpers used by the app ──────────────────────── */
  function pop(el){
    if(!el||!enabled())return;
    el.animate([{scale:'1'},{scale:'1.22'},{scale:'.92'},{scale:'1.05'},{scale:'1'}],{duration:520,easing:'ease-out'});
  }
  function shake(el){
    if(!el)return;
    if(!enabled()){el.animate([{opacity:1},{opacity:.6},{opacity:1}],{duration:260});return}
    el.animate([{translate:'0'},{translate:'-12px'},{translate:'10px'},{translate:'-7px'},{translate:'5px'},{translate:'-2px'},{translate:'0'}],{duration:480,easing:'ease-out'});
  }
  function spin(el){
    const i=el?.querySelector('.i')||el;if(!i||!enabled())return;
    i.animate([{rotate:'0deg'},{rotate:'380deg'},{rotate:'360deg'}],{duration:620,easing:'cubic-bezier(.3,.8,.4,1)'});
  }
  /* numbers roll up with a little overshoot */
  function countUp(el,from,to){
    if(!el||!enabled())return false;
    const s=spring({from,stiffness:120,damping:14,apply:v=>{el.textContent=Math.max(0,Math.round(v))},done:()=>{el.textContent=to}});
    s.to(to);
    el.animate([{scale:'1'},{scale:'1.15'},{scale:'1'}],{duration:420,easing:'ease-out'});
    return true;
  }

  const COLORS=()=>{const cs=getComputedStyle(root);return[cs.getPropertyValue('--accent').trim()||'#4f8cff',cs.getPropertyValue('--accent2').trim()||'#a855f7','#fbbf24','#22c55e','#ec4899','#06b6d4','#f97316']};
  function particle(x,y,{text,color,size,dx,dy,fall,spinDeg,dur}){
    const p=document.createElement('div');
    p.className=text?'fx-emoji':'fx-confetti';
    if(text)p.textContent=text;
    else{p.style.background=color;p.style.width=size+'px';p.style.height=size*(Math.random()<.5?1.6:.6)+'px';if(Math.random()<.3)p.style.borderRadius='50%'}
    p.style.left=x+'px';p.style.top=y+'px';
    document.body.appendChild(p);
    const a=p.animate([
      {translate:'0 0',rotate:'0deg',opacity:1,scale:text?'.4':'1'},
      {translate:`${dx*.65}px ${dy}px`,rotate:`${spinDeg*.5}deg`,opacity:1,scale:'1',offset:.35,easing:'cubic-bezier(.4,0,1,1)'},
      {translate:`${dx}px ${dy+fall}px`,rotate:`${spinDeg}deg`,opacity:0,scale:text?'.8':'1'}
    ],{duration:dur,easing:'cubic-bezier(.15,.8,.35,1)'});
    a.onfinish=()=>p.remove();
  }
  /* confetti cannon: from a point, or a double burst from the bottom corners */
  function celebrate(opts={}){
    if(!enabled())return;
    const colors=COLORS(),n=opts.count||90;
    const origins=opts.x!=null?[[opts.x,opts.y,-90]]:[[innerWidth*.12,innerHeight*.92,-62],[innerWidth*.88,innerHeight*.92,-118]];
    origins.forEach(([ox,oy,ang])=>{
      for(let i=0;i<n/origins.length;i++){
        const a=(ang+(Math.random()-.5)*(opts.x!=null?160:55))*Math.PI/180;
        const speed=260+Math.random()*420;
        particle(ox,oy,{color:colors[i%colors.length],size:6+Math.random()*6,
          dx:Math.cos(a)*speed,dy:Math.sin(a)*speed,fall:280+Math.random()*320,
          spinDeg:(Math.random()-.5)*1080,dur:1400+Math.random()*900});
      }
    });
  }
  /* a little fountain of the emoji you just reacted with */
  function emojiBurst(emoji,from){
    if(!enabled()||!from)return;
    const r=from.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    for(let i=0;i<7;i++){
      const a=(-90+(Math.random()-.5)*110)*Math.PI/180,speed=60+Math.random()*90;
      particle(x-10,y-10,{text:emoji,dx:Math.cos(a)*speed,dy:Math.sin(a)*speed,fall:60+Math.random()*60,spinDeg:(Math.random()-.5)*120,dur:900+Math.random()*400});
    }
  }

  window.motion={enabled,spring,pop,shake,spin,countUp,celebrate,emojiBurst};
})();
