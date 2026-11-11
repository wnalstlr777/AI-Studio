import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, snapshot, EventLedger, QAPoller, runUrl, acceptNews } from '../../shared/hina/state.js';
const run=(id,conclusion='success',attempt=1)=>({id,run_attempt:attempt,status:'completed',conclusion,created_at:new Date(1700000000000+id*1000).toISOString(),html_url:`https://github.com/wnalstlr777/AI-Studio/actions/runs/${id}`});
test('real workflow statuses: cancellation and unknown are not QA failure',()=>{
  for(const c of ['failure','timed_out','startup_failure','action_required'])assert.equal(classify(run(1,c)),'ALERT');
  for(const c of ['cancelled','skipped','neutral',null])assert.equal(classify(run(1,c)),'IDLE');
  assert.equal(classify({...run(1),status:'in_progress'}),'WORK');assert.equal(classify(null),'IDLE');
  assert.equal(snapshot([run(2),{...run(1),status:'queued'}]).state,'WORK');
});
test('baseline, persistent dedupe, rerun attempt, and failure priority',()=>{
  let l=new EventLedger();assert.deepEqual(l.accept([run(1,'failure')]),[]);
  assert.deepEqual(l.accept([run(1,'failure')]),[]);
  const events=l.accept([run(3),run(2,'failure'),run(1,'failure')]);assert.deepEqual(events.map(r=>r.id),[2,3]);
  l=new EventLedger(l.save());assert.deepEqual(l.accept([run(2,'failure')]),[]);
  assert.equal(l.accept([run(2,'failure',2)]).length,1);
});
test('completion observed after running baseline becomes an event',()=>{
  const l=new EventLedger();l.accept([{...run(1),status:'in_progress',conclusion:null}]);
  assert.equal(l.accept([run(1,'failure')]).length,1);
});
test('untrusted URL is rejected',()=>{assert.equal(runUrl({...run(1),html_url:'javascript:alert(1)'}),null);});
test('network error never produces success/failure; ETag cache restores connection',async()=>{
  let results=[],errors=[],requests=[];let n=0,clock=Date.now();
  const poller=new QAPoller({now:()=>clock,onResult:r=>results.push(r),onError:e=>errors.push(e),fetcher:async(url,opts)=>{
    requests.push(opts);n++;if(n===2)throw new Error('offline');
    if(n===3)return new Response(null,{status:304});
    return Response.json({workflow_runs:[run(1)]},{headers:{etag:'"v1"'}});
  }});
  try {await poller.start();clock+=300000;await poller.poll();assert.equal(results.length,1);assert.equal(errors.length,1);clock+=600000;await poller.poll();assert.equal(results.length,2);assert.equal(requests[2].headers['If-None-Match'],'"v1"');}
  finally {poller.stop();}
});
test('rate limit prevents immediate repeated manual requests',async()=>{
  let calls=0;const p=new QAPoller({onResult:()=>assert.fail(),onError:()=>{},fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'600'}});}});
  try {await p.start();await p.poll();assert.equal(calls,1);assert.ok(p.notBefore>Date.now()+500000);}finally{p.stop();}
});

test('default fetch preserves the browser global receiver',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async function(){assert.equal(this,globalThis);return Response.json({workflow_runs:[]});};
  let called=false;const p=new QAPoller({onResult:()=>{called=true;},onError:e=>{throw e;}});
  try{await p.start();assert.equal(called,true);}finally{p.stop();globalThis.fetch=original;}
});

test('connection diagnostics distinguish limits, permissions, 404, and timeout',async()=>{
 for(const [status,headers,kind,pattern] of [[403,{'x-ratelimit-remaining':'0'},'rate-limit',/한도/],[403,{},'http',/접근 거부/],[401,{},'http',/인증/],[404,{},'http',/워크플로/],[429,{'retry-after':'120'},'rate-limit',/한도/]]){
  let failure;const p=new QAPoller({onResult:()=>assert.fail(),onError:e=>failure=e,fetcher:async()=>new Response('',{status,headers})});
  try{await p.start();assert.equal(failure.kind,kind);assert.match(failure.message,pattern);assert.ok(failure.retryAt>Date.now());}finally{p.stop();}
 }
});
test('a stopped poll cannot deliver an in-flight result',async()=>{
 let finish,called=false;const p=new QAPoller({onResult:()=>called=true,onError:()=>assert.fail(),fetcher:()=>new Promise(r=>finish=r)});
 const pending=p.start();p.stop();finish(Response.json({workflow_runs:[]}));await pending;assert.equal(called,false);
});

const memoryStorage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
test('rate-limit cooldown survives restart and recovers after reset with one request',async()=>{
 const storage=memoryStorage();let clock=Date.now(),calls=0,errors=0,results=0;
 const options={storage,now:()=>clock,onResult:()=>results++,onError:()=>errors++,fetcher:async()=>{calls++;return calls===1?new Response('',{status:403,headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':String(Math.floor(clock/1000)+3600)}}):Response.json({workflow_runs:[]});}};
 const a=new QAPoller(options);await a.start();a.stop();assert.equal(calls,1);
 const b=new QAPoller(options);try{await b.start();await b.poll();assert.equal(calls,1);assert.equal(errors,2);clock+=3600001;await b.poll();assert.equal(calls,2);assert.equal(results,1);await b.poll();assert.equal(calls,2);}finally{b.stop();}
});
test('persisted ETag/cache and polling interval suppress restart, manual and second-tab duplicates',async()=>{
 const storage=memoryStorage();let clock=Date.now(),calls=0,lastHeaders,cached=0,results=[];
 const options={storage,now:()=>clock,onCached:()=>cached++,onResult:r=>results.push(r),onError:()=>assert.fail(),fetcher:async(_,o)=>{calls++;lastHeaders=o.headers;return calls===1?Response.json({workflow_runs:[run(1)]},{headers:{etag:'"persisted"'}}):new Response(null,{status:304});}};
 const a=new QAPoller(options);await a.start();a.stop();const b=new QAPoller(options),c=new QAPoller(options);
 try{await b.start();await c.start();await b.poll();assert.equal(calls,1);clock+=300000;await b.poll();await c.poll();assert.equal(calls,2);assert.equal(lastHeaders['If-None-Match'],'"persisted"');assert.equal(results.length,2);assert.equal(cached,2);}finally{b.stop();c.stop();}
});

test('external NEWS IDs deduplicate across saved ledgers without accepting missing IDs',()=>{
 const ledger=new EventLedger();assert.equal(acceptNews(ledger,{}),false);assert.equal(acceptNews(ledger,{id:'result-1'}),true);assert.equal(acceptNews(ledger,{id:'result-1'}),false);assert.equal(acceptNews(new EventLedger(ledger.save()),{id:'result-1'}),false);assert.equal(acceptNews(ledger,{id:'result-2'}),true);
});
