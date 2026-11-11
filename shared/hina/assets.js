import {verifyBytes,mimeFor} from './remote-assets-policy.js';
import bundled from './bundled-web-manifest.js';
export const FALLBACK_SRC=new URL('./assets/secretary.png',import.meta.url).href;
export const animations=Object.fromEntries(Object.entries(bundled.assets).map(([state,a])=>[state,{...a,src:'./assets/'+a.file}]));
export function assetFor(state){
 const key=state==='NEWS'?'SUCCESS':state==='CONNECTION_ERROR'?'IDLE':state;
 const a=animations[key]||{src:'./assets/secretary.png',complete:false,animated:false};
 return {...a,src:new URL(a.src,import.meta.url).href,label:`${state} · ${a.complete?'공용 애니메이션':'전용 모션 미제작'}`};
}
// Keep the original artwork when a file is missing; don't reload a known broken URL each poll.
const failed=new WeakMap(),playback=new WeakMap(),binary=new Map();
export function showAsset(image,asset,onFallback=()=>{},{restart=false,onReady=()=>{}}={}){
 let urls=failed.get(image);if(!urls){urls=new Map();failed.set(image,urls);}
 const src=(urls.get(asset.src)||0)>Date.now()?FALLBACK_SRC:asset.src,previous=playback.get(image);
 if(previous?.source===src&&!restart)return;
 const record={source:src,owned:previous?.owned||null};playback.set(image,record);
 const assign=url=>{if(playback.get(image)!==record)return;image.dataset.assetSrc=src;image.src=url;for(const old of new Set([previous?.owned,record.owned]))if(old&&old!==url)URL.revokeObjectURL(old);if(record.owned!==url)record.owned=null;image.decode().then(()=>{if(playback.get(image)===record&&image.src===url)onReady();}).catch(()=>{});};
 const fallback=()=>{if(playback.get(image)!==record)return;urls.set(src,Date.now()+600000);image.onerror=null;assign(FALLBACK_SRC);onFallback();};
 image.onerror=fallback;
 if(!restart||src===FALLBACK_SRC){assign(src);return;}
 // A fresh blob URL restarts the decoder without refetching the same GIF for new news.
 if(!binary.has(src)){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  const promise=fetch(src,{credentials:'omit',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error('GIF request failed');const bytes=new Uint8Array(await response.arrayBuffer());
   await verifyBytes(bytes,asset,response.headers.get('content-type')||'');return new Blob([bytes],{type:mimeFor(asset.format)});
  }).catch(error=>{binary.delete(src);throw error;}).finally(()=>clearTimeout(timer));binary.set(src,promise);
  if(binary.size>6)binary.delete(binary.keys().next().value);
 }
 binary.get(src).then(blob=>{if(playback.get(image)!==record)return;record.owned=URL.createObjectURL(blob);assign(record.owned);}).catch(fallback);
}
