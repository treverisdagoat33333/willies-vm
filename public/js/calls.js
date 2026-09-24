/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   VOICE CALLS + SCREEN SHARE (1:1, accounts only)
   The chat socket carries the WebRTC handshake (call.* messages, relayed
   by chat.js); audio and screen go straight between the two browsers.
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
  const tick=()=>{const s=Math.floor((Date.now()-t0)/1000);$('#cl-status').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
  tick();timerI=setInterval(tick,1000);
}
function reset(){
  stopRing();clearInterval(timerI);
  if(call){
    try{call.pc?.close()}catch(_){}
    call.mic?.getTracks().forEach(t=>t.stop());
    call.screen?.getTracks().forEach(t=>t.stop());
  }
  call=null;
  $('#cl-remote-video').srcObject=null;$('#cl-self').srcObject=null;
  $$('#cl-audio audio').forEach(a=>{a.srcObject=null;a.remove()});
  C.classList.remove('has-video','self-video','big');
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
  const pc=new RTCPeerConnection({iceServers:await iceServers()});
  call.pc=pc;
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
    if(s==='connected'){if(!call.started){call.started=true;stopRing();startTimer()}ui('active')}
    else if(s==='disconnected')ui('active','Reconnecting…');
    else if(s==='failed'){dcSend({type:'call.end',callId:call.id});finish("Couldn't connect the call. The network may be blocking it.",'err')}
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
  await makePeer();
  dcSend({type:'call.accept',callId:id});
  ui('active','Connecting…');
}
function decline(){if(!call)return;dcSend({type:'call.decline',callId:call.id});reset()}
function hangup(){
  if(!call)return;
  dcSend({type:call.dir==='in'&&!call.pc?'call.decline':'call.end',callId:call.id});
  reset();
}

/* ---- in-call controls ---- */
function toggleMute(){
  const t=call?.mic?.getAudioTracks()[0];if(!t)return;
  t.enabled=!t.enabled;ui(C.dataset.state);
  toast(t.enabled?'Mic on':'Mic muted');
}
async function toggleShare(){
  if(!call?.pc)return;
  if(call.screen)return stopShare();
  let stream;
  try{stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30}},audio:true})}
  catch(e){if(e.name!=='NotAllowedError')toast("Couldn't share the screen.",'err');return}
  if(!call?.pc){stream.getTracks().forEach(t=>t.stop());return}
  call.screen=stream;
  call.screenSenders=stream.getTracks().map(t=>call.pc.addTrack(t,stream));
  stream.getVideoTracks()[0].onended=stopShare; // the browser's own "Stop sharing" button
  $('#cl-self').srcObject=new MediaStream(stream.getVideoTracks());
  C.classList.add('self-video');
  ui('active');toast('Sharing your screen','ok');
}
function stopShare(){
  if(!call?.screen)return;
  for(const s of call.screenSenders||[])try{call.pc.removeTrack(s)}catch(_){}
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
      makePeer().then(pc=>call.mic.getTracks().forEach(t=>pc.addTrack(t,call.mic))); // adding tracks fires the first offer
      return;
    }
    case 'call.signal':if(call&&call.id===d.callId)queueSignal(d.data||{});return;
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
window.addEventListener('beforeunload',()=>{if(call)dcSend({type:call.dir==='in'&&!call.pc?'call.decline':'call.end',callId:call.id})});

window.calls={start,onMessage,hangup,get active(){return !!call}};
})();
