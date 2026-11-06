import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeManifest,assetEntries,verifyBytes,IDLE_MANIFEST_URL,MOTIONS} from '../../shared/hina/remote-assets-policy.js';
import {RemoteAssets} from '../../shared/hina/remote-assets.js';
const root=new URL('../../shared/hina/assets/',import.meta.url);
const bundled=JSON.parse(await readFile(new URL('idle-manifest.json',root),'utf8'));
class Store{constructor(){this.meta=new Map();this.blobs=new Map();}async getMeta(k){return this.meta.get(k);}async getBlob(k){return this.blobs.get(k);}async commit(m,bs,p){for(const[k,b]of bs)this.blobs.set(k,b);this.meta.set('current',structuredClone(m));this.meta.set('previous',structuredClone(p));}}
async function harness(){const files=new Map();for(const a of assetEntries(bundled))files.set(a.file,await readFile(new URL(a.file,root)));const h={manifest:structuredClone(bundled),broken:null,store:new Store()};h.manifest.version='test-idle-v2';h.updater=new RemoteAssets({bundledManifest:bundled,manifestURL:IDLE_MANIFEST_URL,store:h.store,decode:async()=>({}),fetcher:async url=>url===IDLE_MANIFEST_URL?Response.json(h.manifest):new Response(url.endsWith(h.broken||'__none__')?'bad':files.get(new URL(url).pathname.split('/').at(-1)),{headers:{'content-type':url.endsWith('.webp')?'image/webp':url.endsWith('.png')?'image/png':'image/gif'}})});return h;}
test('v1 remains exact six states; v2 requires all eight aligned motions',()=>{
 const legacy={...bundled,schemaVersion:1};delete legacy.motions;assert.equal(normalizeManifest(legacy).schemaVersion,1);
 assert.deepEqual(Object.keys(normalizeManifest(bundled).motions),MOTIONS);
 for(const mutate of [m=>delete m.motions.IDLE_NOTE,m=>m.motions.EXTRA=m.motions.IDLE_NOTE,m=>m.motions.IDLE_NOTE.footY=609,m=>m.motions.IDLE_NOTE.width=513,m=>m.motions.IDLE_NOTE.frames=1,m=>m.motions.IDLE_NOTE.durationMs=0,m=>{m.motions.IDLE_HAPPY={...m.motions.IDLE_NORMAL,frames:m.motions.IDLE_NORMAL.frames+1};}]){const m=structuredClone(bundled);mutate(m);assert.throws(()=>normalizeManifest(m));}
});
test('every motion file matches its size, hash, signature and common dimensions',async()=>{
 for(const entry of Object.values(bundled.motions)){const bytes=new Uint8Array(await readFile(new URL(entry.file,root)));assert.deepEqual(await verifyBytes(bytes,entry),{width:512,height:614});}
});
test('all eight idle motions join atomic commit; drafts are exposed only for explicit review',async()=>{
 const h=await harness();try{assert.equal(await h.updater.check(),true);assert.equal(h.store.meta.get('current').version,'test-idle-v2');for(const id of MOTIONS){assert.equal(h.updater.getMotion(id),null);assert.ok(h.updater.getMotion(id,{review:true}).src.startsWith('blob:'));}}finally{h.updater.stop();}
});
test('corrupt idle file prevents activating any part of the pack',async()=>{
 const h=await harness();h.broken=bundled.motions.IDLE_CHEER.file;try{assert.equal(await h.updater.check(),false);assert.equal(h.updater.current.version,bundled.version);assert.equal(h.store.meta.get('current'),undefined);}finally{h.updater.stop();}
});
