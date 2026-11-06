import { bindPetInput } from './input.js';
import { QAPoller, EventLedger, snapshot, classify, messages, runUrl } from './shared/hina/state.js';
import { assetFor } from './shared/hina/assets.js';
const $ = s => document.querySelector(s);
const native = window.__TAURI__;
const invoke = (name,args={}) => native ? native.core.invoke(name,args) : Promise.resolve(name==='move_pet'?direction:false);
const win = native?.window.getCurrentWindow();
function read(key,fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
let prefs = { top:true,roam:true,notifications:true,size:200,...read('hina.settings',{}) };
prefs.size=Math.min(240,Math.max(140,Number(prefs.size)||200));
let ledger = new EventLedger(read('hina.events',{}));
let latest = { state:'IDLE',run:null }, state='IDLE', direction=1, alertRun=null, flashUntil=0, pausedUntil=0, connected=false;
let movementTimer, behaviorTimer, bubbleTimer, maskTimer, moving=false, interacting=false;
let maskBusy=false, maskDirty=false;
let roaming='IDLE';
let greetingTimer, greetingEndTimer, greetingActive=false;
const greetingSrc=new URL('./shared/hina/assets/greeting.gif',import.meta.url).href;
function scheduleGreeting(){
  clearTimeout(greetingTimer);
  greetingTimer=setTimeout(()=>{
    if(state==='IDLE' && !interacting && $('#settings').hidden){
      greetingActive=true;
      document.body.classList.remove('idle-breath');
      $('#character').src=greetingSrc;
      clearTimeout(greetingEndTimer);
      greetingEndTimer=setTimeout(()=>{greetingActive=false;render(state,true);},1680);
    }
    scheduleGreeting();
  },22000+Math.random()*18000);
}
function showBubble(text,timeout=0) {
  clearTimeout(bubbleTimer); $('#bubble').textContent=text; $('#bubble').hidden=!text;
  updateMask();
  if(timeout) bubbleTimer=setTimeout(()=>showBubble(''),timeout);
}
function render(next,force=false) {
  if(state!==next || force || !$('#character').src) {
    if(next!=='IDLE'){greetingActive=false;clearTimeout(greetingEndTimer);}

    state=next; const asset=assetFor(state); if($('#character').src!==asset.src)$('#character').src=asset.src; $('#asset-status').textContent=asset.label;
    document.body.dataset.state=state;
    startMovement();
  }
  document.body.classList.toggle('idle-breath',state==='IDLE' && !greetingActive);
  $('#character').style.transform=direction===-1?'scaleX(-1)':'';
}
function baseState() { return latest.state==='WORK' && connected ? 'WORK' : roaming; }
function settle() {
  if(!connected) return;
  if(alertRun) { render('ALERT'); return; }
  if(Date.now()<flashUntil) { render('SUCCESS'); return; }
  render(baseState());
}
function startMovement() {
  clearInterval(movementTimer);
  if(!native || !prefs.roam || roaming!=='WALK' || state!=='WALK') return;
  movementTimer=setInterval(async()=>{
    if(moving || interacting || state!=='WALK' || !$('#settings').hidden || Date.now()<pausedUntil) return;
    moving=true;
    try { const before=direction;direction=await invoke('move_pet',{dx:direction*2,bottom:true}); $('#character').style.transform=direction===-1?'scaleX(-1)':'';if(before!==direction)updateMask(); }
    catch(error) { settingsError(error); }
    finally { moving=false; }
  },120);
}
function behavior() {
  roaming=prefs.roam?['IDLE','WALK','REST'][Math.floor(Math.random()*3)]:'IDLE';
  settle(); startMovement();
  behaviorTimer=setTimeout(behavior,15000+Math.random()*15000);
}
function settingsError(e) { $('#settings-error').textContent=String(e); }
async function updateMask() {
  if(!native)return;
  maskDirty=true;if(maskBusy)return;
  maskBusy=true;
  try{while(maskDirty){maskDirty=false;await sendMask();}}
  catch(error){settingsError(error);}
  finally{maskBusy=false;}
}
async function sendMask() {
  const width=160,height=210, canvas=document.createElement('canvas'); canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.scale(width/innerWidth,height/innerHeight);
  const image=$('#character'); const r=image.getBoundingClientRect();
  if(image.complete && image.naturalWidth) {
    const ratio=Math.min(r.width/image.naturalWidth,r.height/image.naturalHeight);
    const w=image.naturalWidth*ratio,h=image.naturalHeight*ratio;
    ctx.save(); if(direction<0) { ctx.translate(r.x+r.width,r.y);ctx.scale(-1,1);ctx.drawImage(image,(r.width-w)/2,(r.height-h)/2,w,h); }
    else ctx.drawImage(image,r.x+(r.width-w)/2,r.y+(r.height-h)/2,w,h);ctx.restore();
  }
  for(const el of [$('#asset-status'),$('#bubble'),$('#settings')]) {
    if(el.hidden || !el.offsetWidth) continue; const b=el.getBoundingClientRect(); ctx.fillStyle='#fff';ctx.fillRect(b.x,b.y,b.width,b.height);
  }
  const rgba=ctx.getImageData(0,0,width,height).data;
  const pixels=Array.from({length:width*height},(_,i)=>rgba[i*4+3]>24?1:0);
  try { await invoke('hit_map',{pixels,width,height}); } catch(e) { settingsError(e); }
}
$('#character').onload=()=>{ updateMask(); clearInterval(maskTimer); if(assetFor(state).animated) maskTimer=setInterval(updateMask,250); };
bindPetInput($('#pet'), {
  onClick:()=>invoke('open_office'),
  onDrag:()=>invoke('drag_pet'),
  onActivity(active){interacting=active;pausedUntil=Date.now()+5000;},
  onError:settingsError,
});
$('#bubble').onclick=async()=>{
  const url=runUrl(alertRun||latest.run);if(url)try { await invoke('open_run',{url}); }catch(e){settingsError(e);}
  alertRun=null;flashUntil=0;showBubble('');settle();
};
function openSettings(){ $('#settings').hidden=false;pausedUntil=Date.now()+5000;updateMask(); }
document.oncontextmenu=e=>{e.preventDefault();openSettings();};
$('#close-settings').onclick=()=>{$('#settings').hidden=true;updateMask();};
$('#exit').onclick=()=>invoke('quit');
for(const id of ['top','roam','notifications','size']) {
  const el=$('#'+id);if(id==='size')el.value=prefs[id];else el.checked=prefs[id];
  el.onchange=async()=>{
    const old=prefs[id];prefs[id]=id==='size'?Number(el.value):el.checked;
    try {
      if(id==='top')await win?.setAlwaysOnTop(prefs.top);
      if(id==='size')applySize();
      localStorage.setItem('hina.settings',JSON.stringify(prefs));
      if(id==='roam'){roaming='IDLE';settle();startMovement();}
    } catch(e){prefs[id]=old;if(id!=='size')el.checked=old;settingsError(e);}
  };
}
function applySize(){ $('#pet').style.width=prefs.size+'px';$('#pet').style.height=(prefs.size+56)+'px';$('#bubble').style.bottom=(prefs.size+66)+'px';updateMask(); }
$('#autostart').onchange=async e=>{try {e.target.checked=await invoke('autostart',{enabled:e.target.checked});}catch(error){e.target.checked=!e.target.checked;settingsError(error);}};
const poller=new QAPoller({
  async onResult(runs){
    const fresh=ledger.accept(runs);localStorage.setItem('hina.events',JSON.stringify(ledger.save()));
    connected=true;latest=snapshot(runs);
    const event=fresh[0];
    if(event){
      const next=classify(event);
      if(next==='ALERT')alertRun=event;
      else if(!alertRun){flashUntil=Date.now()+5000;setTimeout(()=>{if(!alertRun){settle();showBubble('');}},5100);}
      if(next==='ALERT'||!alertRun)showBubble(messages[next],next==='SUCCESS'?5000:0);
      const url=runUrl(event);
      if(prefs.notifications && url && (next==='ALERT'||!alertRun))try {await invoke('notify',{url,failure:next==='ALERT'});}catch(e){settingsError(e);}
    } else if(alertRun) showBubble(messages.ALERT);
    else if(latest.state==='WORK') showBubble(messages.WORK);
    else if(Date.now()>=flashUntil) showBubble('');
    settle();
  },
  onError(){connected=false;render('CONNECTION_ERROR');showBubble(messages.CONNECTION_ERROR+'\nQA 결과 미확인 · 자동 재시도');}
});
async function init(){
  applySize();render('IDLE');
  if(native){
    await native.event.listen('settings',openSettings);
    await win.setAlwaysOnTop(prefs.top);await invoke('move_pet',{dx:0,bottom:true});await updateMask();await win.show();
    try{$('#autostart').checked=await invoke('autostart');}catch(e){settingsError(e);}
  } else settingsError('브라우저 미리보기: 이동·트레이·자동 실행·앱 알림은 Windows 앱에서 사용');
  behavior();scheduleGreeting();poller.start();
}
window.addEventListener('beforeunload',()=>{poller.stop();clearInterval(movementTimer);clearInterval(maskTimer);clearTimeout(behaviorTimer);clearTimeout(bubbleTimer);clearTimeout(greetingTimer);clearTimeout(greetingEndTimer);});
init().catch(e=>{settingsError(e);openSettings();win?.show();});
