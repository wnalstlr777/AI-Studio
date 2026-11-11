import { QAPoller, EventLedger, snapshot, messages, runUrl, classify, acceptNews } from './state.js';
import { showAsset } from './assets.js';
import { RemoteAssets, AssetStore } from './remote-assets.js';
import bundled from './bundled-web-manifest.js';
const $=s=>document.querySelector(s);
let saved={};try{saved=JSON.parse(localStorage.getItem('hina.web-events')||'{}');}catch{}
const ledger=new EventLedger(saved),save=()=>localStorage.setItem('hina.web-events',JSON.stringify(ledger.save()));
let state='IDLE',message='',newsTimer,alertRun=null,newsActive=false,preview=false;
const assets=new RemoteAssets({bundledManifest:bundled,store:new AssetStore('hina-web-assets-v1'),onChange:()=>display(state,message)});
function display(next,text='',restart=false){
 state=next;message=text;$('#hina-secretary').dataset.state=state;
 $('#hina-message').textContent=text;$('#hina-message').hidden=!text;
 const a=assets.getAsset(state);showAsset($('#hina-character'),a,()=>{$('#hina-asset').textContent='에셋 확인 실패 · 원본 표시';},{restart,onReady:()=>{if(next==='NEWS'&&restart&&state==='NEWS'){clearTimeout(newsTimer);newsTimer=setTimeout(finishNews,assets.getAsset('NEWS').durationMs||1600);}}});$('#hina-asset').textContent=a.label;
}
function idle(){clearTimeout(newsTimer);newsActive=false;alertRun=null;display('IDLE');}
function finishNews(){newsActive=false;if(!alertRun)display('IDLE');}
function news(){if(alertRun)return;clearTimeout(newsTimer);newsActive=true;newsTimer=setTimeout(finishNews,17000);display('NEWS',messages.NEWS,true);}
$('#hina-message').onclick=()=>{if(state==='NEWS'||state==='ALERT')idle();};
window.addEventListener('hina:news',e=>{if(acceptNews(ledger,e.detail)){save();news();}});
if(new URLSearchParams(location.search).get('hinaTest')==='1')window.hinaPreviewState=next=>{if(!['IDLE','ALERT','NEWS',null].includes(next))return;preview=!!next;if(next==='NEWS')news();else if(next)display(next,messages[next]||'');else idle();};
display('IDLE');
const poller=new QAPoller({storage:localStorage,
 onCached(_runs,{retryAt}){$('#run-result').textContent=`저장된 QA 결과 · ${new Date(retryAt).toLocaleTimeString()} 재조회 대기`;$('#hina-status').textContent='QA 저장된 결과 · 실시간 조회 대기';},
 onResult(runs){
  const wasReady=ledger.ready,fresh=ledger.accept(runs);save();const current=snapshot(runs);
  const description=current.run?`Sea QA: ${current.state} · ${current.run.conclusion||current.run.status}`:'아직 Sea QA 실행 기록이 없습니다.';
  $('#run-result').textContent=description;if(current.run){const a=document.createElement('a');a.href=runUrl(current.run);a.target='_blank';a.rel='noopener';a.textContent=' 상세 보기 ↗';$('#run-result').append(a);}
  $('#hina-status').textContent=description+' · 실제 에이전트 상태 미연결';
  if(!preview){
   const event=fresh[0];
   if(event&&classify(event)==='ALERT'){clearTimeout(newsTimer);newsActive=false;alertRun=event;display('ALERT',messages.ALERT);}
   else if(!wasReady&&current.state==='ALERT'){alertRun=current.run;display('ALERT',messages.ALERT);}
   else if(event&&classify(event)==='SUCCESS')news();
   else if(!alertRun&&!newsActive)display(current.state==='WORK'?'WORK':'IDLE',current.state==='WORK'?messages.WORK:'');
  }
  $('#check').disabled=false;
 },
 onError(error){
  if(!preview&&!alertRun&&!newsActive)display('CONNECTION_ERROR',messages.CONNECTION_ERROR);
  $('#hina-status').textContent='연결 오류 · QA 결과 미확인';$('#run-result').textContent=`QA 조회 실패 (${error.message}). 제한 해제 후 자동 재시도합니다.`;$('#check').disabled=false;
 }
});
$('#check').onclick=()=>poller.poll();
document.addEventListener('visibilitychange',()=>{if(document.hidden)poller.stop();else poller.start();});
window.addEventListener('pagehide',event=>{poller.stop();if(!event.persisted)assets.stop();});
window.addEventListener('pageshow',()=>{if(poller.stopped&&!document.hidden)poller.start();});
poller.start();assets.start();
