import { QAPoller, snapshot, messages, runUrl, runKey } from './state.js';
import { assetFor } from './assets.js';
const $=s=>document.querySelector(s);
let shownSuccess=null, successTimer;
function display(state,message='') {
  $('#hina-secretary').dataset.state=state;
  $('#hina-message').textContent=message;$('#hina-message').hidden=!message;
  const asset=assetFor(state);$('#hina-character').src=asset.src;$('#hina-asset').textContent=asset.label;
}
display('IDLE');
const poller=new QAPoller({storage:localStorage,
  onCached(_runs,{retryAt}){$('#run-result').textContent=`저장된 QA 결과 · ${new Date(retryAt).toLocaleTimeString()} 재조회 대기`;$('#hina-status').textContent='QA 저장된 결과 · 실시간 조회 대기';},
  onResult(runs) {
    const {state,run}=snapshot(runs);clearTimeout(successTimer);
    const description=run?`Sea QA: ${state} · ${run.conclusion||run.status}`:'아직 Sea QA 실행 기록이 없습니다.';
    $('#run-result').textContent=description;
    if(run){ const link=document.createElement('a');link.href=runUrl(run);link.target='_blank';link.rel='noopener';link.textContent=' 상세 보기 ↗';$('#run-result').append(link); }
    $('#hina-status').textContent=description+' · 실제 에이전트 상태 미연결';
    if(state==='SUCCESS') {
      if(shownSuccess!==runKey(run)){shownSuccess=runKey(run);display(state,messages[state]);successTimer=setTimeout(()=>display('IDLE'),5000);}
      else display('IDLE');
    }else display(state,messages[state]);
    $('#check').disabled=false;
  },
  onError(error){
    clearTimeout(successTimer);display('CONNECTION_ERROR',messages.CONNECTION_ERROR);
    $('#hina-status').textContent='연결 오류 · QA 결과 미확인';
    $('#run-result').textContent=`QA 조회 실패 (${error.message}). 자동 재시도하거나 Actions에서 확인해 주세요.`;
    $('#check').disabled=false;
  }
});
$('#check').onclick=()=>poller.poll();
document.addEventListener('visibilitychange',()=>{if(document.hidden)poller.stop();else poller.start();});
window.addEventListener('pagehide',()=>poller.stop());
window.addEventListener('pageshow',()=>{if(poller.stopped&&!document.hidden)poller.start();});
poller.start();
