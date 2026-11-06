import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, snapshot, EventLedger, QAPoller, runUrl } from '../../shared/hina/state.js';
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
  let results=[],errors=[],requests=[];let n=0;
  const poller=new QAPoller({onResult:r=>results.push(r),onError:e=>errors.push(e),fetcher:async(url,opts)=>{
    requests.push(opts);n++;if(n===2)throw new Error('offline');
    if(n===3)return new Response(null,{status:304});
    return Response.json({workflow_runs:[run(1)]},{headers:{etag:'"v1"'}});
  }});
  try {await poller.start();await poller.poll();assert.equal(results.length,1);assert.equal(errors.length,1);await poller.poll();assert.equal(results.length,2);assert.equal(requests[2].headers['If-None-Match'],'"v1"');}
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
