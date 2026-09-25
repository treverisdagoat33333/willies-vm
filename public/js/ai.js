/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════
   AI
   A chat window over /api/ai (ai.js on the server, which holds the API key).
   Replies stream in as JSON lines and are drawn as simple, escaped Markdown.
   Chats are kept in this browser only (localStorage "ai.chats", not synced;
   nothing kept in incognito). Uses app.js helpers ($, $$, esc, toast, store,
   put, click, typing, onCloseDone, openBrowser, closeAllPanels, closeChat).
   ═══════════════════════════════════════════════════════════ */
(()=>{
const W=$('#ai-window'),LOG=$('#ai-log'),SCROLL=$('#ai-scroll'),INPUT=$('#ai-input'),MODEL=$('#ai-model');
const MAX_CHATS=50,MAX_INPUT=8000;
const SUGGEST=['Explain photosynthesis like I\'m 12','Help me write a short story about a dragon','Fix this code: for i in range(10) print(i)','Give me 5 fun facts about space'];

let chats=loadChats(),cur=null,status=null,busy=null,opened=false,paintQueued=false;
function loadChats(){const c=store('ai.chats',[]);return Array.isArray(c)?c.filter(x=>x&&typeof x.id==='string'&&Array.isArray(x.messages)):[]}
function saveChats(){if(!S.incognito)put('ai.chats',chats.slice(0,MAX_CHATS))}
const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ═══ Markdown, escaped first: code blocks, inline code, bold, italics, links, lists, headings ═══ */
function inline(s){
  s=esc(s);
  const codes=[];
  s=s.replace(/`([^`\n]+)`/g,(_,c)=>{codes.push(c);return `\u0000${codes.length-1}\u0000`});
  s=s.replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g,'$1<i>$2</i>');
  s=s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,t,u)=>`<a href="${u}" data-ai-link>${t}</a>`);
  return s.replace(/\u0000(\d+)\u0000/g,(_,i)=>`<code>${codes[i]}</code>`);
}
function blocks(text){
  const out=[];let list=null,para=[];
  const endList=()=>{if(list){out.push(`<${list.t}>${list.items.map(i=>`<li>${inline(i)}</li>`).join('')}</${list.t}>`);list=null}};
  const endPara=()=>{if(para.length){out.push(`<p>${para.map(inline).join('<br>')}</p>`);para=[]}};
  for(const line of text.split('\n')){
    let m;
    if(!line.trim()){endPara();endList();continue}
    if((m=line.match(/^(#{1,4})\s+(.*)/))){endPara();endList();const h=Math.min(6,m[1].length+2);out.push(`<h${h}>${inline(m[2])}</h${h}>`);continue}
    if((m=line.match(/^\s*[-*•]\s+(.*)/))){endPara();if(list?.t!=='ul'){endList();list={t:'ul',items:[]}}list.items.push(m[1]);continue}
    if((m=line.match(/^\s*\d+[.)]\s+(.*)/))){endPara();if(list?.t!=='ol'){endList();list={t:'ol',items:[]}}list.items.push(m[1]);continue}
    if((m=line.match(/^>\s?(.*)/))){endPara();endList();out.push(`<blockquote>${inline(m[1])}</blockquote>`);continue}
    endList();para.push(line);
  }
  endPara();endList();
  return out.join('');
}
function md(text){
  // odd parts are inside ``` fences; an unclosed fence (still streaming) shows as code too
  return String(text).split('```').map((part,i)=>{
    if(!(i%2))return blocks(part);
    const nl=part.indexOf('\n'),lang=nl>=0?part.slice(0,nl).trim():'',code=(nl>=0?part.slice(nl+1):part).replace(/\n$/,'');
    return `<div class="ai-code"><div class="ai-code-top"><span>${esc(lang||'code')}</span><button type="button" class="ai-copy">Copy</button></div><pre><code>${esc(code)}</code></pre></div>`;
  }).join('');
}

/* ═══ drawing ═══ */
const ICON_DEL='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
function renderChats(){
  const box=$('#ai-chats');
  if(!chats.length){box.innerHTML='<p class="ai-none">Your chats show up here.</p>';return}
  box.innerHTML=chats.map(c=>`<div class="ai-chat${c===cur?' active':''}" data-id="${esc(c.id)}"><button type="button" class="ai-open"><span></span></button><button type="button" class="ai-del" title="Delete chat" aria-label="Delete chat">${ICON_DEL}</button></div>`).join('');
  $$('.ai-chat',box).forEach((el,i)=>{el.querySelector('span').textContent=chats[i].title||'New chat'});
}
function bubble(m){
  const d=document.createElement('div');d.className='ai-msg '+(m.role==='user'?'me':'bot');
  if(m.role==='user')d.textContent=m.content;
  else{
    d.innerHTML=m.content?md(m.content):'<span class="ai-dots"><i></i><i></i><i></i></span>';
    if(m.error){const e=document.createElement('div');e.className='ai-err';e.innerHTML='<span></span><button type="button" class="btn sm ai-retry">Try again</button>';e.firstChild.textContent=m.error;d.appendChild(e)}
  }
  return d;
}
function renderLog(){
  LOG.replaceChildren();
  if(status&&!status.ready){LOG.innerHTML=`<div class="ai-empty"><div class="ic c9">${$('#ai-window .ai-brand .ic').innerHTML}</div><h2>The AI isn't set up yet</h2><p>${esc(status.why||'The owner needs to add an API key on the server.')}</p></div>`;return}
  if(!cur||!cur.messages.length){
    LOG.innerHTML=`<div class="ai-empty"><div class="ic c9">${$('#ai-window .ai-brand .ic').innerHTML}</div><h2>What can I help with?</h2><div class="ai-sugs">${SUGGEST.map(s=>`<button type="button" class="ai-sug">${esc(s)}</button>`).join('')}</div></div>`;
    return;
  }
  for(const m of cur.messages)LOG.appendChild(bubble(m));
  SCROLL.scrollTop=SCROLL.scrollHeight;
}
function render(){renderChats();renderLog()}
/* while a reply streams, only its bubble is redrawn, once a frame */
function paintLast(){
  if(paintQueued)return;paintQueued=true;
  requestAnimationFrame(()=>{
    paintQueued=false;
    const last=LOG.lastElementChild,m=cur?.messages[cur.messages.length-1];
    if(!last||!m||m.role!=='assistant')return;
    const stick=SCROLL.scrollHeight-SCROLL.scrollTop-SCROLL.clientHeight<80;
    last.replaceWith(bubble(m));
    if(stick)SCROLL.scrollTop=SCROLL.scrollHeight;
  });
}
function setBusy(on){
  W.classList.toggle('busy',on);
  $('#ai-send').setAttribute('aria-label',on?'Stop':'Send');$('#ai-send').title=on?'Stop':'Send (Enter)';
}
function fillModels(){
  const saved=store('ai.model',''),list=status?.models||[];
  MODEL.innerHTML=list.map(m=>`<option>${esc(m)}</option>`).join('');
  MODEL.value=list.includes(saved)?saved:status?.model||list[0]||'';
  MODEL.hidden=list.length<2;
}

/* ═══ talking to the server ═══ */
async function loadStatus(){
  try{
    const r=await fetch('/api/ai/status',{cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    status=r.ok?d:{ready:false,why:d.error||`HTTP ${r.status}`};
  }catch(_){status={ready:false,why:'Couldn\'t reach the server.'}}
  fillModels();renderLog();
}
async function send(text){
  text=String(text||'').trim().slice(0,MAX_INPUT);
  if(busy||!text)return;
  if(!status)await loadStatus();
  if(!status.ready){toast(status.why||'The AI isn\'t set up yet','err');return}
  if(!cur){cur={id:rid(),title:text.replace(/\s+/g,' ').slice(0,48),at:Date.now(),messages:[]};chats.unshift(cur)}
  cur.messages=cur.messages.filter(m=>m.content); // failed, empty replies aren't sent again
  cur.messages.push({role:'user',content:text});
  const reply={role:'assistant',content:''};cur.messages.push(reply);
  cur.at=Date.now();chats=[cur,...chats.filter(c=>c!==cur)];
  saveChats();render();
  const ctl=new AbortController();busy=ctl;setBusy(true);
  try{
    const r=await fetch('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:MODEL.value,messages:cur.messages.slice(0,-1).map(({role,content})=>({role,content}))}),signal:ctl.signal});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||`HTTP ${r.status}`)}
    const reader=r.body.getReader(),dec=new TextDecoder();let buf='';
    for(;;){
      const{value,done}=await reader.read();if(done)break;
      buf+=dec.decode(value,{stream:true});
      let nl;
      while((nl=buf.indexOf('\n'))>=0){
        const line=buf.slice(0,nl).trim();buf=buf.slice(nl+1);if(!line)continue;
        const m=JSON.parse(line);
        if(m.t==='text'){reply.content+=m.v;paintLast()}
        else if(m.t==='error')throw new Error(m.error);
      }
    }
    if(!reply.content)reply.error='The AI sent back an empty answer.';
  }catch(e){
    if(!ctl.signal.aborted)reply.error=String(e?.message||e);
    else if(!reply.content)reply.error='Stopped.';
  }finally{
    busy=null;setBusy(false);cur.at=Date.now();saveChats();render();
  }
}
function stop(){busy?.abort()}

/* ═══ controls ═══ */
function autosize(){INPUT.style.height='auto';INPUT.style.height=Math.min(INPUT.scrollHeight,200)+'px'}
$('#ai-form').addEventListener('submit',e=>{
  e.preventDefault();
  if(busy){stop();return}
  const text=INPUT.value;if(!text.trim())return;
  INPUT.value='';autosize();send(text);
});
INPUT.addEventListener('input',autosize);
INPUT.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#ai-form').requestSubmit()}});
MODEL.addEventListener('change',()=>put('ai.model',MODEL.value));
$('#ai-new').onclick=()=>{click();if(busy)stop();cur=null;W.classList.remove('side-open');render();INPUT.focus()};
$('#ai-side-btn').onclick=()=>{click();W.classList.toggle('side-open')};
$('#ai-close').onclick=()=>{click();hide()};
$('#ai-chats').addEventListener('click',e=>{
  const row=e.target.closest('.ai-chat');if(!row)return;
  const c=chats.find(x=>x.id===row.dataset.id);if(!c)return;
  click();
  if(e.target.closest('.ai-del')){
    if(c===cur){if(busy)stop();cur=null}
    chats=chats.filter(x=>x!==c);saveChats();render();return;
  }
  if(busy&&c!==cur)stop();
  cur=c;W.classList.remove('side-open');render();
});
LOG.addEventListener('click',e=>{
  const sug=e.target.closest('.ai-sug');if(sug){click();send(sug.textContent);return}
  const copy=e.target.closest('.ai-copy');
  if(copy){const code=copy.closest('.ai-code').querySelector('code').textContent;navigator.clipboard?.writeText(code).then(()=>{copy.textContent='Copied';setTimeout(()=>{copy.textContent='Copy'},1500)},()=>toast('Copy failed','err'));return}
  if(e.target.closest('.ai-retry')&&cur&&!busy){
    const last=[...cur.messages].reverse().find(m=>m.role==='user');
    if(!last)return;
    cur.messages=cur.messages.slice(0,cur.messages.lastIndexOf(last));
    send(last.content);return;
  }
  const a=e.target.closest('a[data-ai-link]');if(a){e.preventDefault();openBrowser(a.href)}
});
document.addEventListener('keydown',e=>{if(W.classList.contains('show')&&e.key==='Escape'&&!typing())hide()});

/* ═══ window ═══ */
function open(){
  W.classList.remove('closing');W.classList.add('show');
  $('#tb-ai').classList.add('active');
  closeAllPanels();
  if($('#chat-window').classList.contains('show'))closeChat();
  if(!opened){opened=true;render();loadStatus()}
  setTimeout(()=>INPUT.focus(),50);
}
function hide(){
  if(!W.classList.contains('show'))return;
  W.classList.add('closing');
  onCloseDone(W,()=>W.classList.remove('show','closing'));
  $('#tb-ai').classList.remove('active');
}
function toggle(){W.classList.contains('show')&&!W.classList.contains('closing')?hide():open()}
/* another full-screen app opening covers this one: step aside */
const OTHERS=['#chat-window','#browser-wrap','#vm-wrap','#cloud-wrap','#remote-wrap','#music-window'].map(s=>$(s)).filter(Boolean);
const shown=el=>getComputedStyle(el).display!=='none'&&!el.classList.contains('closing');
const wasShown=new Map(OTHERS.map(el=>[el,shown(el)]));
const watch=new MutationObserver(()=>{
  for(const el of OTHERS){const now=shown(el);if(now&&!wasShown.get(el)&&W.classList.contains('show'))hide();wasShown.set(el,now)}
});
OTHERS.forEach(el=>watch.observe(el,{attributes:true,attributeFilter:['class','style']}));

window.ai={open,hide,toggle,send,stop};
})();
