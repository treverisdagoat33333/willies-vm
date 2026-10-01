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

   Discord style: while you look at the channel you're in, a stage docks at
   the top of the chat (#vstage over #dc-callslot, like a call) with a tile
   each, the talker ringed green, and mute and deafen shown to everyone.
   Deafen silences everyone for you (the server stops sending you voice) and
   mutes you too.

   Go Live shares your screen with the channel, at the call presets
   (window.calls.share). Others get a Live tile and choose to watch. Each
   watcher gets the stream straight from you over WebRTC (the handshake goes
   through the voice socket); a watcher whose network blocks that within 9 s
   (or is known to, wvm.callRelayUntil) gets JPEG pictures through our server
   instead, made once for all of them.
   Uses app.js helpers ($, $$, toast, click, avatar, nameOf, colorOf,
   dcChannels, dcActive, dcActiveIsDM, chatMe, chatMeAccount, dcRenderChannels,
   openChat, dcOpen).
   ═══════════════════════════════════════════════════════════ */
(()=>{
const BAR=$('#vc'),ST=$('#vstage');
const ULAW=new Float32Array(256).map((_,u)=>{u=~u&0xff;const e=(u>>4)&7;const x=((((u&15)<<3)+0x84)<<e)-0x84;return(u&0x80?-x:x)/32768});
const TALK=.03,TALK_MS=300;
const TAG=[0x57,0x56,0x53,0x31]; // "WVS1": a picture of a stream, through the server
const DIRECT_WAIT=9000,RELAY_MEMORY=24*3600e3;
let rooms={}; // channel slug -> [{name, muted, live}], from the server
let v=null; // the voice you're in (see join)
let ticker=null;

const chName=slug=>dcChannels.find(c=>c.slug===slug)?.name||slug;
const lsGet=k=>{try{return localStorage.getItem(k)}catch(_){return null}};
const relayFirst=()=>lsGet('wvm.callRelay')==='always'||Date.now()<+lsGet('wvm.callRelayUntil');
const blocked=()=>lsGet('wvm.callRelay')==='blocked'; // the tests' network that blocks WebRTC

/* ═══ joining and leaving ═══ */
async function join(slug){
  if(!slug||v?.slug===slug)return;
  if(!chatMeAccount){toast('Make an account to use voice.','err');return}
  if(window.calls?.active){toast('Hang up your call first.','err');return}
  if((rooms[slug]?.length||0)>=6){toast('Voice is full (6 people).','err');return}
  if(v)leave(true);
  const me={slug,ws:null,ctx:null,out:null,mic:null,i:-1,members:[],muted:false,deaf:false,mutedBeforeDeaf:false,
    play:new Map(),myAt:0,sent:0,tries:0,opened:false,
    live:null,peers:new Map(),watchers:[],frameT:0,     // your stream, and who's watching it
    watching:new Map(),                                  // streams you watch: i -> {pc, relay, t, frames}
    focus:null,big:false};
  v=me;render();
  try{me.mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})}
  catch(e){if(v===me){v=null;render()}toast(e.name==='NotAllowedError'?'Microphone blocked. Allow it in the browser to use voice.':"Couldn't start the microphone.",'err');return}
  if(v!==me){me.mic.getTracks().forEach(t=>t.stop());return}
  try{
    let ctx;
    try{ctx=new AudioContext({sampleRate:16000,latencyHint:'interactive'})}catch(_){ctx=new AudioContext({latencyHint:'interactive'})}
    me.ctx=ctx;
    me.out=ctx.createGain();me.out.connect(ctx.destination);
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
    resumeSound(ctx);
  }catch(e){console.warn('voice audio',e);leave(true);toast("Couldn't start voice's sound.",'err');return}
  connect(me);
}
function send(me,o){if(me?.ws?.readyState===1)me.ws.send(JSON.stringify(o))}
function connect(me){
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/voice/?channel=${encodeURIComponent(me.slug)}`);
  ws.binaryType='arraybuffer';me.ws=ws;
  ws.onopen=()=>{
    me.opened=true;me.tries=0;
    if(me.muted)send(me,{t:'mute',on:true});
    if(me.deaf)send(me,{t:'deaf',on:true});
    if(me.live)send(me,{t:'live',on:true});
  };
  ws.onmessage=({data})=>{
    if(v!==me)return;
    if(typeof data==='string'){
      let d;try{d=JSON.parse(data)}catch(_){return}
      if(d.t==='roster'){me.i=d.you;me.members=Array.isArray(d.members)?d.members:[];syncWatching(me);render()}
      else if(d.t==='rtc')onRtc(me,d.from,d.data||{});
      else if(d.t==='watchers'){me.watchers=Array.isArray(d.watchers)?d.watchers:[];syncWatchers(me);render()}
      return;
    }
    const b=new Uint8Array(data);
    if(b.length>6&&b[0]===TAG[0]&&b[1]===TAG[1]&&b[2]===TAG[2]&&b[3]===TAG[3])return showFrame(me,b[4],b.subarray(5));
    if(b.length>1)play(me,b[0],b.subarray(1));
  };
  ws.onclose=e=>{
    if(v!==me||me.ws!==ws)return;
    const msg={'joined from somewhere else':'You joined voice somewhere else.','timed out':"You're timed out, so you left voice.",banned:"You're banned from chat.",kicked:'You were kicked from chat.','channel deleted':'That channel was deleted.'}[e.reason];
    if(msg){leave(true);toast(msg,'err');return}
    if(!me.opened){leave(true);toast("Couldn't join voice. It may be full, or you may be timed out.",'err');return}
    // a reconnect gets a fresh seat: streams being watched start over
    for(const i of [...me.watching.keys()])unwatch(me,i,true);
    for(const i of [...me.peers.keys()])closePeer(me,i);
    if(me.tries++<5){render('Reconnecting…');setTimeout(()=>{if(v===me)connect(me)},1000*me.tries)}
    else{leave(true);toast('Lost the connection to voice. Join again in a moment.','err')}
  };
}
function leave(quiet){
  const me=v;if(!me)return;
  v=null;
  stopLive(me,true);
  for(const i of [...me.watching.keys()])unwatch(me,i,true);
  try{me.ws?.close(1000)}catch(_){}
  me.mic?.getTracks().forEach(t=>t.stop());
  me.ctx?.close().catch(()=>{});
  render();
  if(!quiet)toast('You left voice');
}
function toggleMute(){
  if(!v)return;
  if(v.deaf){setDeaf(false);return} // like Discord: unmuting while deafened undeafens
  v.muted=!v.muted;
  v.mic?.getAudioTracks().forEach(t=>{t.enabled=!v.muted});
  send(v,{t:'mute',on:v.muted});
  render();
}
/* deafen: nobody's voice reaches you (the server stops sending it), and you're muted too */
function setDeaf(on){
  if(!v||v.deaf===on)return;
  v.deaf=on;
  if(v.out)v.out.gain.value=on?0:1;
  $$('#vstage audio.vs-sound').forEach(a=>{a.muted=on}); // a stream's own sound too
  if(on){v.mutedBeforeDeaf=v.muted;if(!v.muted){v.muted=true;send(v,{t:'mute',on:true})}}
  else if(!v.mutedBeforeDeaf){v.muted=false;send(v,{t:'mute',on:false})}
  v.mic?.getAudioTracks().forEach(t=>{t.enabled=!v.muted});
  send(v,{t:'deaf',on});
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
  const s=ctx.createBufferSource();s.buffer=buf;s.connect(me.out||ctx.destination);s.start(p.at);p.at+=buf.duration;
}

/* ═══ Go Live: your screen, to the channel ═══ */
let iceCache=null;
async function iceServers(){
  if(iceCache)return iceCache;
  try{const r=await fetch('/api/calls/ice');if(r.ok)iceCache=(await r.json()).iceServers}catch(_){}
  return iceCache||[{urls:'stun:stun.l.google.com:19302'}];
}
const SHARE=()=>window.calls?.share;
async function goLive(){
  const me=v;if(!me)return;
  if(me.live)return stopLive(me);
  if(!navigator.mediaDevices?.getDisplayMedia){toast("This browser can't share its screen.",'err');return}
  const q=SHARE()?.presets[SHARE().quality]||{w:1920,h:1080,fps:30,hint:'detail'};
  let stream;
  try{stream=await navigator.mediaDevices.getDisplayMedia({
    video:{width:{max:q.w},height:{max:q.h},frameRate:{ideal:q.fps,max:q.fps}},
    audio:SHARE()?.sound?{echoCancellation:false,noiseSuppression:false,autoGainControl:false}:false,
    systemAudio:SHARE()?.sound?'include':'exclude',surfaceSwitching:'include',selfBrowserSurface:'exclude'})}
  catch(e){if(e.name!=='NotAllowedError')toast("Couldn't share the screen.",'err');return}
  if(v!==me){stream.getTracks().forEach(t=>t.stop());return}
  try{stream.getVideoTracks()[0].contentHint=q.hint}catch(_){}
  me.live=stream;
  stream.getVideoTracks()[0].onended=()=>{if(v===me)stopLive(me)}; // the browser's own "Stop sharing"
  send(me,{t:'live',on:true});
  me.focus='live:'+me.i;
  render();toast("You're live in the channel",'ok');
}
function stopLive(me,quiet){
  if(!me?.live)return;
  for(const i of [...me.peers.keys()])closePeer(me,i);
  clearInterval(me.frameT);me.frameT=0;
  me.live.getTracks().forEach(t=>t.stop());
  me.live=null;me.watchers=[];
  send(me,{t:'live',on:false});
  if(me.focus==='live:'+me.i)me.focus=null;
  if(!quiet){render();toast('Stream ended')}
}
/* who's watching changed: direct watchers get a connection (when they ask), the rest pictures */
function syncWatchers(me){
  const direct=new Set(me.watchers.filter(w=>!w.relay).map(w=>w.i));
  for(const i of [...me.peers.keys()])if(!direct.has(i))closePeer(me,i);
  const relay=me.watchers.some(w=>w.relay);
  if(relay&&!me.frameT&&me.live)startFrames(me);
  else if(!relay&&me.frameT){clearInterval(me.frameT);me.frameT=0}
}
function closePeer(me,i){const p=me.peers.get(i);if(!p)return;me.peers.delete(i);try{p.pc.close()}catch(_){}}
/* the encoder's limits, from the preset (retried until the track has been negotiated) */
function tune(pc,tries=0){
  const q=SHARE()?.presets[SHARE().quality];if(!q)return;
  const s=pc.getSenders().find(x=>x.track?.kind==='video');if(!s)return;
  try{
    const p=s.getParameters();
    if(!p.encodings?.length){if(tries<20)setTimeout(()=>tune(pc,tries+1),300);return}
    p.encodings[0].maxBitrate=q.bitrate;p.encodings[0].maxFramerate=q.fps;p.degradationPreference=q.pref;
    s.setParameters(p).catch(()=>{if(tries<20)setTimeout(()=>tune(pc,tries+1),300)});
  }catch(_){if(tries<20)setTimeout(()=>tune(pc,tries+1),300)}
}
/* the WebRTC handshake, both ways: a watcher asks, the streamer offers */
async function onRtc(me,from,data){
  if(data.want){ // someone wants to watch you directly
    if(!me.live)return;
    closePeer(me,from);
    const pc=new RTCPeerConnection(blocked()?{iceServers:[],iceTransportPolicy:'relay'}:{iceServers:await iceServers()});
    if(v!==me||!me.live){pc.close();return}
    me.peers.set(from,{pc});
    pc.onicecandidate=({candidate})=>{if(candidate)send(me,{t:'rtc',to:from,data:{candidate:candidate.toJSON()}})};
    me.live.getTracks().forEach(t=>pc.addTrack(t,me.live));
    await pc.setLocalDescription();
    send(me,{t:'rtc',to:from,data:{description:pc.localDescription.toJSON()}});
    tune(pc);
    return;
  }
  // streamer side: their answer and candidates; watcher side: the offer and candidates
  const w=me.watching.get(from),p=me.peers.get(from);
  const pc=data.description?.type==='offer'?w?.pc:(p?.pc||w?.pc);
  if(!pc)return;
  try{
    if(data.description){
      await pc.setRemoteDescription(data.description);
      if(data.description.type==='offer'){await pc.setLocalDescription();send(me,{t:'rtc',to:from,data:{description:pc.localDescription.toJSON()}})}
    }else if(data.candidate)await pc.addIceCandidate(data.candidate);
  }catch(e){console.warn('voice stream',e)}
}
/* pictures for watchers who can't get the stream directly: made once, sent through the server */
function startFrames(me){
  const q=SHARE()?.presets[SHARE().quality]?.relay||{w:1280,h:720,every:250,q:.6};
  const vid=document.createElement('video');vid.muted=true;vid.playsInline=true;vid.srcObject=new MediaStream(me.live.getVideoTracks());vid.play().catch(()=>{});
  const cv=document.createElement('canvas');let busy=false;
  me.frameT=setInterval(async()=>{
    const ws=me.ws;
    if(busy||!me.live||!ws||ws.readyState!==1||ws.bufferedAmount>512*1024||!vid.videoWidth)return;
    const sc=Math.min(1,q.w/vid.videoWidth,q.h/vid.videoHeight);
    cv.width=Math.round(vid.videoWidth*sc);cv.height=Math.round(vid.videoHeight*sc);
    cv.getContext('2d').drawImage(vid,0,0,cv.width,cv.height);
    busy=true;const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',q.q));busy=false;
    if(!blob||v!==me||!me.frameT)return;
    const jpg=new Uint8Array(await blob.arrayBuffer()),out=new Uint8Array(jpg.length+4);
    out.set(TAG,0);out.set(jpg,4);ws.send(out);
  },q.every);
}

/* ═══ watching someone's stream ═══ */
async function watch(i){
  const me=v;if(!me||i===me.i||me.watching.has(i))return;
  const w={pc:null,relay:relayFirst(),t:0,frames:0,stream:null};
  me.watching.set(i,w);me.focus='live:'+i;
  if(w.relay){send(me,{t:'watch',who:i,on:true,relay:true});render();return}
  const pc=new RTCPeerConnection(blocked()?{iceServers:[],iceTransportPolicy:'relay'}:{iceServers:await iceServers()});
  if(v!==me||me.watching.get(i)!==w){pc.close();return}
  w.pc=pc;
  pc.onicecandidate=({candidate})=>{if(candidate)send(me,{t:'rtc',to:i,data:{candidate:candidate.toJSON()}})};
  // the direct path didn't come up (or failed): pictures through our server, and remember this network
  const fallback=()=>{
    clearTimeout(w.t);
    if(v!==me||me.watching.get(i)!==w||w.relay)return;
    try{pc.close()}catch(_){}
    w.pc=null;w.relay=true;w.stream=null;
    try{localStorage.setItem('wvm.callRelayUntil',String(Date.now()+RELAY_MEMORY))}catch(_){}
    send(me,{t:'watch',who:i,on:true,relay:true});render();
  };
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected')clearTimeout(w.t);else if(pc.connectionState==='failed')fallback()};
  pc.ontrack=({track})=>{
    if(track.kind==='audio'){const a=document.createElement('audio');a.autoplay=true;a.srcObject=new MediaStream([track]);a.muted=me.deaf;a.className='vs-sound';a.dataset.i=i;ST.appendChild(a);playSound(a);track.onended=()=>a.remove();return}
    w.stream=new MediaStream([track]);render();
  };
  // the track itself shows up during the handshake, before any picture can flow, so wait for the connection
  w.t=setTimeout(()=>{if(pc.connectionState!=='connected')fallback()},DIRECT_WAIT);
  send(me,{t:'watch',who:i,on:true,relay:false});
  send(me,{t:'rtc',to:i,data:{want:true}});
  render();
}
function unwatch(me,i,quiet){
  const w=me?.watching.get(i);if(!w)return;
  clearTimeout(w.t);try{w.pc?.close()}catch(_){}
  me.watching.delete(i);
  $$(`#vstage audio.vs-sound[data-i="${i}"]`).forEach(a=>a.remove());
  if(!quiet)send(me,{t:'watch',who:i,on:false});
  if(me.focus==='live:'+i)me.focus=null;
  if(!quiet)render();
}
/* a stream that ended (or its streamer left) stops being watched */
function syncWatching(me){
  for(const i of [...me.watching.keys()])if(!me.members.some(m=>m.i===i&&m.live))unwatch(me,i,true);
}
async function showFrame(me,i,bytes){
  const w=me.watching.get(i);if(!w?.relay)return;
  try{
    const img=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
    const cv=$(`#vs-tiles .vs-stream[data-i="${i}"] canvas`);
    if(!cv||me.watching.get(i)!==w){img.close();return}
    if(cv.width!==img.width||cv.height!==img.height){cv.width=img.width;cv.height=img.height}
    cv.getContext('2d').drawImage(img,0,0);img.close();w.frames++;
    cv.closest('.vs-stream').classList.add('playing');
  }catch(_){}
}

/* ═══ drawing ═══ */
const MIC_OFF='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/><path class="x" d="M3 3l18 18"/></svg>';
const ST_MIC='<i class="cl-st mic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M2 2l20 20"/></svg></i>';
const ST_DEAF='<i class="cl-st deaf"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3zM2 2l20 20"/></svg></i>';
function render(status){
  BAR.hidden=!v;
  if(v){
    $('#vc-name').textContent='#'+chName(v.slug);
    $('#vc-status').textContent=status||(v.members.length?`${v.members.length} in voice`:'Connecting…');
    for(const id of ['#vc-mute','#vs-mute'])$(id).classList.toggle('on',v.muted),$(id).title=v.muted?'Unmute':'Mute';
    for(const id of ['#vc-deaf','#vs-deaf'])$(id).classList.toggle('on',v.deaf),$(id).title=v.deaf?'Undeafen':'Deafen';
    $('#vs-live').classList.toggle('on',!!v.live);$('#vs-live').title=v.live?'Stop streaming':'Go Live: share your screen with the channel';
    const box=$('#vc-people');
    box.replaceChildren(...v.members.map(m=>{
      const d=document.createElement('div');d.className='vc-p'+(m.i===v.i?' me':'');d.dataset.i=m.i;
      d.appendChild(avatar(m.name,'vc-av'));
      const n=document.createElement('span');n.className='vc-n';n.textContent=m.i===v.i?'You':nameOf(m.name);d.appendChild(n);
      if(m.live){const l=document.createElement('span');l.className='vc-live';l.textContent='Live';d.appendChild(l)}
      if(m.muted){const x=document.createElement('span');x.className='vc-muted';x.title=m.deaf?'Deafened':'Muted';x.innerHTML=MIC_OFF;d.appendChild(x)}
      return d;
    }));
    if(!ticker)ticker=setInterval(talking,150);
  }else{clearInterval(ticker);ticker=null}
  stage();header();
}
/* the stage: a tile each, and a Live tile for each stream */
function stage(){
  const me=v;
  if(!me){ST.dataset.mode='off';document.documentElement.classList.remove('voice-docked');return}
  $('#vs-name').textContent='#'+chName(me.slug);
  $('#vs-count').textContent=me.members.length?`${me.members.length} in voice`:'Connecting…';
  const tiles=$('#vs-tiles'),keep=new Set();
  const tile=(key,make)=>{let el=tiles.querySelector(`[data-key="${key}"]`);if(!el){el=make();el.dataset.key=key;tiles.appendChild(el)}keep.add(el);return el};
  for(const m of me.members){
    const mine=m.i===me.i;
    const el=tile('p:'+m.name,()=>{const d=document.createElement('div');d.className='cl-tile vs-p';d.innerHTML=`<div class="cl-tav"></div><span class="cl-tag">${ST_MIC}${ST_DEAF}<b class="nm"></b></span>`;return d});
    el.dataset.i=m.i;
    const av=el.querySelector('.cl-tav');av.textContent=(nameOf(m.name)[0]||'?').toUpperCase();av.style.background=colorOf(m.name);
    el.querySelector('.nm').textContent=mine?'You':nameOf(m.name);
    el.classList.toggle('muted',!!m.muted&&!m.deaf);el.classList.toggle('deaf',!!m.deaf);el.classList.toggle('is-live',!!m.live);
    if(m.live){
      const s=tile('s:'+m.i,()=>{const d=document.createElement('div');d.className='cl-tile screen vs-stream';d.innerHTML='<video autoplay playsinline muted></video><canvas></canvas><span class="cl-live">Live</span><span class="cl-tag"></span><button class="btn sm primary vs-watch">Watch stream</button>';return d});
      s.dataset.i=m.i;
      s.querySelector('.cl-tag').textContent=mine?'Your stream':`${nameOf(m.name)}'s screen`;
      const w=me.watching.get(m.i),vid=s.querySelector('video');
      const src=mine?me.live:w?.stream||null;
      if(vid.srcObject!==src)vid.srcObject=src;
      s.classList.toggle('watching',mine||!!w);s.classList.toggle('relay',!!w?.relay);
      s.classList.toggle('playing',mine||!!w?.stream||(!!w?.relay&&w.frames>0));
      s.querySelector('.vs-watch').hidden=mine||!!w;
    }
  }
  for(const el of [...tiles.children])if(!keep.has(el))el.remove();
  // the stream in focus is big, the rest in a strip under it
  if(me.focus&&!tiles.querySelector(`[data-key="${me.focus.replace('live:','s:')}"]`))me.focus=null;
  const fk=me.focus?me.focus.replace('live:','s:'):'';
  tiles.classList.toggle('focused',!!fk);
  const count=tiles.children.length;tiles.style.setProperty('--vs-cols',count<=2?Math.max(1,count):count<=4?2:3);
  for(const el of tiles.children)el.classList.toggle('focus',el.dataset.key===fk);
  layout();
}
/* docked over the chat while you're looking at this channel; a small window while you watch a stream elsewhere */
const chatShown=()=>$('#chat-window').classList.contains('show')&&!$('#chat-window').classList.contains('closing');
function layout(){
  const me=v;
  const mode=!me?'off':chatShown()&&!dcActiveIsDM&&dcActive===me.slug?'dock':me.watching.size||me.live?'pip':'off';
  if(ST.dataset.mode!==mode){ST.dataset.mode=mode;ST.style.cssText='';closeMenu()}
  // a call docks there too; only one of them is ever on (you can't be in both)
  document.documentElement.classList.toggle('voice-docked',mode==='dock');
  ST.classList.toggle('big',!!me?.big);
  if(mode==='dock'){
    const slot=$('#dc-callslot'),main=slot.parentElement,col=main.getBoundingClientRect(),top=$('.dc-top',main)?.getBoundingClientRect();
    const want=me.big?col.bottom-(top?top.bottom:col.top):me.focus?Math.max(300,Math.min(col.height*.68,760)):Math.max(220,Math.min(col.height*.42,460));
    if(!me.big)document.documentElement.style.setProperty('--cl-slot',Math.round(want)+'px');
    const r=slot.getBoundingClientRect();
    Object.assign(ST.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:Math.round(me.big?want:r.height||want)+'px'});
  }
}
new ResizeObserver(()=>{if(ST.dataset.mode==='dock')layout()}).observe($('#chat-window'));
addEventListener('resize',()=>{if(v)layout()});
new MutationObserver(()=>{if(v)requestAnimationFrame(stage)}).observe($('#chat-window'),{attributes:true,attributeFilter:['class']});
function talking(){
  if(!v)return;
  const now=performance.now(),at=i=>i===v.i?(v.muted?0:v.myAt):(v.play.get(i)?.talkAt||0);
  for(const el of $$('#vc-people .vc-p'))el.classList.toggle('talking',now-at(+el.dataset.i)<TALK_MS);
  for(const el of $$('#vs-tiles .vs-p'))el.classList.toggle('speaking',now-at(+el.dataset.i)<TALK_MS);
}
/* the header button of the channel you're looking at */
function header(){
  const b=$('#dc-voice');if(!b)return;
  const slug=dcActive,n=rooms[slug]?.length||0,here=v?.slug===slug;
  b.hidden=dcActiveIsDM||!chatMeAccount;
  b.classList.toggle('on',here);
  b.title=here?'Leave voice':n?`Join voice (${n} talking here)`:'Join voice';
  b.querySelector('.n').textContent=n?String(n):'';
  if(v)stage();
}
/* the badge next to a channel with people in its voice (red while someone's live) */
function badge(slug){
  const list=rooms[slug];if(!list?.length)return null;
  const s=document.createElement('span');s.className='dc-vc'+(list.some(m=>m.live)?' live':'');
  s.title=list.map(m=>nameOf(m.name)+(m.live?' (live)':'')).join(', ')+' in voice';
  s.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/></svg>';
  s.appendChild(document.createTextNode(String(list.length)));
  return s;
}
function setRooms(all){rooms=all&&typeof all==='object'?all:{};dcRenderChannels();header()}
function setRoom(slug,members){
  if(Array.isArray(members)&&members.length)rooms[slug]=members;else delete rooms[slug];
  dcRenderChannels();header();
}

/* ═══ the stream quality menu (the same presets as calls) ═══ */
function closeMenu(){$('#vs-q-menu').hidden=true}
function openMenu(){
  const m=$('#vs-q-menu');
  $$('#vs-q-menu [data-q]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.q===SHARE()?.quality)));
  $('#vs-share-sound').checked=!!SHARE()?.sound;
  m.hidden=false;
  const r=$('#vs-live-q').getBoundingClientRect(),w=m.offsetWidth,h=m.offsetHeight;
  Object.assign(m.style,{left:Math.max(8,Math.min(r.left+r.width/2-w/2,innerWidth-w-8))+'px',top:(r.top-h-10>=8?r.top-h-10:Math.min(r.bottom+10,innerHeight-h-8))+'px'});
}
$('#vs-live-q').onclick=e=>{e.stopPropagation();click();$('#vs-q-menu').hidden?openMenu():closeMenu()};
$('#vs-q-menu').addEventListener('click',e=>{
  e.stopPropagation();const b=e.target.closest('[data-q]');if(!b||!SHARE())return;
  click();SHARE().quality=b.dataset.q;closeMenu();
  if(v?.live){
    const q=SHARE().presets[b.dataset.q],t=v.live.getVideoTracks()[0];
    try{t.contentHint=q.hint}catch(_){}
    for(const p of v.peers.values())tune(p.pc);
    t.applyConstraints({width:{max:q.w},height:{max:q.h},frameRate:{ideal:q.fps,max:q.fps}}).catch(()=>{});
    if(v.frameT){clearInterval(v.frameT);v.frameT=0;startFrames(v)}
    toast(`Stream quality: ${b.querySelector('b').textContent}`);
  }
});
$('#vs-share-sound').onchange=e=>{if(SHARE())SHARE().sound=e.target.checked;if(v?.live)toast('Takes effect the next time you go live')};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#vs-q-menu,#vs-live-q'))closeMenu()});

/* ═══ wiring ═══ */
$('#dc-voice').onclick=()=>{click();v?.slug===dcActive?leave():join(dcActive)};
for(const id of ['#vc-mute','#vs-mute'])$(id).onclick=()=>{click();toggleMute()};
for(const id of ['#vc-deaf','#vs-deaf'])$(id).onclick=()=>{click();setDeaf(!v?.deaf)};
for(const id of ['#vc-leave','#vs-leave'])$(id).onclick=()=>{click();leave()};
$('#vs-live').onclick=()=>{click();goLive()};
$('#vs-size').onclick=()=>{click();if(v){v.big=!v.big;layout()}};
$('#vs-fs').onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await ($('#vs-tiles .focus')||$('#vs-tiles')).requestFullscreen()}catch(_){}};
$('#vc-name').onclick=()=>{if(v&&typeof openChat==='function'){openChat();if(dcActive!==v.slug)dcOpen(v.slug)}};
$('#vs-tiles').addEventListener('click',e=>{
  if(!v)return;
  const t=e.target.closest('.cl-tile');if(!t)return;
  if(ST.dataset.mode==='pip'){if(typeof openChat==='function'){openChat();if(dcActive!==v.slug)dcOpen(v.slug)}return}
  if(e.target.closest('.vs-watch')){click();watch(+t.dataset.i);return}
  if(t.classList.contains('vs-stream')){click();const k='live:'+t.dataset.i;v.focus=v.focus===k?null:k;stage()}
});
$('#vs-tiles').addEventListener('dblclick',e=>{const t=e.target.closest('.vs-stream.playing');if(t)(document.fullscreenElement?document.exitFullscreen():t.requestFullscreen()).catch(()=>{})});
// right-click a stream you're watching to stop watching it
$('#vs-tiles').addEventListener('contextmenu',e=>{const t=e.target.closest('.vs-stream.watching');if(t&&v&&+t.dataset.i!==v.i){e.preventDefault();unwatch(v,+t.dataset.i)}});
/* the small window can be dragged by its header */
$('#vs-head').addEventListener('pointerdown',e=>{
  if(ST.dataset.mode!=='pip'||e.target.closest('button'))return;
  const r=ST.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
  $('#vs-head').setPointerCapture(e.pointerId);
  const move=ev=>{ST.style.left=Math.max(8,Math.min(ev.clientX-dx,innerWidth-ST.offsetWidth-8))+'px';ST.style.top=Math.max(8,Math.min(ev.clientY-dy,innerHeight-ST.offsetHeight-8))+'px';ST.style.bottom='auto'};
  $('#vs-head').addEventListener('pointermove',move);
  $('#vs-head').addEventListener('pointerup',()=>$('#vs-head').removeEventListener('pointermove',move),{once:true});
});

window.voice={join,leave,toggleMute,setDeaf,setRooms,setRoom,badge,header,goLive,watch,unwatch:i=>unwatch(v,i),
  get active(){return !!v},
  /* for the tests: who's here, and what's been sent and heard from each, and the streams */
  stats(){return v?{slug:v.slug,i:v.i,muted:v.muted,deaf:v.deaf,members:v.members,sent:v.sent,
    heard:Object.fromEntries([...v.play].map(([i,p])=>[i,{got:p.got,peak:p.peak}])),
    layout:ST.dataset.mode,live:!!v.live,watchers:v.watchers,peers:v.peers.size,relaying:!!v.frameT,
    watching:Object.fromEntries([...v.watching].map(([i,w])=>[i,{relay:w.relay,direct:!!w.stream,frames:w.frames,width:$(`#vs-tiles .vs-stream[data-i="${i}"] video`)?.videoWidth||0}]))}:null}};
})();
