import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RemoteAssets} from '../../shared/hina/remote-assets.js';
import {assetEntries,normalizeManifest,mimeFor,olderDatedVersion} from '../../shared/hina/remote-assets-policy.js';
import web from '../../shared/hina/bundled-web-manifest.js';
const base=new URL('../../shared/hina/assets/',import.meta.url),bundle=JSON.parse(await readFile(new URL('idle-manifest.json',base),'utf8'));
test('NEWS shares SUCCESS slot: legacy six-state contracts and eight idle IDs remain intact',()=>{
 assert.deepEqual(Object.keys(web.assets),['IDLE','WALK','REST','WORK','SUCCESS','ALERT']);assert.equal(Object.keys(bundle.motions).length,8);
 for(const m of [normalizeManifest(web),normalizeManifest(bundle)]){assert.equal(m.assets.IDLE.file,'hina-idle.gif');assert.equal(m.assets.ALERT.file,'hina-alert.gif');assert.equal(m.assets.SUCCESS.file,'hina-news.gif');for(const state of ['IDLE','ALERT','SUCCESS']){assert.equal(m.assets[state].frames,8);assert.equal(m.assets[state].width,512);assert.equal(m.assets[state].footY,610);}}
 const r=new RemoteAssets({bundledManifest:bundle});assert.equal(r.getAsset('NEWS').file,'hina-news.gif');assert.equal(r.getAsset('CONNECTION_ERROR').file,'hina-idle.gif');r.stop();
});
test('older dated deployment cannot downgrade a newer bundled GIF pack',async()=>{
 assert.equal(olderDatedVersion('2026.11.06.3','2026.11.11-shared-gifs.1'),true);assert.equal(olderDatedVersion('qa-v3','2026.11.11-shared-gifs.1'),false);
 const r=new RemoteAssets({bundledManifest:bundle,fetcher:async()=>Response.json({...bundle,version:'2026.11.06.3'})});try{assert.equal(await r.check(),false);assert.equal(r.current.version,bundle.version);}finally{r.stop();}
});
test('cache written by older clients recovers trusted timing without downloading files again',async()=>{
 const old=structuredClone(bundle);for(const a of Object.values(old.assets))for(const k of ['frames','durationMs','loop','width','height','centerX','footY'])delete a[k];
 const blobs=new Map(await Promise.all(assetEntries(bundle).map(async a=>[a.sha256,new Blob([await readFile(new URL(a.file,base))],{type:mimeFor(a.format)})])));
 let requests=0;const r=new RemoteAssets({bundledManifest:bundle,store:{getMeta:async k=>k==='current'?old:null,getBlob:async hash=>blobs.get(hash)},decode:async()=>({}),fetcher:async()=>{requests++;return Response.json(bundle);}});
 try{await r.loadCached();assert.equal(r.source,'cache');assert.equal(r.getAsset('NEWS').frames,8);assert.equal(await r.check(),false);assert.equal(requests,1);}finally{r.stop();}
});
