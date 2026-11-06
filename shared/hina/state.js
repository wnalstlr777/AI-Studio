export const REPOSITORY = 'wnalstlr777/AI-Studio';
export const RUNS_API = `https://api.github.com/repos/${REPOSITORY}/actions/workflows/sea-qa.yml/runs?per_page=30&branch=main`;
export const messages = { IDLE: '', WALK: '', REST: '', WORK: '검수 중이에요!', SUCCESS: '사장님! 검수 통과예요!', ALERT: '사장님! 문제가 생겼어요!', CONNECTION_ERROR: '상태를 확인할 수 없어요.' };
export function runKey(run) { return `${run.id}:${run.run_attempt || 1}:${run.conclusion || run.status}`; }
export function runUrl(run) {
  const url = String(run?.html_url || '');
  return /^https:\/\/github\.com\/wnalstlr777\/AI-Studio\/actions\/runs\/\d+(?:\/attempts\/\d+)?$/.test(url) ? url : null;
}
export function classify(run) {
  if (!run) return 'IDLE';
  if (['in_progress', 'queued', 'waiting', 'pending', 'requested'].includes(run.status)) return 'WORK';
  if (run.status !== 'completed') return 'IDLE';
  if (run.conclusion === 'success') return 'SUCCESS';
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(run.conclusion)) return 'ALERT';
  return 'IDLE'; // cancelled, skipped, neutral are not QA failures
}
export function snapshot(runs) {
  const sorted = [...runs].sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id-a.id);
  const active = sorted.find(r => classify(r) === 'WORK');
  const run = active || sorted[0] || null;
  return { state: classify(run), run, message: messages[classify(run)] };
}
// Persist keys before presenting events. First successful query establishes a quiet baseline.
// A rerun has a distinct attempt; terminal transitions during WORK are detected.
export class EventLedger {
  constructor(saved = {}) { this.ready = !!saved.ready; this.seen = new Set(saved.seen || []); this.floor = saved.floor || 0; }
  accept(runs) {
    const terminal = runs.filter(r => ['SUCCESS', 'ALERT'].includes(classify(r)));
    const events = this.ready ? terminal.filter(r => Date.parse(r.created_at) >= this.floor && !this.seen.has(runKey(r))) : [];
    if (!this.ready) this.floor = Math.min(...runs.map(r => Date.parse(r.created_at)), Date.now());
    for (const r of terminal) this.seen.add(runKey(r));
    this.ready = true;
    return events.sort((a,b) => (classify(a)==='ALERT' ? -1 : 1) - (classify(b)==='ALERT' ? -1 : 1) || b.id-a.id);
  }
  save() { return { ready: this.ready, floor: this.floor, seen: [...this.seen] }; }
}
export class QAPoller {
  constructor({ onResult, onError, onCached=()=>{}, fetcher = (...args) => globalThis.fetch(...args), interval = 300000, storage=null, now=Date.now }) {
    Object.assign(this,{onResult,onError,onCached,fetcher,interval,storage,now});this.delay=interval;this.stopped=true;this.notBefore=0;this.nextAllowed=0;this.storageKey='hina.qa-poll.v2';this.restore();
  }
  valid(runs){return Array.isArray(runs)&&runs.length<=30&&!runs.some(r=>!Number.isSafeInteger(r.id)||!r.status||!Number.isFinite(Date.parse(r.created_at))||!runUrl(r));}
  restore(){
    try{
      const saved=JSON.parse(this.storage?.getItem(this.storageKey)||'null');if(!saved)return;
      if(this.valid(saved.cached)){this.cached=saved.cached;this.etag=typeof saved.etag==='string'&&saved.etag.length<512&&!/[\r\n]/.test(saved.etag)?saved.etag:null;}
      for(const key of ['notBefore','nextAllowed'])if(Number.isFinite(saved[key]))this[key]=Math.max(this[key],Math.min(saved[key],this.now()+86400000));
      if(Number.isFinite(saved.delay))this.delay=Math.max(this.interval,Math.min(saved.delay,1800000));
      if(!saved.error)this.lastError=null;
      if(saved.error&&typeof saved.error.message==='string')this.lastError={message:saved.error.message.slice(0,200),kind:saved.error.kind,status:saved.error.status};
    }catch{} // Storage failure must not prevent local character operation.
  }
  save(){try{this.storage?.setItem(this.storageKey,JSON.stringify({cached:this.cached,etag:this.etag,notBefore:this.notBefore,nextAllowed:this.nextAllowed,delay:this.delay,error:this.lastError}));}catch{}}
  schedule(){clearTimeout(this.timer);if(!this.stopped)this.timer=setTimeout(()=>this.poll(),Math.max(1,this.nextAllowed-this.now(),this.notBefore-this.now()));}
  start(){
    this.stopped=false;this.restore();const retryAt=Math.max(this.notBefore,this.nextAllowed);
    if(this.now()<retryAt){
      if(this.lastError)this.onError(Object.assign(new Error(this.lastError.message),this.lastError,{retryAt}));
      else if(this.cached)this.onCached(this.cached,{retryAt});
    }
    return this.poll();
  }
  stop(){this.stopped=true;clearTimeout(this.timer);this.controller?.abort();}
  async poll(){
    if(this.stopped||this.busy)return;
    this.restore();
    if(this.now()<Math.max(this.notBefore,this.nextAllowed)){this.schedule();return;}
    clearTimeout(this.timer);this.busy=true;this.controller=new AbortController();
    // Reserve the interval before requesting so other tabs and restarts reuse it.
    this.nextAllowed=this.now()+this.interval;this.save();
    const timeout=setTimeout(()=>this.controller.abort(),15000);
    try{
      const headers={Accept:'application/vnd.github+json'};if(this.etag)headers['If-None-Match']=this.etag;
      const response=await this.fetcher(RUNS_API,{headers,signal:this.controller.signal});if(this.stopped)return;
      if(response.status===304){if(!this.cached)throw Object.assign(new Error('QA 캐시 없는 HTTP 304 응답'),{kind:'response'});await this.onResult(this.cached);}
      else{
        if(!response.ok){
          const retry=response.headers.get('retry-after'),reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
          const retryMs=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Date.parse(retry)-this.now()):0;
          const limited=response.status===429||(response.status===403&&(response.headers.get('x-ratelimit-remaining')==='0'||!!retry));
          if([403,429].includes(response.status))this.notBefore=Math.max(this.now()+Math.max(limited?60000:900000,retryMs||0),reset||0);
          const reason=limited?'요청 한도 초과':response.status===401?'인증/저장소 접근 확인 필요':response.status===404?'저장소 또는 QA 워크플로를 찾을 수 없음':response.status===403?'접근 거부 · 네트워크 정책/저장소 권한 확인':'GitHub 서비스 응답 오류';
          throw Object.assign(new Error(`GitHub HTTP ${response.status} · ${reason}`),{kind:limited?'rate-limit':'http',status:response.status});
        }
        const data=await response.json();if(this.stopped)return;
        if(!this.valid(data.workflow_runs))throw Object.assign(new Error('올바르지 않은 QA 응답'),{kind:'response'});
        this.cached=data.workflow_runs;this.etag=response.headers.get('etag');await this.onResult(this.cached);
      }
      this.delay=this.interval;this.notBefore=0;this.lastError=null;this.nextAllowed=this.now()+this.interval;
    }catch(error){
      if(!this.stopped){
        this.delay=Math.min(Math.max(this.delay*2,this.interval),1800000);
        if(!error.kind){error.kind=error.name==='AbortError'?'timeout':'network';error.message=error.name==='AbortError'?'QA 응답 시간 초과 (15초)':error instanceof TypeError?'QA 네트워크 연결 실패 · 인터넷/방화벽 확인':error.message;}
        this.nextAllowed=Math.max(this.now()+this.delay,this.notBefore);error.retryAt=this.nextAllowed;
        this.lastError={message:error.message,kind:error.kind,status:error.status};this.onError(error);
      }
    }finally{clearTimeout(timeout);this.busy=false;this.save();this.schedule();}
  }
}
