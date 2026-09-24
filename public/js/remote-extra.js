/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   REMOTE PC: FILES + SOUND
   Rides the Remote PC socket from app.js (rmWS, rmSend, rmActive, rmPc).
   Files: "WVF1" + uint32 LE id + bytes, both ways. Each side acknowledges
   what landed and keeps at most WINDOW bytes in flight.
   Sound: "WVA1" + uint32 LE rate + uint16 LE channels + 2 spare bytes +
   16-bit PCM, played through Web Audio with a small jitter buffer.
   ═══════════════════════════════════════════════════════════ */
(()=>{
const WINDOW=4*1024*1024,ACK_EVERY=1024*1024,CHUNK=256*1024,MEM_MAX=500*1024*1024,STALL_MS=60000;
const MAGIC_F=[0x57,0x56,0x46,0x31];
const panel=$('#rm-files'),listEl=$('#rf-list'),xfersEl=$('#rf-xfers');
let listing=null,cwd=null,loadingPath=null;
const xfers=new Map(); // id -> transfer
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const newId=()=>(Math.floor(Math.random()*0x7ffffffe)+1);
function fmtSize(n){if(n<1024)return n+' B';const u=['KB','MB','GB','TB'];let i=-1;do{n/=1024;i++}while(n>=1024&&i<u.length-1);return(n>=100?Math.round(n):n.toFixed(1))+' '+u[i]}
const fmtDate=ms=>ms?new Date(ms).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'';
const sepOf=p=>String(p).includes('\\')?'\\':'/';
const join=(dir,name)=>{const s=sepOf(dir);return dir.endsWith(s)?dir+name:dir+s+name};
const ICON_DIR='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const ICON_FILE='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>';
const ICON_DRIVE='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 17h.01M5 13 7.5 4h9L19 13"/></svg>';

/* ═══ browsing ═══ */
function openFiles(){
  if(!rmActive){toast('Connect to a PC first.','err');return}
  panel.hidden=false;$('#remote-files-btn').classList.add('on');
  $('#rf-pc').textContent=rmPc?'on '+rmPc:'';
  if(!listing)go('');
}
function closeFiles(){panel.hidden=true;$('#remote-files-btn').classList.remove('on');$('#remote-canvas').focus()}
function go(p){
  if(!rmActive)return;
  loadingPath=p;
  listEl.innerHTML='<div class="rf-empty"><span class="mu-spin"></span>Loading…</div>';
  rmSend({t:'fs.list',path:p});
}
function renderList(m){
  if(m.error){
    listEl.innerHTML=`<div class="rf-empty err">${esc(m.error)}</div>`;
    $('#rf-path').value=m.path||'';
    return;
  }
  listing=m;cwd=m.path||'';
  $('#rf-path').value=cwd||'This PC';
  $('#rf-up').disabled=m.parent==null;
  $('#rf-quick').innerHTML=(m.quick||[]).map(q=>`<button data-go="${esc(q.path)}">${esc(q.name)}</button>`).join('');
  $('#rm-drop-to').textContent=cwd?'into '+cwd:'';
  if(!m.entries.length){listEl.innerHTML='<div class="rf-empty">This folder is empty. Drop files here to upload.</div>';return}
  listEl.innerHTML=m.entries.map((e,i)=>`<button class="rf-row${e.dir?' dir':''}" data-i="${i}" title="${esc(e.name)}">
      <span class="ic">${!cwd?ICON_DRIVE:e.dir?ICON_DIR:ICON_FILE}</span>
      <span class="nm">${esc(e.name)}</span>
      <small>${e.dir?'':fmtSize(e.size)}</small><small class="dt">${fmtDate(e.mtime)}</small>
    </button>`).join('')+(m.truncated?'<div class="rf-empty">Showing the first 1,500 items.</div>':'');
}
listEl.addEventListener('click',e=>{
  const row=e.target.closest('.rf-row');if(!row||!listing)return;
  const en=listing.entries[+row.dataset.i];if(!en)return;
  click();
  const full=en.path||join(cwd,en.name);
  if(en.dir)go(full);else download(en,full);
});
$('#rf-quick').addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b){click();go(b.dataset.go)}});
$('#rf-up').onclick=()=>{click();if(listing&&listing.parent!=null)go(listing.parent)};
$('#rf-roots').onclick=()=>{click();go('')};
$('#rf-refresh').onclick=()=>{click();go(cwd||'')};
$('#rf-path').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const v=e.target.value.trim();go(v==='This PC'?'':v)}if(e.key==='Escape')e.target.blur()});
$('#rf-close').onclick=()=>{click();closeFiles()};
$('#remote-files-btn').onclick=()=>{click();panel.hidden?openFiles():closeFiles()};

/* ═══ transfers ═══ */
function renderXfers(){
  xfersEl.innerHTML=[...xfers.values()].map(t=>{
    const p=t.size?Math.min(100,(t.dir==='down'?t.got:t.acked)/t.size*100):(t.state==='done'?100:0);
    const status=t.state==='done'?(t.dir==='down'?'Downloaded':'Uploaded'):t.state==='error'?t.error:
      `${fmtSize(t.dir==='down'?t.got:t.sent)} of ${fmtSize(t.size||0)}`;
    return `<div class="rf-x ${t.state}" data-id="${t.id}">
      <span class="dir">${t.dir==='down'?'↓':'↑'}</span>
      <div class="t"><b>${esc(t.name)}</b><small>${esc(status)}</small><div class="bar"><i style="width:${p}%"></i></div></div>
      ${t.state==='run'?'<button class="rf-ib" data-cancel aria-label="Cancel">✕</button>':''}
    </div>`;
  }).join('');
}
xfersEl.addEventListener('click',e=>{
  const b=e.target.closest('[data-cancel]');if(!b)return;
  const t=xfers.get(+b.closest('.rf-x').dataset.id);if(!t)return;
  click();rmSend({t:'file.cancel',id:t.id});fail(t,'Cancelled');
});
let xT=null;const renderSoon=()=>{if(!xT)xT=setTimeout(()=>{xT=null;renderXfers()},150)};
function settle(t){setTimeout(()=>{if(xfers.get(t.id)===t&&t.state!=='run'){xfers.delete(t.id);renderXfers()}},t.state==='done'?4000:8000)}
function fail(t,msg){
  if(t.state!=='run')return;
  t.state='error';t.error=msg;
  try{t.writer?.abort()}catch(_){}
  t.chunks=null;t.wake?.();renderXfers();settle(t);
}

async function download(en,full){
  let writer=null;
  if(window.showSaveFilePicker){
    try{writer=await (await showSaveFilePicker({suggestedName:en.name})).createWritable()}
    catch(e){if(e.name==='AbortError')return;writer=null}
  }
  if(!writer&&en.size>MEM_MAX){toast('Files over 500 MB need Chrome or Edge, which can save straight to disk.','err');return}
  const t={id:newId(),dir:'down',name:en.name,size:en.size,got:0,lastAck:0,chunks:writer?null:[],writer,writing:Promise.resolve(),state:'run'};
  xfers.set(t.id,t);renderXfers();
  rmSend({t:'file.get',id:t.id,path:full});
}
function onChunk(t,data){
  t.got+=data.byteLength;
  const ack=t.got-t.lastAck>=ACK_EVERY;if(ack)t.lastAck=t.got;
  const bytes=t.got;
  if(t.writer){
    // acknowledge only once it's on disk, so a slow disk slows the sender
    t.writing=t.writing.then(()=>t.writer.write(data)).then(()=>{if(ack)rmSend({t:'file.ack',id:t.id,bytes})}).catch(e=>{rmSend({t:'file.cancel',id:t.id});fail(t,'Saving failed: '+e.message)});
  }else{
    t.chunks.push(data);
    if(ack)rmSend({t:'file.ack',id:t.id,bytes});
  }
  renderSoon();
}
async function finishDownload(t){
  try{
    await t.writing;
    if(t.state!=='run')return;
    if(t.writer)await t.writer.close();
    else{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob(t.chunks));a.download=t.name;a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    }
    t.chunks=null;t.state='done';renderXfers();settle(t);
    toast(`Downloaded ${t.name}`,'ok');
  }catch(e){fail(t,'Saving failed: '+e.message)}
}

async function upload(fileList,dir){
  if(!rmActive){toast('Connect to a PC first.','err');return}
  if(!dir){toast('Open a folder in Files first, then upload into it.','err');openFiles();return}
  for(const file of fileList){
    const t={id:newId(),dir:'up',name:file.name,size:file.size,sent:0,acked:0,lastProgress:Date.now(),state:'run',target:dir};
    xfers.set(t.id,t);renderXfers();
    rmSend({t:'file.put',id:t.id,name:file.name,size:file.size,dir});
    try{
      const reader=file.stream().getReader();
      for(;;){
        const {value,done}=await reader.read();
        if(done)break;
        for(let off=0;off<value.byteLength;off+=CHUNK){
          while(t.state==='run'&&(t.sent-t.acked>WINDOW||(rmWS&&rmWS.bufferedAmount>WINDOW))){
            if(Date.now()-t.lastProgress>STALL_MS){rmSend({t:'file.cancel',id:t.id});fail(t,'The PC stopped responding.')}
            await new Promise(r=>{t.wake=r;setTimeout(r,60)});
          }
          if(t.state!=='run'||!rmActive||!rmWS){reader.cancel().catch(()=>{});if(t.state==='run')fail(t,'Disconnected');break}
          const part=value.subarray(off,Math.min(off+CHUNK,value.byteLength));
          const fr=new Uint8Array(8+part.byteLength);
          fr.set(MAGIC_F,0);new DataView(fr.buffer).setUint32(4,t.id,true);fr.set(part,8);
          rmWS.send(fr);t.sent+=part.byteLength;renderSoon();
        }
        if(t.state!=='run')break;
      }
      if(t.state==='run'){rmSend({t:'file.put.end',id:t.id});await new Promise(r=>{t.finished=r})}
    }catch(e){fail(t,"Couldn't read that file.")}
  }
}
$('#rf-upload').onclick=()=>{click();if(!cwd){toast('Open a folder first, then upload into it.','err');return}$('#rf-input').click()};
$('#rf-input').onchange=e=>{const f=[...e.target.files];e.target.value='';if(f.length)upload(f,cwd)};

/* drag files from your computer onto the remote screen */
const stage=$('#remote-stage'),drop=$('#rm-drop');
let dragDepth=0;
const hasFiles=e=>[...(e.dataTransfer?.types||[])].includes('Files');
stage.addEventListener('dragenter',e=>{if(!hasFiles(e)||!rmActive)return;e.preventDefault();dragDepth++;drop.classList.add('show')});
stage.addEventListener('dragover',e=>{if(hasFiles(e)&&rmActive){e.preventDefault();e.dataTransfer.dropEffect='copy'}});
stage.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;drop.classList.remove('show')}});
stage.addEventListener('drop',e=>{
  if(!hasFiles(e))return;
  e.preventDefault();dragDepth=0;drop.classList.remove('show');
  const f=[...e.dataTransfer.files];if(!f.length)return;
  // no folder open yet: the PC's Downloads folder is the natural spot
  const target=cwd||(listing?.quick||[]).find(q=>q.name==='Downloads')?.path;
  if(!target){openFiles();toast('Open a folder in Files, then drop again.','err');return}
  if(panel.hidden)openFiles();
  upload(f,target);
});

/* ═══ sound ═══ */
let soundWanted=false,actx=null,gain=null,nextT=0;
function renderSound(state){
  const b=$('#remote-sound');
  b.textContent=soundWanted?(state==='on'?'Sound on':'Sound…'):'Sound off';
  b.classList.toggle('on',soundWanted);
  $('#remote-vol').hidden=!soundWanted;
}
$('#remote-sound').onclick=()=>{
  click();
  if(!rmActive){toast('Connect to a PC first.','err');return}
  soundWanted=!soundWanted;
  if(soundWanted){
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    actx.resume().catch(()=>{});
    if(!gain){gain=actx.createGain();gain.connect(actx.destination)}
    gain.gain.value=+$('#remote-vol').value;
  }
  rmSend({t:'audio',on:soundWanted});nextT=0;
  renderSound();
};
$('#remote-vol').addEventListener('input',e=>{if(gain)gain.gain.value=+e.target.value});
function onAudio(buf){
  if(!soundWanted||!actx||buf.byteLength<16)return;
  const dv=new DataView(buf),rate=dv.getUint32(4,true),ch=dv.getUint16(8,true)||1;
  const pcm=new Int16Array(buf,12,(buf.byteLength-12)>>1),frames=Math.floor(pcm.length/ch);
  if(!frames||rate<3000||rate>192000)return;
  const ab=actx.createBuffer(ch,frames,rate);
  for(let c=0;c<ch;c++){const d=ab.getChannelData(c);for(let i=0;i<frames;i++)d[i]=pcm[i*ch+c]/32768}
  const src=actx.createBufferSource();src.buffer=ab;src.connect(gain);
  const now=actx.currentTime;
  // keep ~150 ms of cushion; if we fall behind or drift too far ahead, start over
  if(nextT<now+.03||nextT>now+.6)nextT=now+.15;
  src.start(nextT);nextT+=ab.duration;
}

/* ═══ hooks from app.js ═══ */
window.rmx={
  onBinary(buf){
    const b=new Uint8Array(buf,0,4);
    if(b[2]===0x41)return onAudio(buf);
    if(buf.byteLength<8)return;
    const t=xfers.get(new DataView(buf).getUint32(4,true));
    if(t&&t.dir==='down'&&t.state==='run')onChunk(t,buf.slice(8));
  },
  onJSON(m){
    const t=m.id!=null?xfers.get(m.id>>>0):null;
    switch(m.t){
      case 'fs.list':if(m.path===loadingPath||!m.error)renderList(m);break;
      case 'file.start':if(t){t.size=m.size;t.name=m.name||t.name;renderXfers()}break;
      case 'file.end':if(t&&t.state==='run')finishDownload(t);break;
      case 'file.err':if(t){fail(t,m.error||'Failed');toast(`${t.name}: ${m.error||'failed'}`,'err');t.finished?.()}break;
      case 'file.ack':if(t){t.acked=Math.max(t.acked,m.bytes||0);t.lastProgress=Date.now();t.wake?.();renderSoon()}break;
      case 'file.saved':
        if(t){t.acked=t.size;t.state='done';renderXfers();settle(t);t.finished?.();toast(`Saved to ${m.path}`,'ok')}
        if(t&&cwd&&t.target===cwd)go(cwd);
        break;
      case 'audio.state':
        if(m.error){soundWanted=false;toast(m.error,'err')}
        renderSound(m.on?'on':'');
        break;
    }
  },
  onUp(name){
    $('#rf-pc').textContent='on '+name;
    if(soundWanted)rmSend({t:'audio',on:true});
    if(!panel.hidden)go(cwd||'');
  },
  onDown(){
    for(const t of xfers.values())if(t.state==='run'){fail(t,'The PC disconnected');t.finished?.()}
    listing=null;cwd=null;nextT=0;
    if(!panel.hidden)listEl.innerHTML='<div class="rf-empty">Not connected.</div>';
    renderSound();
  }
};
renderSound();
})();
