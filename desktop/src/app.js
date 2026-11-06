import { bindPetInput } from './input.js';
import { QAPoller, EventLedger, snapshot, classify, messages, runUrl } from './shared/hina/state.js';
import { IdlePlayer } from './shared/hina/idle-player.js';
import { MotionView } from './shared/hina/motion-view.js';
import { IDLE_MANIFEST_URL } from './shared/hina/remote-assets-policy.js';
import { RemoteAssets, AssetStore } from './shared/hina/remote-assets.js';
import bundledManifest from './shared/hina/bundled-manifest.js';
const $ = s => document.querySelector(s);
const native = window.__TAURI__;
const invoke = (name,args={}) => native ? native.core.invoke(name,args) : Promise.resolve(name==='move_pet'?direction:false);
const win = native?.window.getCurrentWindow();
const remoteAssets=new RemoteAssets({bundledManifest,manifestURL:IDLE_MANIFEST_URL,store:new AssetStore("hina-animation-cache-v2"),
  onChange(){greetingActive=false;clearTimeout(greetingEndTimer);idlePlayer.reset();render(state,true);scheduleGreeting();},
  onStatus(info){const el=$('#asset-update-status');el.dataset.kind=info.kind;el.dataset.version=info.version||'';el.dataset.source=info.source;el.textContent=info.kind==='error'?`에셋 ${info.version||'기본'} · 확인 실패, 현재 에셋 유지`:`에셋 ${info.version||'기본'} · ${info.source==='bundled'?'앱 내장':'정상 캐시/원격'}`;},
});
const displayAsset=state=>remoteAssets.getAsset(state);
function read(key,fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
let prefs = { top:true,roam:true,notifications:true,size:200,...read('hina.settings',{}) };
prefs.size=Math.min(240,Math.max(140,Number(prefs.size)||200));
let ledger = new EventLedger(read('hina.events',{}));
let latest = { state:'IDLE',run:null }, state='IDLE', direction=1, alertRun=null, flashUntil=0, pausedUntil=0, connected=false;
let movementTimer, behaviorTimer, bubbleTimer, maskTimer, moving=false, interacting=false;
let maskBusy=false, maskDirty=false;
let roaming='IDLE';
let greetingTimer, greetingEndTimer, greetingActive=false, greetingSequence=0, activeGreetingSrc='';
let idleMotionTimer;
const motionLabels={IDLE_NORMAL:'기본 대기',IDLE_HAPPY:'행복',IDLE_THINK:'생각',IDLE_SURPRISE:'놀람',IDLE_GREETING:'인사',IDLE_EXPLAIN:'설명',IDLE_NOTE:'메모',IDLE_CHEER:'기쁨'};
const idlePlayer=new IdlePlayer({getMotion:(id,options)=>remoteAssets.getMotion(id,options),onChange:()=>render(state,true)});
let lastAnimationMask=0;
const motionView=new MotionView($('#character'),$('#motion-canvas'),{onFrame:()=>{if(performance.now()-lastAnimationMask>=200){lastAnimationMask=performance.now();updateMask();}},onReady:()=>idlePlayer.loaded(),onEnded:()=>idlePlayer.ended(),onError:error=>{idlePlayer.loaded();settingsError(error);}});
let compareOriginal=false;
function scheduleIdleMotion(){clearInterval(idleMotionTimer);idleMotionTimer=setInterval(()=>{if(!interacting&&!greetingActive)idlePlayer.tick();},100);}
function motionInfo(){
  const entry=remoteAssets.getMotion($('#idle-motion').value,{review:true});
  $('#motion-info').textContent=state!=='IDLE'?`${state} 우선 · Idle 검수는 대기 복귀 후 가능`:entry?`${entry.frames}프레임 · ${(entry.durationMs/1000).toFixed(1)}초 · ${entry.width}×${entry.height} · 발 ${entry.footY}px · ${entry.complete?'승인됨':'시안 / 복원부 검수 필요'}`:'등록되지 않은 모션';
  $('#motion-pause').textContent=idlePlayer.paused?'재생':'일시정지';
  if(idlePlayer.asset())$('#idle-motion').value=idlePlayer.id;
}
const greetingSrc=new URL('./shared/hina/assets/greeting.gif',import.meta.url).href;
function playGreeting(manual=false){
  if(state!=='IDLE' || (!manual&&(idlePlayer.mode!=='auto'||!displayAsset('IDLE').localIdleStyle)) || interacting || (!manual&&!$('#settings').hidden) || greetingActive)return false;
  greetingActive=true;
  // Each greeting gets a fresh URL so WebView restarts frame 1 instead of retaining the last GIF frame.
  activeGreetingSrc=greetingSrc+'?play='+ ++greetingSequence;
  clearTimeout(greetingEndTimer);
  render('IDLE',true);
  greetingEndTimer=setTimeout(()=>{greetingActive=false;activeGreetingSrc='';render('IDLE',true);},1680);
  return true;
}
function scheduleGreeting(){
  clearTimeout(greetingTimer);
  greetingTimer=setTimeout(()=>{
    playGreeting();
    scheduleGreeting();
  },12000+Math.random()*8000);
}
function showBubble(text,timeout=0) {
  clearTimeout(bubbleTimer); $('#bubble').textContent=text; $('#bubble').hidden=!text;
  updateMask();
  if(timeout) bubbleTimer=setTimeout(()=>showBubble(''),timeout);
}
function render(next,force=false) {
  const changed=state!==next;state=next;idlePlayer.setState(next);
  if(next!=='IDLE'){greetingActive=false;activeGreetingSrc='';clearTimeout(greetingEndTimer);compareOriginal=false;$('#compare-original').checked=false;}
  const motion=next==='IDLE'&&!compareOriginal&&!greetingActive?idlePlayer.asset():null;
  const asset=compareOriginal?{...displayAsset('IDLE'),src:new URL('./shared/hina/assets/secretary.png',import.meta.url).href,localIdleStyle:false,label:'원본 비교'}:motion||displayAsset(next);
  const src=greetingActive&&next==='IDLE'?activeGreetingSrc:asset.src;
  if(!motion){motionView.close();if($('#character').src!==src)$('#character').src=src;}
  else {const key=`${motion.src}:${idlePlayer.sequence}`;if(motionView.key!==key)idlePlayer.loading();motionView.show({...motion,loop:idlePlayer.mode==='loop'||motion.loop},key);motionView.pause(idlePlayer.paused);}
  $('#asset-status').textContent=asset.label;
  document.body.dataset.state=state;document.body.dataset.idleMotion=motion?.id||'';
  if(changed||force){startMovement();refreshMaskTimer();}
  document.body.classList.toggle('idle-breath',state==='IDLE'&&!!asset.localIdleStyle&&!greetingActive&&!motion&&!compareOriginal);
  for(const image of [$('#character'),$('#motion-canvas')])image.style.transform=direction===-1?'scaleX(-1)':'';
  motionInfo();
}

function baseState() { return latest.state==='WORK' && connected ? 'WORK' : roaming; }
function settle() {
  if(alertRun) { render('ALERT'); return; }
  if(!connected){render('CONNECTION_ERROR');return;}
  if(Date.now()<flashUntil) { render('SUCCESS'); return; }
  render(baseState());
}
function startMovement() {
  clearInterval(movementTimer);
  if(!native || !prefs.roam || roaming!=='WALK' || state!=='WALK') return;
  movementTimer=setInterval(async()=>{
    if(moving || interacting || state!=='WALK' || !$('#settings').hidden || Date.now()<pausedUntil) return;
    moving=true;
    try { const before=direction;direction=await invoke('move_pet',{dx:direction*2,bottom:true}); for(const image of [$('#character'),$('#motion-canvas')])image.style.transform=direction===-1?'scaleX(-1)':'';if(before!==direction)updateMask(); }
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
  const image=$('#motion-canvas').hidden?$('#character'):$('#motion-canvas'); const r=image.getBoundingClientRect();
  const naturalWidth=image.naturalWidth||image.width,naturalHeight=image.naturalHeight||image.height;
  if((image.complete||image.tagName==='CANVAS') && naturalWidth) {
    const ratio=Math.min(r.width/naturalWidth,r.height/naturalHeight);
    const w=naturalWidth*ratio,h=naturalHeight*ratio;
    ctx.save(); if(direction<0) { ctx.translate(r.x+r.width,r.y);ctx.scale(-1,1);ctx.drawImage(image,(r.width-w)/2,(r.height-h)/2,w,h); }
    else ctx.drawImage(image,r.x+(r.width-w)/2,r.y+(r.height-h)/2,w,h);ctx.restore();
  }
  for(const el of [$('#asset-status'),$('#bubble'),$('#settings'),$('#inspection-bar')]) {
    if(el.hidden || !el.offsetWidth) continue; const b=el.getBoundingClientRect(); ctx.fillStyle='#fff';ctx.fillRect(b.x,b.y,b.width,b.height);
  }
  const rgba=ctx.getImageData(0,0,width,height).data;
  const pixels=Array.from({length:width*height},(_,i)=>rgba[i*4+3]>24?1:0);
  try { await invoke('hit_map',{pixels,width,height}); } catch(e) { settingsError(e); }
}
function refreshMaskTimer(){clearInterval(maskTimer);if(displayAsset(state).animated||greetingActive||!!idlePlayer.asset())maskTimer=setInterval(updateMask,250);}
$('#character').onload=()=>{updateMask();refreshMaskTimer();};
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
$('#idle-motion').onchange=e=>{greetingActive=false;clearTimeout(greetingEndTimer);idlePlayer.select(e.target.value,{loop:$('#motion-loop').checked});motionInfo();};
$('#motion-loop').onchange=()=>{if(state==='IDLE')idlePlayer.select($('#idle-motion').value,{loop:$('#motion-loop').checked});};
$('#motion-pause').onclick=()=>{idlePlayer.togglePause();};
$('#motion-reset').onclick=()=>{compareOriginal=false;$('#compare-original').checked=false;idlePlayer.reset();};
$('#motion-random').onclick=()=>{idlePlayer.reset({reviewRandom:true});};
$('#compare-original').onchange=e=>{compareOriginal=e.target.checked;if(compareOriginal&&!idlePlayer.paused)idlePlayer.togglePause();render(state,true);};
$('#motion-guides').onchange=e=>{document.body.classList.toggle('motion-guides',e.target.checked);};
$('#legacy-greeting').onclick=()=>{idlePlayer.reset();playGreeting(true);};
$('#motion-inspect').onclick=()=>{document.body.classList.add('motion-inspect');$('#settings').hidden=true;$('#inspection-bar').hidden=false;updateMask();};
$('#end-inspection').onclick=()=>{document.body.classList.remove('motion-inspect');$('#inspection-bar').hidden=true;openSettings();};
$('#inspect-pause').onclick=()=>idlePlayer.togglePause();
$('#inspect-next').onclick=()=>{const ids=Object.keys(motionLabels),index=ids.indexOf(idlePlayer.id);idlePlayer.select(ids[(index+1)%ids.length],{loop:$('#motion-loop').checked});};
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
    connected=true;$('#qa-connection').textContent='QA 연결 정상 · '+new Date().toLocaleTimeString();latest=snapshot(runs);
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
  onError(error){connected=false;$('#qa-connection').textContent=`QA 연결: ${error.message} · ${new Date(error.retryAt||Date.now()+120000).toLocaleTimeString()} 재시도`;if(!alertRun){render('CONNECTION_ERROR');showBubble(messages.CONNECTION_ERROR+'\nQA 결과 미확인 · 자동 재시도');}}
});
async function init(){
  applySize();render('IDLE');
  if(native){
    await native.event.listen('settings',openSettings);
    await win.setAlwaysOnTop(prefs.top);await invoke('move_pet',{dx:0,bottom:true});await updateMask();await win.show();
    try{$('#autostart').checked=await invoke('autostart');}catch(e){settingsError(e);}
  } else settingsError('브라우저 미리보기: 이동·트레이·자동 실행·앱 알림은 Windows 앱에서 사용');
  behavior();scheduleGreeting();scheduleIdleMotion();poller.start();remoteAssets.start();
}
window.addEventListener('beforeunload',()=>{remoteAssets.stop();poller.stop();clearInterval(movementTimer);clearInterval(maskTimer);clearTimeout(behaviorTimer);clearTimeout(bubbleTimer);clearTimeout(greetingTimer);clearTimeout(greetingEndTimer);clearInterval(idleMotionTimer);motionView.close();});
init().catch(e=>{settingsError(e);openSettings();win?.show();});
