import { assetFor } from './assets.js';
import { assetEntries,MANIFEST_URL,CHECK_INTERVAL,MAX_MANIFEST_BYTES,normalizeManifest,manifestKey,assetURL,mimeFor,verifyBytes } from './remote-assets-policy.js';

const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const completed=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Asset cache transaction aborted'));tx.onerror=()=>reject(tx.error||new Error('Asset cache write failed'));});
export class AssetStore{
  constructor(name="hina-animation-cache-v1"){this.name=name;}
  async db(){
    if(!this.opening)this.opening=new Promise((resolve,reject)=>{
      const r=indexedDB.open(this.name,1);
      r.onupgradeneeded=()=>{r.result.createObjectStore('blobs');r.result.createObjectStore('meta');};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Asset cache is blocked'));
    });
    return this.opening;
  }
  async getMeta(key){return request((await this.db()).transaction('meta').objectStore('meta').get(key));}
  async getBlob(hash){return request((await this.db()).transaction('blobs').objectStore('blobs').get(hash));}
  async commit(manifest,blobs,previous){
    const tx=(await this.db()).transaction(['blobs','meta'],'readwrite'),done=completed(tx);
    const data=tx.objectStore('blobs'),meta=tx.objectStore('meta');
    for(const [hash,blob] of blobs)data.put(blob,hash);
    meta.put(manifest,'current');if(previous)meta.put(previous,'previous');else meta.delete('previous');
    const keep=new Set([manifest,previous].filter(Boolean).flatMap(m=>assetEntries(m).map(a=>a.sha256)));
    const keys=data.getAllKeys();keys.onsuccess=()=>{for(const key of keys.result)if(!keep.has(key))data.delete(key);};
    await done;
  }
}
async function decodeImage(url,entry,bytes){
  const image=new Image();image.src=url;
  let timeout;
  try{
    await Promise.race([image.decode(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Image decode timed out')),10000);})]);
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>4096||image.naturalHeight>4096)throw new Error('Image decode failed');
    if(entry.frames){
      if(!globalThis.ImageDecoder)throw new Error('Motion verification requires an updated WebView2');
      const decoder=new ImageDecoder({data:bytes,type:mimeFor(entry.format)});
      try{
        await decoder.tracks.ready;
        if(decoder.tracks.selectedTrack.frameCount!==entry.frames)throw new Error('Motion frame count mismatch');
        let duration=0;
        for(let frameIndex=0;frameIndex<entry.frames;frameIndex++){
          const decoded=await decoder.decode({frameIndex});duration+=decoded.image.duration/1000;decoded.image.close();
        }
        if(Math.abs(duration-entry.durationMs)>entry.frames)throw new Error('Motion duration mismatch');
      }finally{decoder.close();}
    }
    return image; // Retain a decoded image until this resource is retired.
  }finally{clearTimeout(timeout);}
}
export class RemoteAssets{
  constructor({bundledManifest,store=new AssetStore(),fetcher=(...args)=>globalThis.fetch(...args),decode=decodeImage,onChange=()=>{},onStatus=()=>{},interval=CHECK_INTERVAL,manifestURL=MANIFEST_URL}={}){
    this.manifestURL=manifestURL;
    this.bundled=bundledManifest?normalizeManifest(bundledManifest):null;
    this.current=this.bundled;this.source='bundled';this.store=store;this.fetcher=fetcher;this.decode=decode;
    this.onChange=onChange;this.onStatus=onStatus;this.interval=interval;this.resources=new Map();this.retired=new Map();this.staged=new Map();this.stopped=false;
    this.bundleByHash=new Map(this.bundled?assetEntries(this.bundled).map(a=>[a.sha256,a]):[]);
  }
  getAsset(state){
    const a=this.current?.assets[state];if(!a)return assetFor(state);
    const resource=this.resources.get(a.sha256);
    const src=resource?.url||(this.source==='bundled'?new URL('./assets/'+a.file,import.meta.url).href:null);
    if(!src)return assetFor(state);
    const localIdleStyle=state==='IDLE'&&!a.animated&&a.sha256===this.bundled?.assets.IDLE.sha256;
    return {...a,src,localIdleStyle,animated:a.animated||localIdleStyle,label:localIdleStyle?assetFor(state).label:`${state} · ${a.complete?(this.source==='bundled'?'기본 에셋':'원격 '+this.current.version):'전용 모션 미제작'}`};
  }
  getMotion(id,{review=false}={}){
    const a=this.current?.motions?.[id];
    if(!a||(!a.complete&&!review))return null;
    const resource=this.resources.get(a.sha256);
    const src=resource?.url||(this.source==='bundled'?new URL('./assets/'+a.file,import.meta.url).href:null);
    return src?{...a,src,id,label:`${id} · ${a.complete?'검수 승인':'검수 시안'}`} : null;
  }
  status(kind,extra={}){try{this.onStatus({kind,version:this.current?.version,source:this.source,...extra});}catch{}}
  async bytes(url,limit,cache='reload'){
    const controller=new AbortController(),abort=()=>controller.abort();
    if(this.controller?.signal.aborted)throw new Error('Asset update stopped');
    this.controller?.signal.addEventListener('abort',abort,{once:true});
    const signal=this.controller?.signal,timeout=setTimeout(abort,15000);
    try{
      const response=await this.fetcher(url,{signal:controller.signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',cache});
      if(!response.ok||response.redirected||(response.url&&response.url!==url))throw new Error('Asset request failed');
      if(Number(response.headers.get('content-length'))>limit)throw new Error('Asset response is too large');
      const reader=response.body.getReader(),chunks=[];let length=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw new Error('Asset response exceeded limit');chunks.push(value);}}
      catch(error){await reader.cancel().catch(()=>{});throw error;}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      return {bytes,mime:response.headers.get('content-type')||''};
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
  }
  async resource(entry,blob){
    if(!(blob instanceof Blob)||blob.size!==entry.bytes)throw new Error('Cached asset size mismatch');
    const bytes=new Uint8Array(await blob.arrayBuffer());const size=await verifyBytes(bytes,entry,blob.type);
    if(entry.frames&&(size.width!==entry.width||size.height!==entry.height))throw new Error('Motion canvas mismatch');
    const url=URL.createObjectURL(blob);
    try{return {blob,url,format:entry.format,frames:entry.frames,durationMs:entry.durationMs,image:await this.decode(url,entry,bytes)};}catch(error){URL.revokeObjectURL(url);throw error;}
  }
  async prepare(manifest,network){
    const resources=new Map(),added=new Set();
    try{
      for(const entry of assetEntries(manifest)){
        if(resources.has(entry.sha256)){
          const ready=resources.get(entry.sha256);
          if(entry.frames&&(ready.frames!==entry.frames||ready.durationMs!==entry.durationMs))throw new Error('Conflicting motion metadata');
          continue;
        }
        const active=this.resources.get(entry.sha256);
        if(active){if(active.blob.size!==entry.bytes||active.format!==entry.format||(entry.frames&&(active.frames!==entry.frames||active.durationMs!==entry.durationMs)))throw new Error('Cached asset metadata mismatch');resources.set(entry.sha256,active);continue;}
        let blob=this.staged.get(entry.sha256)||await this.store.getBlob(entry.sha256);
        if(blob)try{resources.set(entry.sha256,await this.resource(entry,blob));added.add(entry.sha256);continue;}catch{blob=null;}
        const bundled=this.bundleByHash.get(entry.sha256);
        if(bundled){
          const result=await this.bytes(new URL('./assets/'+bundled.file,import.meta.url).href,entry.bytes,'force-cache');
          blob=new Blob([result.bytes],{type:mimeFor(entry.format)});
        }else if(network){
          const result=await this.bytes(assetURL(entry),entry.bytes);await verifyBytes(result.bytes,entry,result.mime);
          blob=new Blob([result.bytes],{type:mimeFor(entry.format)});
        }else throw new Error('Cached animation is missing');
        const ready=await this.resource(entry,blob);resources.set(entry.sha256,ready);added.add(entry.sha256);if(network)this.staged.set(entry.sha256,ready.blob);
      }
      return {resources,added};
    }catch(error){for(const hash of added)URL.revokeObjectURL(resources.get(hash).url);throw error;}
  }
  discard(pack){for(const hash of pack.added)URL.revokeObjectURL(pack.resources.get(hash).url);}
  activate(manifest,pack,source){
    const old=this.resources;this.current=manifest;this.resources=pack.resources;this.source=source;
    for(const [hash,resource] of old)if(this.resources.get(hash)!==resource){
      const timer=setTimeout(()=>{URL.revokeObjectURL(resource.url);this.retired.delete(timer);},5000);this.retired.set(timer,resource.url);
    }
    try{this.onChange();}catch{}this.status('ready');
  }
  async loadCached(){
    for(const key of ['current','previous'])try{
      const value=await this.store.getMeta(key);if(!value)continue;
      const manifest=normalizeManifest(value);if(manifest.schemaVersion!==this.bundled?.schemaVersion)throw new Error('Cached schema mismatch');const pack=await this.prepare(manifest,false);
      if(this.stopped){this.discard(pack);return;}
      this.activate(manifest,pack,key==='current'?'cache':'previous');return;
    }catch{} // A damaged current cache must not hide a valid previous/bundled pack.
    this.status('ready');
  }
  check(){
    if(this.stopped)return Promise.resolve(false);if(this.pending)return this.pending;
    this.pending=this.update().finally(()=>{this.pending=null;});return this.pending;
  }
  async update(){
    this.controller=new AbortController();let pack;
    try{
      const {bytes}=await this.bytes(this.manifestURL,MAX_MANIFEST_BYTES,'no-cache');
      const manifest=normalizeManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
      if(this.bundled&&manifest.schemaVersion!==this.bundled.schemaVersion)throw new Error('Remote schema mismatch');
      if(this.current?.version===manifest.version){
        if(manifestKey(this.current)!==manifestKey(manifest))throw new Error('Manifest content changed without a version bump');
        this.status('unchanged');return false;
      }
      const wanted=new Set(assetEntries(manifest).map(a=>a.sha256));for(const hash of this.staged.keys())if(!wanted.has(hash))this.staged.delete(hash);
      pack=await this.prepare(manifest,true);
      if(this.stopped){this.discard(pack);return false;}
      await this.store.commit(manifest,new Map([...pack.resources].map(([hash,r])=>[hash,r.blob])),this.current);
      if(this.stopped){this.discard(pack);return false;}
      this.activate(manifest,pack,'remote');this.staged.clear();return true;
    }catch(error){if(pack)this.discard(pack);if(!this.stopped)this.status('error',{message:error?.message||String(error)});return false;}
  }
  start(){
    if(this.starting)return this.starting;this.stopped=false;
    this.timer=setInterval(()=>this.check(),this.interval);
    this.starting=this.loadCached().then(()=>this.check());return this.starting;
  }

  stop(){
    this.stopped=true;clearInterval(this.timer);this.controller?.abort();
    for(const r of this.resources.values())URL.revokeObjectURL(r.url);
    for(const [timer,url] of this.retired){clearTimeout(timer);URL.revokeObjectURL(url);}
    this.resources.clear();this.retired.clear();this.staged.clear();
  }
}
