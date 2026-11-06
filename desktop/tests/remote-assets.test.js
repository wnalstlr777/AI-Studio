import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RemoteAssets } from '../../shared/hina/remote-assets.js';
import { normalizeManifest,verifyBytes,MANIFEST_URL,ASSET_BASE,CHECK_INTERVAL,MAX_FILE_BYTES } from '../../shared/hina/remote-assets-policy.js';
const root=new URL('../../shared/hina/assets/',import.meta.url);
const bundled=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const png=new Uint8Array(await readFile(new URL('secretary.png',root)));
const walk=new Uint8Array(await readFile(new URL('walk.gif',root)));
const gif=new Uint8Array(await readFile(new URL('greeting.gif',root)));
const entry=(file,bytes,format='gif')=>({file,format,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),animated:format==='gif',complete:true});
// A valid GIF comment changes the fixture version, without changing any character pixels.
const commented=label=>new Uint8Array([...gif.slice(0,-1),33,254,label.length,...Buffer.from(label),0,59]);
const pack=(version,file='idle-v2.gif',bytes=gif)=>({...structuredClone(bundled),version,assets:{...structuredClone(bundled.assets),IDLE:entry(file,bytes)}});
class MemoryStore{
  constructor(){this.meta=new Map();this.blobs=new Map();this.failCommit=false;}
  async getMeta(key){return this.meta.get(key);}
  async getBlob(hash){return this.blobs.get(hash);}
  async commit(manifest,blobs,previous){if(this.failCommit)throw Error('disk full');for(const [k,b]of blobs)this.blobs.set(k,b);this.meta.set('current',structuredClone(manifest));this.meta.set('previous',structuredClone(previous));}
}
function harness({store=new MemoryStore()}={}){
  const h={manifest:structuredClone(bundled),files:new Map([['secretary.png',png],['greeting.gif',gif],['walk.gif',walk],['idle-v2.gif',gif]]),calls:[],offline:false,badFile:null,store,status:[]};
  h.updater=new RemoteAssets({bundledManifest:bundled,store,decode:async()=>({}),onStatus:s=>h.status.push(s),fetcher:async(url,options)=>{
    h.calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    if(url===MANIFEST_URL){if(h.offline)throw Error('offline');return Response.json(h.manifest);}
    const name=new URL(url).pathname.split('/').at(-1);
    if(name===h.badFile)throw Error('disconnected');const data=h.files.get(name);if(!data)return new Response('missing',{status:404});
    return new Response(data,{headers:{'content-type':name.endsWith('.png')?'image/png':'image/gif'}});
  }});
  h.downloads=()=>h.calls.filter(u=>u.startsWith(ASSET_BASE)&&u!==MANIFEST_URL);
  return h;
}
test('unchanged bundled version requires only manifest; interval is ten minutes',async()=>{
  const h=harness();try{assert.equal(CHECK_INTERVAL,600000);assert.equal(await h.updater.check(),false);assert.deepEqual(h.downloads(),[]);assert.equal(h.updater.source,'bundled');}finally{h.updater.stop();}
});
test('new version activates verified files, deduplicates states, and downloads only changed bytes',async()=>{
  const h=harness();try{
    h.manifest=pack('v2');assert.equal(await h.updater.check(),true);assert.equal(h.updater.current.version,'v2');assert.match(h.updater.getAsset('IDLE').src,/^blob:/);assert.equal(h.downloads().length,1);
    assert.equal(await h.updater.check(),false);assert.equal(h.downloads().length,1);
    const g3=commented('v3');h.files.set('idle-v3.gif',g3);h.manifest=pack('v3','idle-v3.gif',g3);
    assert.equal(await h.updater.check(),true);assert.equal(h.downloads().length,2);assert.equal(h.store.meta.get('previous').version,'v2');
  }finally{h.updater.stop();}
});
test('hash, format, MIME, size, and unsafe paths are rejected',async()=>{
  const h=harness();try{
    for(const file of ['../bad.gif','https://example.com/a.gif','a%2f.gif','a.gif?x=1','a.svg','/a.gif','a\\b.gif'])assert.throws(()=>normalizeManifest(pack('v2',file)));
    const expected=entry('x.gif',gif);await assert.rejects(verifyBytes(png,expected));
    await assert.rejects(verifyBytes(gif,{...expected,sha256:'0'.repeat(64)}));
    await assert.rejects(verifyBytes(gif,expected,'text/html'));
    assert.throws(()=>normalizeManifest({...pack('v2'),assets:{...pack('v2').assets,IDLE:{...expected,bytes:MAX_FILE_BYTES+1}}}));
    h.manifest=pack('v2');h.files.set('idle-v2.gif',png);assert.equal(await h.updater.check(),false);assert.equal(h.updater.current.version,bundled.version);assert.equal(h.store.meta.get('current'),undefined);
  }finally{h.updater.stop();}
});
test('partial download never replaces current pack; verified staging is reused after reconnection',async()=>{
  const h=harness();try{
    h.manifest=pack('v2');await h.updater.check();const old=h.updater.getAsset('IDLE').src;
    const a=commented('idle3'),b=commented('walk3');h.files.set('idle3.gif',a);h.files.set('walk3.gif',b);
    h.manifest=pack('v3','idle3.gif',a);h.manifest.assets.WALK=entry('walk3.gif',b);h.badFile='walk3.gif';
    assert.equal(await h.updater.check(),false);assert.equal(h.updater.getAsset('IDLE').src,old);assert.equal(h.store.meta.get('current').version,'v2');
    h.badFile=null;assert.equal(await h.updater.check(),true);assert.equal(h.updater.current.version,'v3');
    assert.equal(h.downloads().filter(u=>u.endsWith('/idle3.gif')).length,1,'already validated staging must not be downloaded twice');
  }finally{h.updater.stop();}
});
test('network failure keeps last good version and recovers; cache write failure keeps old active URL',async()=>{
  const h=harness();try{
    h.manifest=pack('v2');await h.updater.check();const old=h.updater.getAsset('IDLE').src;h.offline=true;
    assert.equal(await h.updater.check(),false);assert.equal(h.updater.getAsset('IDLE').src,old);
    h.offline=false;h.manifest=pack('v3');h.store.failCommit=true;assert.equal(await h.updater.check(),false);assert.equal(h.updater.getAsset('IDLE').src,old);
    h.store.failCommit=false;assert.equal(await h.updater.check(),true);assert.equal(h.updater.current.version,'v3');
  }finally{h.updater.stop();}
});
test('restart offline loads cache; damaged current falls back to previous then bundled',async()=>{
  const h=harness();h.manifest=pack('v2');await h.updater.check();const g3=commented('v3');h.files.set('v3.gif',g3);h.manifest=pack('v3','v3.gif',g3);await h.updater.check();h.updater.stop();
  const good=harness({store:h.store});good.offline=true;try{await good.updater.start();assert.equal(good.updater.current.version,'v3');assert.equal(good.updater.source,'cache');}finally{good.updater.stop();}
  h.store.blobs.set(entry('v3.gif',g3).sha256,new Blob(['broken'],{type:'image/gif'}));
  const previous=harness({store:h.store});previous.offline=true;try{await previous.updater.start();assert.equal(previous.updater.current.version,'v2');assert.equal(previous.updater.source,'previous');}finally{previous.updater.stop();}
  h.store.blobs.set(entry('idle-v2.gif',gif).sha256,new Blob(['broken'],{type:'image/gif'}));
  const fallback=harness({store:h.store});fallback.offline=true;try{await fallback.updater.start();assert.equal(fallback.updater.source,'bundled');assert.equal(fallback.updater.current.version,bundled.version);}finally{fallback.updater.stop();}
});
test('concurrent checks coalesce and same-version content changes are blocked',async()=>{
  const h=harness();try{
    h.manifest=pack('v2');const a=h.updater.check(),b=h.updater.check();assert.equal(a,b);await a;assert.equal(h.downloads().length,1);
    h.manifest.assets.IDLE.complete=false;assert.equal(await h.updater.check(),false);assert.equal(h.updater.current.assets.IDLE.complete,true);
  }finally{h.updater.stop();}
});
test('decoder failures, redirects, over-limit streams, and cached metadata mismatches do not activate',async()=>{
  const h=harness();try{
    h.updater.decode=async()=>{throw Error('decode failed');};h.manifest=pack('v2');assert.equal(await h.updater.check(),false);assert.equal(h.updater.source,'bundled');
    h.updater.fetcher=async()=>({ok:true,redirected:true,url:'https://evil.example/x',headers:new Headers()});assert.equal(await h.updater.check(),false);
    h.updater.fetcher=async()=>new Response(new Uint8Array(65537));assert.equal(await h.updater.check(),false);
  }finally{h.updater.stop();}
  const m=harness();try{m.manifest=pack('v2');await m.updater.check();m.manifest=pack('v3');m.manifest.assets.IDLE.bytes++;assert.equal(await m.updater.check(),false);assert.equal(m.updater.current.version,'v2');}finally{m.updater.stop();}
});
