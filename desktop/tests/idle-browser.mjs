import '../scripts/build.mjs';
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const server=createServer(async(req,res)=>{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!p.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}try{res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.gif':'image/gif'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(process.platform==='win32'?{channel:'msedge',headless:true}:{executablePath:process.env.HINA_BROWSER_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const report={scope:'Chromium real WebP decoder/canvas/IndexedDB, Tauri IPC mocked; not Windows native QA',cases:[]};
try{
 await mkdir('qa-results',{recursive:true});
 const page=await browser.newPage({viewport:{width:1120,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/idle-review.html');await page.locator('#canvas').waitFor({state:'visible'});await page.locator('#repeat').click();
 const ids=await page.locator('#choose option').evaluateAll(options=>options.map(o=>o.value));assert.equal(ids.length,8);
 for(const id of ids){await page.locator('#choose').selectOption(id);await page.waitForFunction(id=>document.querySelector('#caption').textContent===id,id);await page.locator('#canvas').waitFor({state:'visible'});const first=await page.locator('#canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(650);const next=await page.locator('#canvas').evaluate(c=>c.toDataURL());assert.notEqual(first,next,`${id} must animate real pixels`);report.cases.push(id+': decoded frames change pixels');}
 await page.locator('#choose').selectOption('IDLE_NORMAL');await page.locator('#canvas').waitFor({state:'visible'});await page.waitForTimeout(400);await page.locator('#pause').click();await page.waitForTimeout(80);const frozen=await page.locator('#canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(400);assert.equal(await page.locator('#canvas').evaluate(c=>c.toDataURL()),frozen);await page.locator('#pause').click();await page.waitForTimeout(400);assert.notEqual(await page.locator('#canvas').evaluate(c=>c.toDataURL()),frozen);report.cases.push('pause freezes actual raster; resume advances');
 await page.screenshot({path:'qa-results/idle-review.png',fullPage:true});
 // Verify real decoder metadata before activation, with honest hashes and valid manifests.
 const atomic=await page.evaluate(async()=>{
  const {RemoteAssets}=await import('./shared/hina/remote-assets.js');const {IDLE_MANIFEST_URL}=await import('./shared/hina/remote-assets-policy.js');const bundled=(await import('./shared/hina/bundled-manifest.js')).default;const originalFetch=globalThis.fetch.bind(globalThis),results=[];
  for(const variant of ['valid','frames','duration','state-alias']){
   let commits=0,lastError='';const manifest=structuredClone(bundled);manifest.version='qa-'+variant;if(variant==='frames')manifest.motions.IDLE_NORMAL.frames++;if(variant==='duration')manifest.motions.IDLE_NORMAL.durationMs+=100;if(variant==='state-alias')manifest.motions.IDLE_NORMAL={...manifest.motions.IDLE_NORMAL,...manifest.assets.WORK,animated:true};
   const store={getMeta:async()=>null,getBlob:async()=>null,commit:async()=>{commits++;}};
   const updater=new RemoteAssets({bundledManifest:bundled,manifestURL:IDLE_MANIFEST_URL,store,fetcher:(url,opts)=>url===IDLE_MANIFEST_URL?Promise.resolve(Response.json(manifest)):originalFetch(url,opts),onStatus:s=>{if(s.kind==='error')lastError=s.message;}});
   try{results.push({variant,activated:await updater.check(),commits,lastError});}finally{updater.stop();}
  }
  return results;
 });
 assert.equal(atomic[0].activated,true);assert.equal(atomic[0].commits,1);for(const result of atomic.slice(1)){assert.equal(result.activated,false);assert.equal(result.commits,0);assert.match(result.lastError,/Motion (frame count|duration|canvas) mismatch/);}report.cases.push('valid v2 commits; false frame count/duration and legacy-state hash alias rejected before atomic activation');report.atomic=atomic;
 const app=await browser.newPage({viewport:{width:320,height:420}});app.on('pageerror',e=>errors.push(e.message));
 await app.addInitScript(()=>{localStorage.setItem('hina.settings',JSON.stringify({roam:false,notifications:false,top:true,size:200}));window.__calls=[];window.__TAURI__={core:{invoke:async(name,args)=>{window.__calls.push({name,args});return false;}},event:{listen:async()=>()=>{}},window:{getCurrentWindow:()=>({setAlwaysOnTop:async()=>{},show:async()=>{}})}};});
 let runs=[];await app.route('https://api.github.com/**',route=>route.fulfill({json:{workflow_runs:runs}}));await app.route('https://wnalstlr777.github.io/**',route=>route.abort());await app.clock.install();await app.goto(base+'/');await app.waitForFunction(()=>document.body.dataset.state==='IDLE');
 await app.locator('#pet').click({button:'right'});await app.locator('#motion-loop').check();await app.locator('#idle-motion').selectOption('IDLE_GREETING');await app.locator('#motion-canvas').waitFor({state:'visible'});await app.locator('#close-settings').click();
 const before=await app.evaluate(()=>window.__calls.filter(c=>c.name==='open_office').length);await app.locator('#pet').click();const box=await app.locator('#pet').boundingBox();await app.mouse.move(box.x+box.width/2,box.y+box.height/2);await app.mouse.down();await app.mouse.move(box.x+box.width/2+20,box.y+box.height/2+10,{steps:3});await app.mouse.up();await app.locator('#pet').click();assert.equal(await app.evaluate(()=>window.__calls.filter(c=>c.name==='open_office').length),before+2);
 const mask=await app.evaluate(()=>window.__calls.filter(c=>c.name==='hit_map').at(-1)?.args);assert.ok(mask?.pixels.includes(0)&&mask.pixels.includes(1));report.cases.push('new canvas: click/drag/click and alpha mask');
 runs=[{id:700001,run_attempt:1,status:'in_progress',conclusion:null,created_at:new Date(Date.now()+86400000).toISOString(),html_url:'https://github.com/wnalstlr777/AI-Studio/actions/runs/700001'}];await app.clock.fastForward(300001);await app.waitForFunction(()=>document.body.dataset.state==='WORK');assert.equal(await app.locator('#motion-canvas').isHidden(),true);
 await app.locator('#pet').click({button:'right'});await app.locator('#idle-motion').selectOption('IDLE_CHEER');assert.equal(await app.locator('body').getAttribute('data-state'),'WORK');assert.equal(await app.locator('#motion-canvas').isHidden(),true);report.cases.push('QA WORK preempts manual Idle and blocks replacement');
 runs=[{...runs[0],status:'completed',conclusion:'failure'}];await app.clock.fastForward(300001);await app.waitForFunction(()=>document.body.dataset.state==='ALERT');await app.unroute('https://api.github.com/**');await app.route('https://api.github.com/**',r=>r.abort());await app.clock.fastForward(300001);assert.equal(await app.locator('body').getAttribute('data-state'),'ALERT');assert.match(await app.locator('#qa-connection').innerText(),/QA 연결/);report.cases.push('connection failure preserves unacknowledged QA ALERT');
 // Reproduce a rate-limited installed app with all network asset updates unavailable.
 const offlineContext=await browser.newContext({viewport:{width:320,height:420}});
 await offlineContext.addInitScript(()=>{localStorage.setItem('hina.settings',JSON.stringify({roam:false,notifications:false,top:true,size:200}));Math.random=()=>0;window.__TAURI__={core:{invoke:async()=>false},event:{listen:async()=>()=>{}},window:{getCurrentWindow:()=>({setAlwaysOnTop:async()=>{},show:async()=>{}})}};});
 const offline=await offlineContext.newPage();offline.on('pageerror',e=>errors.push(e.message));let apiCalls=0,recovered=false;
 await offline.route('https://api.github.com/**',route=>{apiCalls++;return recovered?route.fulfill({json:{workflow_runs:[]}}):route.fulfill({status:403,headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':String(Math.floor(Date.now()/1000)+3600)},json:{message:'API rate limit exceeded'}});});
 await offline.route('https://wnalstlr777.github.io/**',route=>route.abort());await offline.clock.install();await offline.goto(base+'/');await offline.waitForFunction(()=>document.body.dataset.state==='CONNECTION_ERROR');await offline.locator('#pet').click({button:'right'});await offline.locator('#motion-loop').check();
 for(const id of ids){await offline.locator('#idle-motion').selectOption(id);await offline.locator('#motion-canvas').waitFor({state:'visible'});assert.equal(await offline.locator('body').getAttribute('data-idle-motion'),id);assert.equal(await offline.locator('body').getAttribute('data-state'),'CONNECTION_ERROR');}
 assert.equal(apiCalls,1);report.cases.push('403 and offline: all eight bundled motions decode without QA connection');
 await offline.locator('#compare-original').check();assert.equal(await offline.locator('#compare-original').isChecked(),true);assert.equal(await offline.locator('#motion-canvas').isHidden(),true);await offline.locator('#compare-original').uncheck();await offline.locator('#motion-canvas').waitFor({state:'visible'});report.cases.push('403 local review preserves original image comparison');
 await offline.locator('#motion-random').click();await offline.locator('#motion-canvas').waitFor({state:'visible'});await offline.clock.fastForward(6100);await offline.waitForFunction(()=>document.body.dataset.idleMotion==='IDLE_HAPPY');assert.equal(apiCalls,1);report.cases.push('403: random review advances while keeping CONNECTION_ERROR visible');
 await offline.reload();await offline.waitForFunction(()=>document.body.dataset.state==='CONNECTION_ERROR');await offline.waitForTimeout(100);assert.equal(apiCalls,1);recovered=true;await offline.clock.fastForward(3600001);await offline.waitForFunction(()=>document.body.dataset.state==='IDLE');assert.equal(apiCalls,2);report.cases.push('403 cooldown survives restart; single retry recovers at reset');await offlineContext.close();
 assert.deepEqual(errors,[]);report.status='passed';await writeFile('qa-results/idle-browser.json',JSON.stringify(report,null,2)+'\n');console.log(`PASS Idle browser: ${report.cases.length} cases`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
