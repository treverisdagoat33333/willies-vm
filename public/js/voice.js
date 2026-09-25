/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   VOICE CHANNELS (accounts only, up to 6 people a channel)
   "Join voice" in a text channel's header. Voice always goes through our
   server (/voice/ in chat.js), so it works on networks that block WebRTC:
   the mic is 16 kHz μ-law from js/call-worklet.js, 20 ms at a time, and
   each person's voice arrives tagged with who said it, gets its own
   playback timeline (80 ms of slack) and lights up their avatar.
   Who's in which channel's voice comes over the chat socket
   ({type:'voice'}), so the channel list shows it to everyone.
   Uses app.js helpers ($, $$, toast, click, avatar, nameOf, dcChannels,
   dcActive, dcActiveIsDM, chatMeAccount, dcRenderChannels).
   ═══════════════════════════════════════════════════════════ */
(()=>{
const BAR=$('#vc');
const ULAW=new Float32Array(256).map((_,u)=>{u=~u&0xff;const e=(u>>4)&7;const x=((((u&15)<<3)+0x84)<<e)-0x84;return(u&0x80?-x:x)/32768});
const TALK=.03,TALK_MS=300;
let rooms={}; // channel slug -> [{name, muted}], from the server
let v=null; // the voice you're in: {slug, ws, ctx, mic, i, members, muted, play: Map(i -> {at, talkAt, got}), myAt, sent, tries, opened}
let ticker=null;

const chName=slug=>dcChannels.find(c=>c.slug===slug)?.name||slug;

/* ═══ joining and leaving ═══ */
async function join(slug){
  if(!slug||v?.slug===slug)return;
  if(!chatMeAccount){toast('Make an account to use voice.','err');return}
  if(window.calls?.active){toast('Hang up your call first.','err');return}
  if((rooms[slug]?.length||0)>=6){toast('Voice is full (6 people).','err');return}
  if(v)leave(true);
  const me={slug,ws:null,ctx:null,mic:null,i:-1,members:[],muted:false,play:new Map(),myAt:0,sent:0,tries:0,opened:false};
  v=me;render();
  try{me.mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})}
  catch(e){if(v===me){v=null;render()}toast(e.name==='NotAllowedError'?'Microphone blocked. Allow it in the browser to use voice.':"Couldn't start the microphone.",'err');return}
  if(v!==me){me.mic.getTracks().forEach(t=>t.stop());return}
  try{
    let ctx;
    try{ctx=new AudioContext({sampleRate:16000,latencyHint:'interactive'})}catch(_){ctx=new AudioContext({latencyHint:'interactive'})}
    me.ctx=ctx;
    await ctx.audioWorklet.addModule('/js/call-worklet.js');
    if(v!==me)return;
    const src=ctx.createMediaStreamSource(me.mic),node=new AudioWorkletNode(ctx,'wvm-mic'),silent=ctx.createGain();
    silent.gain.value=0;src.connect(node).connect(silent).connect(ctx.destination); // it only runs while connected to the output
    node.port.onmessage=({data})=>{
      if(v!==me||me.muted)return;
      const b=new Uint8Array(data);
      let peak=0;for(let k=0;k<b.length;k+=4){const a=Math.abs(ULAW[b[k]]);if(a>peak)peak=a}
      if(peak>TALK)me.myAt=performance.now();
      if(me.ws?.readyState===1){me.ws.send(b);me.sent++}
    };
    ctx.resume().catch(()=>{});
  }catch(e){console.warn('voice audio',e);leave(true);toast("Couldn't start voice's sound.",'err');return}
  connect(me);
}
function connect(me){
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/voice/?channel=${encodeURIComponent(me.slug)}`);
  ws.binaryType='arraybuffer';me.ws=ws;
  ws.onopen=()=>{me.opened=true;me.tries=0;if(me.muted)ws.send(JSON.stringify({t:'mute',on:true}))};
  ws.onmessage=({data})=>{
    if(v!==me)return;
    if(typeof data==='string'){
      let d;try{d=JSON.parse(data)}catch(_){return}
      if(d.t==='roster'){me.i=d.you;me.members=Array.isArray(d.members)?d.members:[];render()}
      return;
    }
    const b=new Uint8Array(data);
    if(b.length>1)play(me,b[0],b.subarray(1));
  };
  ws.onclose=e=>{
    if(v!==me||me.ws!==ws)return;
    const msg={'joined from somewhere else':'You joined voice somewhere else.','timed out':"You're timed out, so you left voice.",banned:"You're banned from chat.",kicked:'You were kicked from chat.','channel deleted':'That channel was deleted.'}[e.reason];
    if(msg){leave(true);toast(msg,'err');return}
    if(!me.opened){leave(true);toast("Couldn't join voice. It may be full, or you may be timed out.",'err');return}
    if(me.tries++<5){render('Reconnecting…');setTimeout(()=>{if(v===me)connect(me)},1000*me.tries)}
    else{leave(true);toast('Lost the connection to voice. Join again in a moment.','err')}
  };
}
function leave(quiet){
  const me=v;if(!me)return;
  v=null;
  try{me.ws?.close(1000)}catch(_){}
  me.mic?.getTracks().forEach(t=>t.stop());
  me.ctx?.close().catch(()=>{});
  render();
  if(!quiet)toast('You left voice');
}
function toggleMute(){
  if(!v)return;
  v.muted=!v.muted;
  v.mic?.getAudioTracks().forEach(t=>{t.enabled=!v.muted});
  if(v.ws?.readyState===1)v.ws.send(JSON.stringify({t:'mute',on:v.muted}));
  render();
}

/* ═══ sound ═══ */
function play(me,i,bytes){
  const ctx=me.ctx;if(!ctx)return;
  let p=me.play.get(i);if(!p)me.play.set(i,p={at:0,talkAt:0,got:0,peak:0});
  const buf=ctx.createBuffer(1,bytes.length,16000),d=buf.getChannelData(0);
  let peak=0;
  for(let k=0;k<bytes.length;k++){d[k]=ULAW[bytes[k]];const a=d[k]<0?-d[k]:d[k];if(a>peak)peak=a}
  if(peak>TALK)p.talkAt=performance.now();
  if(peak>p.peak)p.peak=peak;
  p.got++;
  // each person on their own timeline, so voices mix instead of queueing behind each other
  const now=ctx.currentTime;
  if(p.at<now+.02||p.at>now+.5)p.at=now+.08;
  const s=ctx.createBufferSource();s.buffer=buf;s.connect(ctx.destination);s.start(p.at);p.at+=buf.duration;
}

/* ═══ drawing ═══ */
const MIC_OFF='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/><path class="x" d="M3 3l18 18"/></svg>';
function render(status){
  BAR.hidden=!v;
  if(v){
    $('#vc-name').textContent='#'+chName(v.slug);
    $('#vc-status').textContent=status||(v.members.length?`${v.members.length} in voice`:'Connecting…');
    $('#vc-mute').classList.toggle('on',v.muted);
    $('#vc-mute').title=v.muted?'Unmute':'Mute';
    const box=$('#vc-people');
    box.replaceChildren(...v.members.map(m=>{
      const d=document.createElement('div');d.className='vc-p'+(m.i===v.i?' me':'');d.dataset.i=m.i;
      d.appendChild(avatar(m.name,'vc-av'));
      const n=document.createElement('span');n.className='vc-n';n.textContent=m.i===v.i?'You':nameOf(m.name);d.appendChild(n);
      if(m.muted){const x=document.createElement('span');x.className='vc-muted';x.title='Muted';x.innerHTML=MIC_OFF;d.appendChild(x)}
      return d;
    }));
    if(!ticker)ticker=setInterval(talking,150);
  }else{clearInterval(ticker);ticker=null}
  header();
}
function talking(){
  if(!v)return;
  const now=performance.now();
  for(const el of $$('#vc-people .vc-p')){
    const i=+el.dataset.i,at=i===v.i?(v.muted?0:v.myAt):(v.play.get(i)?.talkAt||0);
    el.classList.toggle('talking',now-at<TALK_MS);
  }
}
/* the header button of the channel you're looking at */
function header(){
  const b=$('#dc-voice');if(!b)return;
  const slug=dcActive,n=rooms[slug]?.length||0,here=v?.slug===slug;
  b.hidden=dcActiveIsDM||!chatMeAccount;
  b.classList.toggle('on',here);
  b.title=here?'Leave voice':n?`Join voice (${n} talking here)`:'Join voice';
  b.querySelector('.n').textContent=n?String(n):'';
}
/* the badge next to a channel with people in its voice */
function badge(slug){
  const list=rooms[slug];if(!list?.length)return null;
  const s=document.createElement('span');s.className='dc-vc';s.title=list.map(m=>nameOf(m.name)).join(', ')+' in voice';
  s.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/></svg>';
  s.appendChild(document.createTextNode(String(list.length)));
  return s;
}
function setRooms(all){rooms=all&&typeof all==='object'?all:{};dcRenderChannels();header()}
function setRoom(slug,members){
  if(Array.isArray(members)&&members.length)rooms[slug]=members;else delete rooms[slug];
  dcRenderChannels();header();
}

/* ═══ wiring ═══ */
$('#dc-voice').onclick=()=>{click();v?.slug===dcActive?leave():join(dcActive)};
$('#vc-mute').onclick=()=>{click();toggleMute()};
$('#vc-leave').onclick=()=>{click();leave()};
$('#vc-name').onclick=()=>{if(v&&typeof openChat==='function'){openChat();if(dcActive!==v.slug)dcOpen(v.slug)}};

window.voice={join,leave,toggleMute,setRooms,setRoom,badge,header,
  get active(){return !!v},
  /* for the tests: who's here, and what's been sent and heard from each */
  stats(){return v?{slug:v.slug,i:v.i,muted:v.muted,members:v.members,sent:v.sent,heard:Object.fromEntries([...v.play].map(([i,p])=>[i,{got:p.got,peak:p.peak}]))}:null}};
})();
