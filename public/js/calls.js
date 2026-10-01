/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   VOICE CALLS + CAMERA + SCREEN SHARE (1:1, accounts only)
   The chat socket carries the WebRTC handshake (call.* messages, relayed
   by chat.js); audio and screen go straight between the two browsers, or,
   when the network won't let them (see "the relay" below), through our server.
   Negotiation follows the "perfect negotiation" pattern, so either side
   can start or stop sharing its screen mid-call: the callee is polite.
   Uses app.js helpers ($, toast, click, notify, nameOf, colorOf, dcSend,
   chatMe, chatMeAccount, openChat).
   ═══════════════════════════════════════════════════════════ */
(()=>{
const C=$('#call');
let call=null; // {id, peer, dir:'out'|'in', state, pc, mic, screen, screenSenders, polite, makingOffer, ignoreOffer, gotOffer, started}
let ringer=null,timerI=null,iceCache=null;
const CAN_SHARE=!!navigator.mediaDevices?.getDisplayMedia,CAN_CAM=!!navigator.mediaDevices?.getUserMedia;
const REASONS={declined:'declined the call','no answer':"didn't answer",busy:'is on another call',offline:'is offline',hangup:'hung up',
  disconnected:'got disconnected','answered elsewhere':'answered on another device',gone:'call ended'};

/* ---- ringtones: a phone ring for incoming, a soft beep while calling ---- */
let actx=null;
function tone(freqs,dur,vol){
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    const t=actx.currentTime;
    freqs.forEach(f=>{
      const o=actx.createOscillator(),g=actx.createGain();
      o.type='sine';o.frequency.value=f;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.03);
      g.gain.setValueAtTime(vol,t+dur-.05);g.gain.linearRampToValueAtTime(0,t+dur);
      o.connect(g).connect(actx.destination);o.start(t);o.stop(t+dur);
    });
  }catch(_){}
}
function ring(kind){
  stopRing();
  const v=Math.max(.02,(S.volume??.5)*.25);
  const play=kind==='in'?()=>{tone([440,480],.9,v);setTimeout(()=>ringer&&tone([440,480],.9,v),1200)}:()=>tone([425],1,v*.6);
  play();ringer=setInterval(play,kind==='in'?3200:3000);
}
function stopRing(){clearInterval(ringer);ringer=null}

/* ---- UI ----
   Discord style: a tile each for them and you (their avatar lights up green while
   they talk), plus a "Live" tile for each shared screen. Ringing shows a card; once
   calling, the call docks at the top of the chat while it's open, else it shrinks
   to a small window you can drag (see layout()). */
const muted=()=>!!call?.mic&&!call.mic.getAudioTracks()[0]?.enabled;
function paintAv(el,name){el.textContent=(nameOf(name)[0]||'?').toUpperCase();el.style.background=colorOf(name)}
function ui(state,status){
  C.dataset.state=state;
  if(!call){layout();return}
  paintAv($('#cl-av'),call.peer);paintAv($('#cl-them-av'),call.peer);paintAv($('#cl-me-av'),chatMe);
  $('#cl-name').textContent=nameOf(call.peer);
  $$('#call .cl-tile .nm').forEach(el=>{el.textContent=nameOf(call.peer)});
  if(status!=null)$('#cl-status').textContent=status;
  const m=muted();
  $('#cl-mute').classList.toggle('on',m);$('#cl-mute').title=m?'Unmute':'Mute';
  $('#cl-deaf').classList.toggle('on',!!call.deaf);$('#cl-deaf').title=call.deaf?'Undeafen':'Deafen';
  $('#cl-share').classList.toggle('on',!!call.screen);$('#cl-share').title=call.screen?'Stop sharing':'Share your screen';
  $('.cl-split').hidden=!CAN_SHARE;
  $('#cl-cam').classList.toggle('on',!!call.cam);$('#cl-cam').title=call.cam?'Turn off camera':'Turn on camera';
  $('#cl-cam').hidden=!CAN_CAM;
  $('#cl-t-me').classList.toggle('muted',m&&!call.deaf);$('#cl-t-me').classList.toggle('deaf',!!call.deaf);
  $('#cl-t-them').classList.toggle('muted',!!call.theirs?.muted&&!call.theirs?.deaf);$('#cl-t-them').classList.toggle('deaf',!!call.theirs?.deaf);
  callbar();layout();
}
/* their camera and their screen, each in its own tile; a shared screen takes the focus */
function remoteVideo(kind,on){
  C.classList.toggle(kind==='cam'?'has-cam':'has-screen',on);
  C.classList.toggle('has-video',C.classList.contains('has-cam')||C.classList.contains('has-screen'));
  autoFocus();layout();
}
/* your camera (mirrored, like a mirror) and the screen you share, each in its own tile */
function selfPreview(){
  $('#cl-self').srcObject=call?.cam?new MediaStream(call.cam.getVideoTracks()):null;
  $('#cl-self').classList.toggle('mirror',!!call?.cam);
  $('#cl-self-screen').srcObject=call?.screen?new MediaStream(call.screen.getVideoTracks()):null;
  C.classList.toggle('self-cam',!!call?.cam);C.classList.toggle('self-screen',!!call?.screen);
  autoFocus();layout();
}

/* ---- which tile is big ----
   A screen share takes the focus the moment it starts (theirs before yours); click a
   tile to focus it, click it again for the grid. A pick you make sticks until that
   tile goes away. */
let focus='',focusPicked=false;
const TILES={screen:'#cl-t-screen',them:'#cl-t-them',me:'#cl-t-me',myscreen:'#cl-t-myscreen'};
const tileOn=t=>!!$(TILES[t])&&getComputedStyle($(TILES[t])).display!=='none';
function autoFocus(){
  if(focus&&!tileOn(focus)){focus='';focusPicked=false}
  if(!focusPicked)focus=tileOn('screen')?'screen':tileOn('myscreen')?'myscreen':'';
  paintFocus();
}
function paintFocus(){
  const box=$('#cl-tiles');
  if(C.dataset.mode==='dock')requestAnimationFrame(placeDock);
  box.classList.toggle('focused',!!focus);
  for(const[t,sel]of Object.entries(TILES))$(sel).classList.toggle('focus',t===focus);
}
$('#cl-tiles').addEventListener('click',e=>{
  const t=e.target.closest('.cl-tile');if(!t||!call)return;
  if(C.dataset.mode==='pip'){openCallChat();return}
  click();
  const name=t.dataset.tile;
  if(focus===name){focus='';focusPicked=true}else{focus=name;focusPicked=true}
  paintFocus();
});
$('#cl-tiles').addEventListener('dblclick',e=>{
  const t=e.target.closest('.cl-tile');if(!t||C.dataset.mode==='pip')return;
  (document.fullscreenElement?document.exitFullscreen():t.requestFullscreen()).catch(()=>{});
});

/* ---- where the call sits ---- */
const chatShown=()=>$('#chat-window').classList.contains('show')&&!$('#chat-window').classList.contains('closing');
function layout(){
  const st=C.dataset.state;
  const mode=st==='off'?'card':st==='incoming'?'card':chatShown()?'dock':'pip';
  if(C.dataset.mode!==mode){
    C.dataset.mode=mode;
    C.style.left=C.style.top=C.style.width=C.style.height=C.style.bottom='';
    closeMenu();
  }
  document.documentElement.classList.toggle('call-docked',mode==='dock');
  if(mode==='dock')placeDock();
  else if(mode==='pip'&&pipAt)placePip(pipAt.x,pipAt.y);
}
/* docked: over the slot at the top of the chat, the full column when made big */
function placeDock(){
  const slot=$('#dc-callslot'),main=slot.parentElement,big=C.classList.contains('big');
  const col=main.getBoundingClientRect(),top=$('.dc-top',main)?.getBoundingClientRect();
  // a live screen gets more room, like Discord's stream view
  const want=big?col.bottom-(top?top.bottom:col.top):focus?Math.max(300,Math.min(col.height*.68,760)):Math.max(240,Math.min(col.height*.46,520));
  if(!big)document.documentElement.style.setProperty('--cl-slot',Math.round(want)+'px');
  const r=slot.getBoundingClientRect();
  Object.assign(C.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:Math.round(big?want:r.height||want)+'px',bottom:'auto'});
}
new ResizeObserver(()=>{if(C.dataset.mode==='dock')placeDock()}).observe($('#chat-window'));
addEventListener('resize',()=>{if(C.dataset.mode==='dock')placeDock();else if(C.dataset.mode==='pip'&&pipAt)placePip(pipAt.x,pipAt.y)});
new MutationObserver(()=>{if(call)requestAnimationFrame(layout)}).observe($('#chat-window'),{attributes:true,attributeFilter:['class']});
/* the small window can be dragged by its header; where you leave it is remembered */
let pipAt=(()=>{try{return JSON.parse(localStorage.getItem('wvm.callPip'))}catch(_){return null}})();
function placePip(x,y){
  const w=C.offsetWidth,h=C.offsetHeight;
  x=Math.max(8,Math.min(x,innerWidth-w-8));y=Math.max(8,Math.min(y,innerHeight-h-8));
  Object.assign(C.style,{left:x+'px',top:y+'px',bottom:'auto'});
  return{x,y};
}
$('#cl-head').addEventListener('pointerdown',e=>{
  if(C.dataset.mode!=='pip'||e.target.closest('button'))return;
  const r=C.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
  C.classList.add('dragging');$('#cl-head').setPointerCapture(e.pointerId);
  const move=ev=>{pipAt=placePip(ev.clientX-dx,ev.clientY-dy)};
  const up=()=>{C.classList.remove('dragging');$('#cl-head').removeEventListener('pointermove',move);try{localStorage.setItem('wvm.callPip',JSON.stringify(pipAt))}catch(_){}};
  $('#cl-head').addEventListener('pointermove',move);
  $('#cl-head').addEventListener('pointerup',up,{once:true});$('#cl-head').addEventListener('pointercancel',up,{once:true});
});
/* back to the call: open the chat on the DM with them, where the call docks */
function openCallChat(){if(!call)return;if(!chatShown())openChat();dcSend({type:'dm.open',name:call.peer})}

/* "Call connected" above your name in the chat, like Discord's voice panel */
function callbar(){
  const bar=$('#dc-callbar'),st=C.dataset.state;
  bar.hidden=!call||st==='off'||st==='incoming';
  if(bar.hidden)return;
  bar.classList.toggle('ringing',st==='outgoing');
  $('#dc-callbar-state').textContent=st==='outgoing'?'Calling…':call.relay?'Call connected · relay':'Call connected';
  $('#dc-callbar-who').textContent=nameOf(call.peer);
}
$('#dc-callbar-who').onclick=()=>{click();openCallChat()};
$('#dc-callbar-end').onclick=()=>{click();hangup()};

/* ---- who's talking: a green ring on their tile ----
   Levels come from an analyser on each voice (direct calls), or from the voice
   frames themselves (the relay). */
let levelI=null,lvlCtx=null;
function analyser(track){
  try{
    lvlCtx||=new AudioContext();lvlCtx.resume().catch(()=>{});
    const a=lvlCtx.createAnalyser();a.fftSize=512;
    lvlCtx.createMediaStreamSource(new MediaStream([track])).connect(a);
    return a;
  }catch(_){return null}
}
const rms=a=>{if(!a)return 0;const d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;return Math.sqrt(s/d.length)};
function watchLevels(){
  clearInterval(levelI);
  levelI=setInterval(()=>{
    if(!call){clearInterval(levelI);return}
    const now=Date.now();
    const me=!muted()&&!call.deaf&&rms(call.meterMe||(call.mic&&(call.meterMe=analyser(call.mic.getAudioTracks()[0]))))>.02;
    const them=call.relay?now-(call.relay.loudAt||0)<250:rms(call.meterThem)>.02;
    $('#cl-t-me').classList.toggle('speaking',me);
    $('#cl-t-them').classList.toggle('speaking',them&&!call.theirs?.muted);
  },120);
}

/* ---- mute and deafen, and telling the other side ---- */
function tellState(){if(call)signal({state:{muted:muted(),deaf:!!call.deaf}})}
function setDeaf(on){
  if(!call)return;
  call.deaf=on;
  $$('#cl-audio audio').forEach(a=>{a.muted=on});
  if(call.relay?.out)call.relay.out.gain.value=on?0:1;
  // deafening mutes you too, and undeafening puts your mic back how it was
  const t=call.mic?.getAudioTracks()[0];
  if(t){if(on){call.mutedBeforeDeaf=!t.enabled;t.enabled=false}else t.enabled=!call.mutedBeforeDeaf}
  ui(C.dataset.state);tellState();
}
function startTimer(){
  const t0=Date.now();clearInterval(timerI);
  const tick=()=>{const s=Math.floor((Date.now()-t0)/1000);$('#cl-status').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`+(call?.relay?' · via our server':'')};
  watchLevels();tellState();
  tick();timerI=setInterval(tick,1000);
}
function reset(){
  stopRing();clearInterval(timerI);
  if(call){
    clearTimeout(call.directT);
    try{call.pc?.close()}catch(_){}
    if(call.relay){for(const f of Object.values(call.relay.frames))clearInterval(f);try{call.relay.ws?.close(1000)}catch(_){}call.relay.ctx?.close().catch(()=>{})}
    call.mic?.getTracks().forEach(t=>t.stop());
    call.screen?.getTracks().forEach(t=>t.stop());
    call.cam?.getTracks().forEach(t=>t.stop());
  }
  call=null;
  $('#cl-remote-video').srcObject=null;$('#cl-remote-cam').srcObject=null;$('#cl-self').srcObject=null;
  $$('#cl-audio audio').forEach(a=>{a.srcObject=null;a.remove()});
  clearInterval(levelI);
  $('#cl-self-screen').srcObject=null;
  $$('#call .cl-tile').forEach(t=>t.classList.remove('speaking','muted','deaf'));
  C.classList.remove('has-video','has-screen','has-cam','self-cam','self-screen','big','relay');
  focus='';focusPicked=false;paintFocus();
  if(document.fullscreenElement&&C.contains(document.fullscreenElement))document.exitFullscreen().catch(()=>{});
  C.dataset.state='off';
  callbar();layout();
}
function finish(msg,type){
  const peer=call?.peer;reset();
  if(msg)toast(peer?`${nameOf(peer)} ${msg}`:msg,type);
}

/* ---- media ---- */
async function getMic(){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("This browser can't use a microphone here.");
  try{return await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})}
  catch(e){throw new Error(e.name==='NotAllowedError'?'Microphone blocked. Allow it in the browser to call.':e.name==='NotFoundError'?'No microphone found.':"Couldn't start the microphone.")}
}
async function iceServers(){
  if(iceCache)return iceCache;
  try{const r=await fetch('/api/calls/ice');if(r.ok)iceCache=(await r.json()).iceServers}catch(_){}
  return iceCache||[{urls:'stun:stun.l.google.com:19302'}];
}

/* ---- peer connection ---- */
function signal(data){if(call)dcSend({type:'call.signal',callId:call.id,data})}
async function makePeer(){
  // wvm.callRelay=blocked acts like a network that blocks direct calls (for the tests)
  const blocked=(()=>{try{return localStorage.getItem('wvm.callRelay')==='blocked'}catch(_){return false}})();
  const cfg=blocked?{iceServers:[],iceTransportPolicy:'relay'}:{iceServers:await iceServers()};
  if(!call||call.relay)return null; // switched to the relay meanwhile
  const pc=new RTCPeerConnection(cfg);
  call.pc=pc;call.adapt=adaptVideo(pc); // a struggling connection trades resolution for smooth motion (app.js)
  call.directT=setTimeout(()=>{if(call&&call.pc===pc&&pc.connectionState!=='connected')goRelay('slow')},RELAY_AFTER);
  pc.onicecandidate=({candidate})=>{if(candidate)signal({candidate:candidate.toJSON()})};
  pc.onnegotiationneeded=async()=>{
    if(!call||call.pc!==pc)return;
    try{call.makingOffer=true;await pc.setLocalDescription();signal({description:pc.localDescription.toJSON()})}
    catch(_){}finally{if(call)call.makingOffer=false}
  };
  pc.ontrack=({track,streams})=>{
    if(track.kind==='audio'){
      // one element per track: their voice and their shared tab's sound both play
      const a=document.createElement('audio');a.autoplay=true;a.srcObject=new MediaStream([track]);a.muted=!!call.deaf;
      $('#cl-audio').appendChild(a);playSound(a);
      // their voice (not their shared tab's sound) drives the speaking ring
      if(call.remoteKinds?.[streams[0]?.id]!=='screen'&&!call.meterThem)call.meterThem=analyser(track);
      track.onended=()=>a.remove();
      return;
    }
    // which video it is (camera or screen) was signalled ahead of it, by stream id
    const kind=call.remoteKinds?.[streams[0]?.id]||'screen';
    $(kind==='cam'?'#cl-remote-cam':'#cl-remote-video').srcObject=new MediaStream([track]);
    remoteVideo(kind,true);
    track.onmute=()=>remoteVideo(kind,false);track.onunmute=()=>remoteVideo(kind,true);track.onended=()=>remoteVideo(kind,false);
  };
  pc.onconnectionstatechange=()=>{
    if(!call||call.pc!==pc)return;
    const s=pc.connectionState;
    if(s==='connected'){clearTimeout(call.directT);clearTimeout(call.healT);call.healT=null;if(!call.started){call.started=true;stopRing();startTimer()}ui('active')}
    else if(s==='disconnected'){ui('active','Reconnecting…');heal(pc)}
    else if(s==='failed')goRelay('failed'); // the network won't carry it directly
  };
  return pc;
}
/* one message at a time: a candidate must not race the offer it belongs to */
function queueSignal(data){const c=call;if(!c)return;c.sig=(c.sig||Promise.resolve()).then(()=>call===c&&onSignal(data))}
async function onSignal({description,candidate,media,state}){
  if(media&&typeof media==='object'&&call){call.remoteKinds={...call.remoteKinds,...media};return} // {streamId: 'cam'|'screen'}
  if(state&&typeof state==='object'&&call){call.theirs={muted:!!state.muted,deaf:!!state.deaf};ui(C.dataset.state);return}
  const pc=call?.pc;if(!pc)return;
  try{
    if(description){
      const collision=description.type==='offer'&&(call.makingOffer||pc.signalingState!=='stable');
      call.ignoreOffer=!call.polite&&collision;
      if(call.ignoreOffer)return;
      await pc.setRemoteDescription(description);
      if(description.type==='offer'){
        // the callee adds its mic once the first offer arrives, so it rides the answer. The
        // caller's mic is already on: adding it again throws, and the offer (the callee
        // turning on a camera or sharing) would never be answered
        if(!call.gotOffer){call.gotOffer=true;const have=new Set(pc.getSenders().map(x=>x.track));call.mic.getTracks().forEach(t=>{if(!have.has(t))pc.addTrack(t,call.mic)})}
        await pc.setLocalDescription();
        signal({description:pc.localDescription.toJSON()});
      }
    }else if(candidate){
      try{await pc.addIceCandidate(candidate)}catch(e){if(!call.ignoreOffer)throw e}
    }
  }catch(e){console.warn('call signal',e)}
}

/* ---- the relay: when the two browsers can't reach each other directly ----
   Strict networks (many schools, phone carriers) block WebRTC's direct path,
   and without a TURN server that's the end of it. So after RELAY_AFTER without
   a connection (or right away, if this device needed the relay in the last
   day), both sides open /call-relay/ on our server (chat.js) and send their
   voice as 16 kHz μ-law (js/call-worklet.js), 20 ms at a time, a shared screen
   as JPEG frames 3 a second, and a camera as smaller ones about 6 a second.
   Messages: [kind, ...bytes]. */
const RELAY_AFTER=9000,RELAY_MEMORY=24*3600e3;
const KIND={voice:1};
const FRAMES={
  screen:{kind:2,end:3,w:1280,h:720,every:333,q:.6,canvas:'#cl-remote-canvas'},
  cam:{kind:4,end:5,w:480,h:360,every:160,q:.55,canvas:'#cl-remote-cam-canvas'},
};
const ULAW=new Float32Array(256).map((_,u)=>{u=~u&0xff;const e=(u>>4)&7;const x=((((u&15)<<3)+0x84)<<e)-0x84;return(u&0x80?-x:x)/32768});
const relayFirst=()=>{try{return localStorage.getItem('wvm.callRelay')==='always'||Date.now()<+localStorage.getItem('wvm.callRelayUntil')}catch(_){return false}};
/* A direct call that drops (Wi-Fi changed, a laptop woke up) gets 3 s to recover by
   itself, then an ICE restart (new network paths, renegotiated through the chat
   socket), then after 10 s more it moves to our server rather than waiting the half
   minute the browser takes to give up. */
function heal(pc){
  if(!call||call.pc!==pc||call.relay||call.healT)return;
  call.healT=setTimeout(()=>{
    if(!call||call.pc!==pc||pc.connectionState==='connected'){if(call)call.healT=null;return}
    try{pc.restartIce()}catch(_){}
    call.healT=setTimeout(()=>{if(call)call.healT=null;if(call&&call.pc===pc&&!call.relay&&pc.connectionState!=='connected')goRelay('lost')},10000);
  },3000);
}
async function goRelay(why){
  const c=call;
  if(!c||c.relay||!c.mic)return;
  c.relay={ws:null,ctx:null,playAt:0,frames:{},shown:{screen:0,cam:0},stats:{sent:0,got:0,peak:0,frames:0,camFrames:0}};
  clearTimeout(c.directT);
  if(!why.startsWith('peer'))signal({relay:true,why}); // the other side follows
  // the direct path didn't work (for either of us): go straight to the relay next time
  if(/^(peer-)?(failed|slow)$/.test(why))try{localStorage.setItem('wvm.callRelayUntil',String(Date.now()+RELAY_MEMORY))}catch(_){} // go straight there next time
  try{c.pc?.close()}catch(_){}
  c.pc=null;
  $$('#cl-audio audio').forEach(a=>{a.srcObject=null;a.remove()});
  $('#cl-remote-video').srcObject=null;$('#cl-remote-cam').srcObject=null;
  C.classList.remove('has-video','has-screen','has-cam');C.classList.add('relay');autoFocus();
  ui('active','Connecting through our server…');
  try{
    let ctx;
    try{ctx=new AudioContext({sampleRate:16000,latencyHint:'interactive'})}catch(_){ctx=new AudioContext({latencyHint:'interactive'})}
    c.relay.ctx=ctx;
    c.relay.out=ctx.createGain();c.relay.out.gain.value=c.deaf?0:1;c.relay.out.connect(ctx.destination);
    await ctx.audioWorklet.addModule('/js/call-worklet.js');
    if(call!==c)return;
    const src=ctx.createMediaStreamSource(c.mic),node=new AudioWorkletNode(ctx,'wvm-mic'),silent=ctx.createGain();
    silent.gain.value=0;src.connect(node).connect(silent).connect(ctx.destination); // it only runs while connected to the output
    node.port.onmessage=({data})=>{if(c.mic.getAudioTracks()[0]?.enabled)relaySend(c,KIND.voice,new Uint8Array(data))};
    resumeSound(ctx);
  }catch(e){console.warn('call relay audio',e);if(call===c){dcSend({type:'call.end',callId:c.id});finish("Couldn't start the call's sound.",'err')}return}
  openRelay(c,0);
}
function openRelay(c,tries){
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/call-relay/?id=${encodeURIComponent(c.id)}`);
  ws.binaryType='arraybuffer';c.relay.ws=ws;keepAlive(ws,'ping');
  ws.onmessage=({data})=>{
    if(call!==c)return;
    if(typeof data==='string'){
      if(data==='ready'){if(!c.started){c.started=true;stopRing();startTimer()}ui('active');tellState();if(c.screen)startFrames(c,'screen');if(c.cam)startFrames(c,'cam')}
      else if(data==='gone')ui('active','Reconnecting…');
      return;
    }
    const b=new Uint8Array(data),k=b[0];
    if(k===KIND.voice)return playVoice(c,b.subarray(1));
    for(const[name,f]of Object.entries(FRAMES)){
      if(k===f.kind)showFrame(c,name,b.subarray(1));
      else if(k===f.end){c.relay.shown[name]++;remoteVideo(name,false)} // frames still being decoded are too late now
    }
  };
  ws.onclose=e=>{
    if(call!==c||c.relay?.ws!==ws||e.code===1000||e.code===4003)return;
    if(tries<5){ui('active','Reconnecting…');setTimeout(()=>{if(call===c)openRelay(c,tries+1)},1000*(tries+1))}
    else{dcSend({type:'call.end',callId:c.id});finish('Lost the connection to the call.','err')}
  };
}
function relaySend(c,kind,bytes){
  const ws=c.relay?.ws;if(!ws||ws.readyState!==1)return;
  const out=new Uint8Array(bytes.length+1);out[0]=kind;out.set(bytes,1);
  ws.send(out);if(kind===KIND.voice)c.relay.stats.sent++;
}
function playVoice(c,bytes){
  const r=c.relay,ctx=r.ctx;if(!ctx||!bytes.length)return;
  const buf=ctx.createBuffer(1,bytes.length,16000),d=buf.getChannelData(0);
  let sum=0;
  for(let i=0;i<bytes.length;i++){d[i]=ULAW[bytes[i]];const a=Math.abs(d[i]);sum+=d[i]*d[i];if(a>r.stats.peak)r.stats.peak=a}
  if(Math.sqrt(sum/bytes.length)>.02)r.loudAt=Date.now();
  r.stats.got++;
  // 80 ms of slack against jitter; a backlog (a stall that caught up) is dropped
  const now=ctx.currentTime;
  if(r.playAt<now+.02||r.playAt>now+.5)r.playAt=now+.08;
  const s=ctx.createBufferSource();s.buffer=buf;s.connect(r.out||ctx.destination);s.start(r.playAt);r.playAt+=buf.duration;
}
async function showFrame(c,name,bytes){
  const gen=c.relay.shown[name];
  try{
    const img=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
    if(call!==c||c.relay?.shown[name]!==gen)return img.close();
    const cv=$(FRAMES[name].canvas);
    if(cv.width!==img.width||cv.height!==img.height){cv.width=img.width;cv.height=img.height}
    cv.getContext('2d').drawImage(img,0,0);img.close();
    c.relay.stats[name==='cam'?'camFrames':'frames']++;
    if(!C.classList.contains(name==='cam'?'has-cam':'has-screen'))remoteVideo(name,true);
  }catch(_){}
}
/* a video (screen or camera) as JPEG pictures on a timer; a slow network gets fewer */
function startFrames(c,name){
  const f=FRAMES[name],stream=name==='cam'?c.cam:c.screen;
  if(!c.relay||c.relay.frames[name]||!stream)return;
  const v=document.createElement('video');v.muted=true;v.playsInline=true;v.srcObject=new MediaStream(stream.getVideoTracks());v.play().catch(()=>{});
  const cv=document.createElement('canvas');let busy=false;
  c.relay.frames[name]=setInterval(async()=>{
    const ws=c.relay?.ws;
    if(busy||!ws||ws.readyState!==1||ws.bufferedAmount>256*1024||!v.videoWidth)return;
    const sc=Math.min(1,f.w/v.videoWidth,f.h/v.videoHeight);
    cv.width=Math.round(v.videoWidth*sc);cv.height=Math.round(v.videoHeight*sc);
    cv.getContext('2d').drawImage(v,0,0,cv.width,cv.height);
    busy=true;
    const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',f.q));
    busy=false;
    if(blob&&call===c&&c.relay?.frames[name])relaySend(c,f.kind,new Uint8Array(await blob.arrayBuffer()));
  },f.every);
}
function stopFrames(c,name,quiet){if(!c.relay)return;clearInterval(c.relay.frames[name]);delete c.relay.frames[name];if(!quiet)relaySend(c,FRAMES[name].end,new Uint8Array(0))}

/* ---- starting and answering ---- */
async function start(peer){
  peer=String(peer||'').toLowerCase();
  if(!peer)return;
  if(!chatMeAccount){toast('Make an account to make calls.','err');return}
  if(call){toast("You're already in a call.",'err');return}
  if(peer===chatMe){toast("You can't call yourself.",'err');return}
  if(window.voice?.active){window.voice.leave(true);toast('You left voice for the call')} // one mic, one conversation
  const id=crypto.randomUUID();
  call={id,peer,dir:'out',polite:false};
  ui('outgoing','Starting your mic…');
  let mic;
  try{mic=await getMic()}catch(e){if(call?.id===id)reset();toast(e.message,'err');return}
  if(!call||call.id!==id){mic.getTracks().forEach(t=>t.stop());return} // hung up while the browser asked
  call.mic=mic;
  if(!dcSend({type:'call.invite',callId:id,to:peer})){finish('Chat is offline, so calls are too. Try again in a moment.','err');return}
  ui('outgoing','Calling…');ring('out');
}
async function accept(){
  if(!call||call.dir!=='in'||call.state==='answering')return;
  call.state='answering';stopRing();
  if(window.voice?.active){window.voice.leave(true);toast('You left voice for the call')}
  ui('active','Starting your mic…');
  const id=call.id;
  let mic;
  try{mic=await getMic()}catch(e){dcSend({type:'call.decline',callId:id});if(call?.id===id)reset();toast(e.message,'err');return}
  if(!call||call.id!==id){mic.getTracks().forEach(t=>t.stop());return}
  call.mic=mic;
  dcSend({type:'call.accept',callId:id});
  if(relayFirst()){goRelay('choice');return}
  await makePeer();
  if(call?.id===id&&!call.relay)ui('active','Connecting…');
}
function decline(){if(!call)return;dcSend({type:'call.decline',callId:call.id});reset()}
function hangup(){
  if(!call)return;
  dcSend({type:call.dir==='in'&&!call.pc&&!call.relay?'call.decline':'call.end',callId:call.id});
  reset();
}

/* ---- in-call controls ---- */
function toggleMute(){
  const t=call?.mic?.getAudioTracks()[0];if(!t)return;
  if(call.deaf){setDeaf(false);return} // like Discord: unmuting while deafened undeafens
  t.enabled=!t.enabled;ui(C.dataset.state);tellState();
  toast(t.enabled?'Mic on':'Mic muted');
}
/* ---- screen share quality ----
   Discord-style presets, picked from the arrow next to the share button and kept
   between calls. Each sets the capture size and frame rate, the encoder's hint
   (motion keeps the frame rate when the network struggles, detail and text keep
   the resolution), and a bitrate ceiling well above WebRTC's default, which is what
   made shared text blurry. Through the relay they pick the picture size, JPEG
   quality and pictures a second instead. */
const SHARE_Q={
  smooth:{w:1920,h:1080,fps:60,hint:'motion',bitrate:6e6,pref:'maintain-framerate',relay:{w:960,h:540,every:150,q:.55}},
  balanced:{w:1920,h:1080,fps:30,hint:'detail',bitrate:4e6,pref:'balanced',relay:{w:1280,h:720,every:250,q:.6}},
  sharp:{w:2560,h:1440,fps:15,hint:'text',bitrate:8e6,pref:'maintain-resolution',relay:{w:1600,h:900,every:400,q:.75}},
};
const lsGet=(k,d)=>{try{return localStorage.getItem(k)??d}catch(_){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};
let shareQ=SHARE_Q[lsGet('wvm.shareQuality','balanced')]?lsGet('wvm.shareQuality','balanced'):'balanced';
let shareSound=lsGet('wvm.shareSound','1')!=='0';
function relayScreen(){Object.assign(FRAMES.screen,SHARE_Q[shareQ].relay)}
/* the encoder settings only exist once the track has been negotiated, so keep trying briefly */
let tuneGen=0;
function tuneSender(c){const gen=++tuneGen;tuneTry(c,gen,0)} // a newer pick cancels an older one still retrying
async function tuneTry(c,gen,tries){
  const sender=(c.screenSenders||[]).find(x=>x.track?.kind==='video');
  if(!sender||call!==c||gen!==tuneGen)return;
  const again=()=>{if(tries<20)setTimeout(()=>tuneTry(c,gen,tries+1),300)};
  try{
    const p=sender.getParameters(),q=SHARE_Q[shareQ];
    if(!p.encodings?.length)return again();
    p.encodings[0].maxBitrate=q.bitrate;p.encodings[0].maxFramerate=q.fps;
    p.degradationPreference=q.pref;
    await sender.setParameters(p);
  }catch(_){again()}
}
async function applyQuality(){
  const c=call,t=c?.screen?.getVideoTracks()[0];if(!t)return;
  const q=SHARE_Q[shareQ];
  try{t.contentHint=q.hint}catch(_){}
  // the encoder first: changing the capture can take a while, and doesn't need to hold it up
  if(c.relay){stopFrames(c,'screen',true);relayScreen();startFrames(c,'screen')}
  else tuneSender(c);
  try{await t.applyConstraints({width:{max:q.w},height:{max:q.h},frameRate:{ideal:q.fps,max:q.fps}})}catch(_){}
}
async function toggleShare(){
  if(!call?.pc&&!call?.relay)return;
  if(call.screen)return stopShare();
  const q=SHARE_Q[shareQ];
  let stream;
  try{stream=await navigator.mediaDevices.getDisplayMedia({
    video:{width:{max:q.w},height:{max:q.h},frameRate:{ideal:q.fps,max:q.fps}},
    // your tab's or screen's sound, as it is: voice processing would mangle music and games
    audio:shareSound&&!call.relay?{echoCancellation:false,noiseSuppression:false,autoGainControl:false}:false,
    systemAudio:shareSound?'include':'exclude',surfaceSwitching:'include',selfBrowserSurface:'exclude'})}
  catch(e){if(e.name!=='NotAllowedError')toast("Couldn't share the screen.",'err');return}
  if(!call?.pc&&!call?.relay){stream.getTracks().forEach(t=>t.stop());return}
  call.screen=stream;
  try{stream.getVideoTracks()[0].contentHint=q.hint}catch(_){}
  if(call.relay){relayScreen();startFrames(call,'screen')} // through our server: pictures, no sound
  else{signal({media:{[stream.id]:'screen'}});call.screenSenders=stream.getTracks().map(t=>call.pc.addTrack(t,stream));tuneSender(call)}
  stream.getVideoTracks()[0].onended=stopShare; // the browser's own "Stop sharing" button
  selfPreview();
  ui('active');toast(`You're live · ${shareQ[0].toUpperCase()+shareQ.slice(1)}`,'ok');
}
/* the quality menu */
function paintMenu(){
  $$('#cl-q-menu [data-q]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.q===shareQ)));
  $('#cl-share-sound').checked=shareSound;
}
function closeMenu(){$('#cl-q-menu').hidden=true}
/* the menu opens next to its button, above it unless there's no room there */
function placeMenu(){
  const m=$('#cl-q-menu'),r=$('#cl-share-q').getBoundingClientRect(),w=m.offsetWidth,h=m.offsetHeight;
  const left=Math.max(8,Math.min(r.left+r.width/2-w/2,innerWidth-w-8));
  const top=r.top-h-10>=8?r.top-h-10:Math.min(r.bottom+10,innerHeight-h-8);
  Object.assign(m.style,{left:left+'px',top:top+'px'});
}
$('#cl-share-q').onclick=e=>{e.stopPropagation();click();paintMenu();const m=$('#cl-q-menu');m.hidden=!m.hidden;if(!m.hidden)placeMenu()};
$('#cl-q-menu').addEventListener('click',e=>{
  e.stopPropagation();
  const b=e.target.closest('[data-q]');if(!b)return;
  click();shareQ=b.dataset.q;lsSet('wvm.shareQuality',shareQ);paintMenu();closeMenu();
  if(call?.screen){applyQuality();toast(`Stream quality: ${b.querySelector('b').textContent}`)}
});
$('#cl-share-sound').onchange=e=>{shareSound=e.target.checked;lsSet('wvm.shareSound',shareSound?'1':'0');if(call?.screen)toast('Takes effect the next time you share')};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#cl-q-menu,#cl-share-q'))closeMenu()});
function stopShare(){
  if(!call?.screen)return;
  if(call.relay)stopFrames(call,'screen');
  else for(const s of call.screenSenders||[])try{call.pc.removeTrack(s)}catch(_){}
  call.screen.getTracks().forEach(t=>t.stop());
  call.screen=null;call.screenSenders=null;
  selfPreview();
  ui('active');
}
async function toggleCam(){
  if(!call?.pc&&!call?.relay)return;
  if(call.cam)return stopCam();
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false})}
  catch(e){toast(e.name==='NotAllowedError'?'Camera blocked. Allow it in the browser to turn it on.':e.name==='NotFoundError'?'No camera found.':"Couldn't start the camera.",'err');return}
  if(!call?.pc&&!call?.relay||call.cam){stream.getTracks().forEach(t=>t.stop());return}
  call.cam=stream;
  if(call.relay)startFrames(call,'cam'); // through our server: small pictures, about 6 a second
  else{signal({media:{[stream.id]:'cam'}});call.camSenders=stream.getTracks().map(t=>call.pc.addTrack(t,stream))}
  stream.getVideoTracks()[0].onended=stopCam; // unplugged
  selfPreview();ui('active');
}
function stopCam(){
  if(!call?.cam)return;
  if(call.relay)stopFrames(call,'cam');
  else for(const s of call.camSenders||[])try{call.pc.removeTrack(s)}catch(_){}
  call.cam.getTracks().forEach(t=>t.stop());
  call.cam=null;call.camSenders=null;
  selfPreview();ui('active');
}

/* ---- messages from chat.js ---- */
function onMessage(d){
  switch(d.type){
    case 'call.invite':{
      if(call){dcSend({type:'call.decline',callId:d.callId});return} // already on a call on this tab
      call={id:d.callId,peer:d.from,dir:'in',polite:true};
      ui('incoming','is calling you…');ring('in');
      notify(`${nameOf(d.from)} is calling`,'Tap to answer in william\'s vm',{tag:'call',onclick:()=>{}});
      window.motion?.pop?.($('#cl-av'));
      return;
    }
    case 'call.accepted':{
      if(!call||call.id!==d.callId)return;
      stopRing();ui('active','Connecting…');
      if(relayFirst()){goRelay('choice');return}
      makePeer().then(pc=>{if(pc&&call?.pc===pc)call.mic.getTracks().forEach(t=>pc.addTrack(t,call.mic))}); // adding tracks fires the first offer
      return;
    }
    case 'call.signal':
      if(!call||call.id!==d.callId)return;
      if(d.data?.relay){goRelay('peer-'+(d.data.why||''));return} // the other side can't connect directly: meet on our server
      queueSignal(d.data||{});return;
    case 'call.ended':{
      if(!call||call.id!==d.callId)return;
      const wasRinging=call.dir==='in'&&!call.pc;
      const reason=d.reason;
      if(wasRinging&&reason==='answered elsewhere'){reset();return}
      finish(wasRinging?'hung up':(REASONS[reason]||'call ended'),reason==='hangup'||reason==='declined'?'':'err');
      return;
    }
  }
}

/* ---- wiring ---- */
$('#cl-accept').onclick=()=>{click();accept()};
$('#cl-decline').onclick=()=>{click();decline()};
$('#cl-end').onclick=()=>{click();hangup()};
$('#cl-mute').onclick=()=>{click();toggleMute()};
$('#cl-share').onclick=()=>{click();toggleShare()};
$('#cl-cam').onclick=()=>{click();toggleCam()};
$('#cl-deaf').onclick=()=>{click();setDeaf(!call?.deaf)};
$('#cl-size').onclick=()=>{click();C.classList.toggle('big');layout()};
// fullscreen: the tile in focus, else the whole call
$('#cl-fs').onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await ($(TILES[focus]||'')||$('#cl-tiles')).requestFullscreen()}catch(_){}};
// Discord's shortcuts: Ctrl+Shift+M mutes, Ctrl+Shift+D deafens
document.addEventListener('keydown',e=>{
  if(!call||C.dataset.state!=='active'||!e.ctrlKey||!e.shiftKey||e.altKey)return;
  const k=e.key.toLowerCase();
  if(k==='m'){e.preventDefault();toggleMute()}else if(k==='d'){e.preventDefault();setDeaf(!call.deaf)}
});
$('#dc-call').onclick=()=>{click();start($('#dc-call').dataset.to)};
window.addEventListener('beforeunload',()=>{if(call)dcSend({type:call.dir==='in'&&!call.pc&&!call.relay?'call.decline':'call.end',callId:call.id})});

window.calls={start,onMessage,hangup,get active(){return !!call},
  // the network changed (app.js): a direct call looks for new paths at once
  heal(){const pc=call?.pc;if(!pc||call.relay)return;try{pc.restartIce()}catch(_){}heal(pc)},
  /* the screen share presets, shared with Go Live in voice channels (js/voice.js) */
  share:{presets:SHARE_Q,get quality(){return shareQ},set quality(q){if(SHARE_Q[q]){shareQ=q;lsSet('wvm.shareQuality',q)}},get sound(){return shareSound},set sound(on){shareSound=!!on;lsSet('wvm.shareSound',on?'1':'0')}},
  /* for the tests: WebRTC's own numbers (what's being sent and received) */
  async rtc(){const pc=call?.pc;if(!pc)return null;const out=[];(await pc.getStats()).forEach(r=>{if(/^(in|out)bound-rtp$/.test(r.type)&&r.kind==='video')out.push({type:r.type,bytes:r.bytesSent??r.bytesReceived,frames:r.framesEncoded??r.framesDecoded,w:r.frameWidth,h:r.frameHeight,fps:r.framesPerSecond,limit:r.qualityLimitationReason})});return{sig:pc.signalingState,conn:pc.connectionState,tx:pc.getTransceivers().map(t=>(t.receiver.track?.kind||"?")+":"+t.currentDirection),out,senders:pc.getSenders().filter(x=>x.track?.kind==='video').map(x=>{const p=x.getParameters();return{hint:x.track.contentHint,maxBitrate:p.encodings?.[0]?.maxBitrate,maxFramerate:p.encodings?.[0]?.maxFramerate,pref:p.degradationPreference}})}},
  /* how the call is going: direct, or through our server with what's been sent and received */
  stats(){
    if(!call)return null;
    const video={cam:C.classList.contains('has-cam'),screen:C.classList.contains('has-screen')};
    const extra={layout:C.dataset.mode,focus,muted:muted(),deaf:!!call.deaf,theirs:call.theirs||null,quality:shareQ,
      speaking:{me:$('#cl-t-me').classList.contains('speaking'),them:$('#cl-t-them').classList.contains('speaking')}};
    const v=call.screen?.getVideoTracks()[0];if(v)extra.sharing={...v.getSettings(),hint:v.contentHint};
    return call.relay?{id:call.id,mode:'relay',video,...extra,...call.relay.stats}:{id:call.id,mode:call.pc?'direct':'none',state:call.pc?.connectionState,video,...extra};
  }};
})();
