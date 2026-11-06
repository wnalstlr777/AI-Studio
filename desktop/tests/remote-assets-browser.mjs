import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('../../shared/hina/assets/',import.meta.url);
const bundled=JSON.parse(await readFile(new URL('idle-manifest.json',base),'utf8'));
const gif=await readFile(new URL('greeting.gif',base));
const gif3=Buffer.concat([gif.subarray(0,-1),Buffer.from([33,254,2,118,51,0,59])]);
const entry=(file,b)=>({file,format:'gif',bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),animated:true,complete:true});
export async function remoteAssetChecks(page,{onUpdatedInput,resetQA=()=>{},scope='Browser + real IndexedDB/image decoder, mocked Pages HTTP',resultFile='remote-assets-browser.json'}={}){
  const cases=[];let offline=false,bad=false,downloads=0;
  const remote=version=>({...structuredClone(bundled),version,assets:{...structuredClone(bundled.assets),IDLE:version==='qa-v2'?entry('qa-idle-v2.gif',gif):entry('qa-idle-v3.gif',gif3)}});
  let manifest=remote('qa-v2');
  await page.unroute('https://wnalstlr777.github.io/**');
  await page.route('https://wnalstlr777.github.io/**',route=>{
    if(offline)return route.abort();
    const headers={'access-control-allow-origin':'*'};
    if(route.request().url().endsWith('/idle-manifest.json'))return route.fulfill({json:manifest,headers});
    downloads++;return route.fulfill({body:bad?gif:(route.request().url().endsWith('v3.gif')?gif3:gif),contentType:'image/gif',headers});
  });
  resetQA();await page.evaluate(()=>{localStorage.clear();localStorage.setItem('hina.settings',JSON.stringify({roam:false,notifications:false,top:true,size:200}));});
  await page.reload();
  const ready=(version,source)=>page.waitForFunction(({version,source})=>{
    const e=document.querySelector('#asset-update-status');return e.dataset.version===version&&e.dataset.source===source&&document.querySelector('#character').src.startsWith('blob:');
  },{version,source});
  await ready('qa-v2','remote');await page.locator('#character').evaluate(img=>img.decode());
  const first=await page.locator('#character').getAttribute('src');assert.equal(downloads,1);
  assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('idle-breath')),false,'Remote animation must not be overridden by built-in breathing');
  cases.push('new version, image decode, atomic activation, canvas-safe blob URL');
  await onUpdatedInput?.();
  const tick=async(kind)=>{await page.evaluate(()=>document.querySelector('#asset-update-status').dataset.kind='qa-waiting');await page.clock.fastForward(600001);await page.waitForFunction(kind=>document.querySelector('#asset-update-status').dataset.kind===kind,kind);};
  await tick('unchanged');assert.equal(downloads,1);assert.equal(await page.locator('#character').getAttribute('src'),first);
  cases.push('ten-minute unchanged check performs no image download');
  manifest=remote('qa-v3');bad=true;await tick('error');
  await page.waitForFunction(()=>document.querySelector('#asset-update-status').dataset.kind==='error');
  assert.equal(await page.locator('#character').getAttribute('src'),first);cases.push('bad download blocked; current image remains visible');
  bad=false;offline=true;await tick('error');
  assert.equal(await page.locator('#character').getAttribute('src'),first);cases.push('network interruption keeps last normal image');
  offline=false;await tick('ready');await ready('qa-v3','remote');
  assert.notEqual(await page.locator('#character').getAttribute('src'),first);cases.push('reconnection applies valid new version');
  offline=true;await page.reload();await ready('qa-v3','cache');cases.push('offline restart loads persistent verified cache');
  async function corrupt(hash){
    await page.evaluate(hash=>new Promise((resolve,reject)=>{
      const r=indexedDB.open('hina-animation-cache-v2',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{
        const db=r.result,tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(new Blob(['broken'],{type:'image/gif'}),hash);
        tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
      };
    }),hash);
  }
  await corrupt(manifest.assets.IDLE.sha256);await page.reload();await ready('qa-v2','previous');cases.push('damaged active cache falls back to previous normal version');
  await corrupt(remote('qa-v2').assets.IDLE.sha256);await page.reload();
  await page.waitForFunction(version=>document.querySelector('#asset-update-status').dataset.source==='bundled'&&document.querySelector('#asset-update-status').dataset.version===version,bundled.version);
  assert.ok((await page.locator('#character').getAttribute('src')).endsWith('/secretary.png'));cases.push('damaged previous cache falls back to bundled assets');
  await mkdir('qa-results',{recursive:true});await writeFile('qa-results/'+resultFile,JSON.stringify({scope,status:'passed',cases},null,2));
  console.log(`PASS remote assets (${scope}): ${cases.length} update/cache/recovery checks`);
}
