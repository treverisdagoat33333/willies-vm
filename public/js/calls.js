/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   VOICE CALLS + SCREEN SHARE (1:1, accounts only)
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
const CAN_SHARE=!!navigator.mediaDevices?.getDisplayMedia;
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

/* ---- UI ---- */
function ui(state,status){
  C.dataset.state=state;
  if(!call)return;
  const av=$('#cl-av');av.textContent=(nameOf(call.peer)[0]||'?').toUpperCase();av.style.background=colorOf(call.peer);
  $('#cl-name').textContent=nameOf(call.peer);
  if(status!=null)$('#cl-status').textContent=status;
  $('#cl-mute').classList.toggle('on',!!call.mic&&!call.mic.getAudioTracks()[0]?.enabled);
  $('#cl-share').classList.toggle('on',!!call.screen);
  $('#cl-share').hidden=!CAN_SHARE;
}
function startTimer(){
  const t0=Date.now();clearInterval(timerI);
  const tick=()=>{const s=Math.floor((Date.now()-t0)/1000);$('#cl-status').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`+(call?.relay?' · via our server':'')};
  tick();timerI=setInterval(tick,1000);
}
function reset(){
  stopRing();clearInterval(timerI);
  if(call){
    clearTimeout(call.directT);
    try{call.pc?.close()}catch(_){}
    if(call.relay){clearInterval(call.relay.frameT);try{call.relay.ws?.close(1000)}catch(_){}call.relay.ctx?.close().catch(()=>{})}
    call.mic?.getTracks().forEach(t=>t.stop());
    call.screen?.getTracks().forEach(t=>t.stop());
  }
  call=null;
  $('#cl-remote-video').srcObject=null;$('#cl-self').srcObject=null;
  $$('#cl-audio audio').forEach(a=>{a.srcObject=null;a.remove()});
  C.classList.remove('has-video','self-video','big','relay-video');
  C.dataset.state='off';
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
  call.pc=pc;
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
      const a=document.createElement('audio');a.autoplay=true;a.srcObject=new MediaStream([track]);
      $('#cl-audio').appendChild(a);a.play().catch(()=>{});
      track.onended=()=>a.remove();
      return;
    }
    const v=$('#cl-remote-video');v.srcObject=new MediaStream([track]);
    const show=on=>{C.classList.toggle('has-video',on);if(on)C.classList.add('big')};
    show(true);
    track.onmute=()=>show(false);track.onunmute=()=>show(true);track.onended=()=>show(false);
  };
  pc.onconnectionstatechange=()=>{
    if(!call||call.pc!==pc)return;
    const s=pc.connectionState;
    if(s==='connected'){clearTimeout(call.directT);if(!call.started){call.started=true;stopRing();startTimer()}ui('active')}
    else if(s==='disconnected')ui('active','Reconnecting…');
    else if(s==='failed')goRelay('failed'); // the network won't carry it directly
  };
  return pc;
}
/* one message at a time: a candidate must not race the offer it belongs to */
function queueSignal(data){const c=call;if(!c)return;c.sig=(c.sig||Promise.resolve()).then(()=>call===c&&onSignal(data))}
async function onSignal({description,candidate}){
  const pc=call?.pc;if(!pc)return;
  try{
    if(description){
      const collision=description.type==='offer'&&(call.makingOffer||pc.signalingState!=='stable');
      call.ignoreOffer=!call.polite&&collision;
      if(call.ignoreOffer)return;
      await pc.setRemoteDescription(description);
      if(description.type==='offer'){
        // the callee adds its mic once the first offer arrives, so it rides the answer
        if(!call.gotOffer){call.gotOffer=true;call.mic.getTracks().forEach(t=>pc.addTrack(t,call.mic))}
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
   voice as 16 kHz μ-law (js/call-worklet.js), 20 ms at a time, and a shared
   screen as JPEG frames, 3 a second. Messages: [kind, ...bytes]. */
const RELAY_AFTER=9000,RELAY_MEMORY=24*3600e3;
const KIND={voice:1,frame:2,frameEnd:3};
const ULAW=new Float32Array(256).map((_,u)=>{u=~u&0xff;const e=(u>>4)&7;const x=((((u&15)<<3)+0x84)<<e)-0x84;return(u&0x80?-x:x)/32768});
const relayFirst=()=>{try{return localStorage.getItem('wvm.callRelay')==='always'||Date.now()<+localStorage.getItem('wvm.callRelayUntil')}catch(_){return false}};
async function goRelay(why){
  const c=call;
  if(!c||c.relay||!c.mic)return;
  c.relay={ws:null,ctx:null,playAt:0,frameT:null,shown:0,stats:{sent:0,got:0,peak:0,frames:0}};
  clearTimeout(c.directT);
  if(!why.startsWith('peer'))signal({relay:true,why}); // the other side follows
  // the direct path didn't work (for either of us): go straight to the relay next time
  if(/^(peer-)?(failed|slow)$/.test(why))try{localStorage.setItem('wvm.callRelayUntil',String(Date.now()+RELAY_MEMORY))}catch(_){} // go straight there next time
  try{c.pc?.close()}catch(_){}
  c.pc=null;
  $$('#cl-audio audio').forEach(a=>{a.srcObject=null;a.remove()});
  $('#cl-remote-video').srcObject=null;C.classList.remove('has-video');
  ui('active','Connecting through our server…');
  try{
    let ctx;
    try{ctx=new AudioContext({sampleRate:16000,latencyHint:'interactive'})}catch(_){ctx=new AudioContext({latencyHint:'interactive'})}
    c.relay.ctx=ctx;
    await ctx.audioWorklet.addModule('/js/call-worklet.js');
    if(call!==c)return;
    const src=ctx.createMediaStreamSource(c.mic),node=new AudioWorkletNode(ctx,'wvm-mic'),silent=ctx.createGain();
    silent.gain.value=0;src.connect(node).connect(silent).connect(ctx.destination); // it only runs while connected to the output
    node.port.onmessage=({data})=>{if(c.mic.getAudioTracks()[0]?.enabled)relaySend(c,KIND.voice,new Uint8Array(data))};
    ctx.resume().catch(()=>{});
  }catch(e){console.warn('call relay audio',e);if(call===c){dcSend({type:'call.end',callId:c.id});finish("Couldn't start the call's sound.",'err')}return}
  openRelay(c,0);
}
function openRelay(c,tries){
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/call-relay/?id=${encodeURIComponent(c.id)}`);
  ws.binaryType='arraybuffer';c.relay.ws=ws;
  ws.onmessage=({data})=>{
    if(call!==c)return;
    if(typeof data==='string'){
      if(data==='ready'){if(!c.started){c.started=true;stopRing();startTimer()}ui('active');if(c.screen)startFrames(c)}
      else if(data==='gone')ui('active','Reconnecting…');
      return;
    }
    const b=new Uint8Array(data);
    if(b[0]===KIND.voice)playVoice(c,b.subarray(1));
    else if(b[0]===KIND.frame)showFrame(c,b.subarray(1));
    else if(b[0]===KIND.frameEnd){c.relay.shown++;relayVideo(false)} // frames still being decoded are too late now
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
  for(let i=0;i<bytes.length;i++){d[i]=ULAW[bytes[i]];const a=Math.abs(d[i]);if(a>r.stats.peak)r.stats.peak=a}
  r.stats.got++;
  // 80 ms of slack against jitter; a backlog (a stall that caught up) is dropped
  const now=ctx.currentTime;
  if(r.playAt<now+.02||r.playAt>now+.5)r.playAt=now+.08;
  const s=ctx.createBufferSource();s.buffer=buf;s.connect(ctx.destination);s.start(r.playAt);r.playAt+=buf.duration;
}
function relayVideo(on){C.classList.toggle('relay-video',on);C.classList.toggle('has-video',on);if(on)C.classList.add('big')}
async function showFrame(c,bytes){
  const gen=c.relay.shown;
  try{
    const img=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
    if(call!==c||c.relay?.shown!==gen)return img.close();
    const cv=$('#cl-remote-canvas');
    if(cv.width!==img.width||cv.height!==img.height){cv.width=img.width;cv.height=img.height}
    cv.getContext('2d').drawImage(img,0,0);img.close();
    c.relay.stats.frames++;
    if(!C.classList.contains('relay-video'))relayVideo(true);
  }catch(_){}
}
function startFrames(c){
  if(!c.relay||c.relay.frameT||!c.screen)return;
  const v=document.createElement('video');v.muted=true;v.playsInline=true;v.srcObject=new MediaStream(c.screen.getVideoTracks());v.play().catch(()=>{});
  const cv=document.createElement('canvas');let busy=false;
  c.relay.frameT=setInterval(async()=>{
    const ws=c.relay?.ws;
    if(busy||!ws||ws.readyState!==1||ws.bufferedAmount>256*1024||!v.videoWidth)return; // a slow network gets fewer frames
    const sc=Math.min(1,1280/v.videoWidth,720/v.videoHeight);
    cv.width=Math.round(v.videoWidth*sc);cv.height=Math.round(v.videoHeight*sc);
    cv.getContext('2d').drawImage(v,0,0,cv.width,cv.height);
    busy=true;
    const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.6));
    busy=false;
    if(blob&&call===c&&c.relay?.frameT)relaySend(c,KIND.frame,new Uint8Array(await blob.arrayBuffer()));
  },333);
}
function stopFrames(c){if(!c.relay)return;clearInterval(c.relay.frameT);c.relay.frameT=null;relaySend(c,KIND.frameEnd,new Uint8Array(0))}

/* ---- starting and answering ---- */
async function start(peer){
  peer=String(peer||'').toLowerCase();
  if(!peer)return;
  if(!chatMeAccount){toast('Make an account to make calls.','err');return}
  if(call){toast("You're already in a call.",'err');return}
  if(peer===chatMe){toast("You can't call yourself.",'err');return}
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
  t.enabled=!t.enabled;ui(C.dataset.state);
  toast(t.enabled?'Mic on':'Mic muted');
}
async function toggleShare(){
  if(!call?.pc&&!call?.relay)return;
  if(call.screen)return stopShare();
  let stream;
  try{stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30}},audio:!call.relay})}
  catch(e){if(e.name!=='NotAllowedError')toast("Couldn't share the screen.",'err');return}
  if(!call?.pc&&!call?.relay){stream.getTracks().forEach(t=>t.stop());return}
  call.screen=stream;
  if(call.relay)startFrames(call); // through our server: a picture a third of a second, no sound
  else call.screenSenders=stream.getTracks().map(t=>call.pc.addTrack(t,stream));
  stream.getVideoTracks()[0].onended=stopShare; // the browser's own "Stop sharing" button
  $('#cl-self').srcObject=new MediaStream(stream.getVideoTracks());
  C.classList.add('self-video');
  ui('active');toast('Sharing your screen','ok');
}
function stopShare(){
  if(!call?.screen)return;
  if(call.relay)stopFrames(call);
  else for(const s of call.screenSenders||[])try{call.pc.removeTrack(s)}catch(_){}
  call.screen.getTracks().forEach(t=>t.stop());
  call.screen=null;call.screenSenders=null;
  $('#cl-self').srcObject=null;C.classList.remove('self-video');
  ui('active');
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
$('#cl-size').onclick=()=>{click();C.classList.toggle('big')};
$('#cl-fs').onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await $('#cl-video').requestFullscreen()}catch(_){}};
$('#dc-call').onclick=()=>{click();start($('#dc-call').dataset.to)};
window.addEventListener('beforeunload',()=>{if(call)dcSend({type:call.dir==='in'&&!call.pc&&!call.relay?'call.decline':'call.end',callId:call.id})});

window.calls={start,onMessage,hangup,get active(){return !!call},
  /* how the call is going: direct, or through our server with what's been sent and received */
  stats(){return !call?null:call.relay?{id:call.id,mode:'relay',...call.relay.stats}:{id:call.id,mode:call.pc?'direct':'none',state:call.pc?.connectionState}}};
})();
