export const STATES=['IDLE','WALK','REST','WORK','SUCCESS','ALERT'];
export const ASSET_BASE='https://wnalstlr777.github.io/AI-Studio/shared/hina/assets/';
export const MANIFEST_URL=ASSET_BASE+'manifest.json';
export const CHECK_INTERVAL=600000;
export const MAX_FILE_BYTES=8*1024*1024;
export const MAX_PACK_BYTES=24*1024*1024;
export const MAX_MANIFEST_BYTES=64*1024;
export const mimeFor=format=>format==='apng'?'image/png':`image/${format}`;
const fail=message=>{throw new Error(message);};
export function normalizeManifest(value){
  if(!value || value.schemaVersion!==1 || typeof value.version!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.version))fail('Invalid manifest version');
  if(!value.assets || Object.keys(value.assets).length!==STATES.length || Object.keys(value.assets).some(s=>!STATES.includes(s)))fail('All six asset states are required');
  const hashes=new Map(),files=new Map(),assets={};
  for(const state of STATES){
    const a=value.assets[state];
    if(!a || typeof a.file!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.(gif|png|apng|webp)$/.test(a.file))fail('Invalid asset filename');
    if(!['gif','png','apng','webp'].includes(a.format) || !a.file.endsWith('.'+a.format))fail('Invalid asset format');
    if(!Number.isSafeInteger(a.bytes) || a.bytes<16 || a.bytes>MAX_FILE_BYTES)fail('Invalid asset size');
    if(typeof a.sha256!=='string' || !/^[a-f0-9]{64}$/.test(a.sha256))fail('Invalid asset hash');
    if(typeof a.animated!=='boolean' || typeof a.complete!=='boolean')fail('Invalid animation flags');
    if(files.has(a.file)&&files.get(a.file)!==a.sha256)fail('Conflicting file hashes');
    if(hashes.has(a.sha256)&&(hashes.get(a.sha256).bytes!==a.bytes||hashes.get(a.sha256).format!==a.format))fail('Conflicting asset metadata');
    assets[state]={file:a.file,format:a.format,bytes:a.bytes,sha256:a.sha256,animated:a.animated,complete:a.complete};
    files.set(a.file,a.sha256);hashes.set(a.sha256,a);
  }
  if([...hashes.values()].reduce((n,a)=>n+a.bytes,0)>MAX_PACK_BYTES)fail('Asset pack is too large');
  return {schemaVersion:1,version:value.version,assets};
}
export const manifestKey=manifest=>JSON.stringify(normalizeManifest(manifest));
export function assetURL(entry){
  // Filename validation excludes separators, escapes, queries, and external origins.
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.(gif|png|apng|webp)$/.test(entry.file))fail('Unsafe asset path');
  return ASSET_BASE+entry.file;
}
export async function verifyBytes(bytes,entry,contentType=''){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength!==entry.bytes||bytes.byteLength>MAX_FILE_BYTES)fail('Asset size mismatch');
  const type=contentType.split(';')[0].trim().toLowerCase();
  if(type&&!['application/octet-stream',mimeFor(entry.format),...(entry.format==='apng'?['image/apng']:[])].includes(type))fail('Unexpected asset MIME type');
  const b=bytes,v=new DataView(b.buffer,b.byteOffset,b.byteLength);let width,height;
  if(entry.format==='gif'){
    if(!['GIF87a','GIF89a'].includes(String.fromCharCode(...b.slice(0,6))))fail('Invalid GIF signature');
    width=v.getUint16(6,true);height=v.getUint16(8,true);
  }else if(entry.format==='png'||entry.format==='apng'){
    if(![137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x)||b.length<33||String.fromCharCode(...b.slice(12,16))!=='IHDR')fail('Invalid PNG signature');
    width=v.getUint32(16);height=v.getUint32(20);
    if(entry.format==='apng'){
      let animated=false;
      for(let i=8;i+12<=b.length;){const n=v.getUint32(i);if(n>b.length-i-12)fail('Invalid PNG chunk');if(String.fromCharCode(...b.slice(i+4,i+8))==='acTL')animated=true;i+=n+12;}
      if(!animated)fail('APNG animation control is missing');
    }
  }else{
    if(b.length<30||String.fromCharCode(...b.slice(0,4))!=='RIFF'||String.fromCharCode(...b.slice(8,12))!=='WEBP'||v.getUint32(4,true)!==b.length-8)fail('Invalid WebP signature');
    const kind=String.fromCharCode(...b.slice(12,16));
    if(kind==='VP8X'){width=1+(b[24]|b[25]<<8|b[26]<<16);height=1+(b[27]|b[28]<<8|b[29]<<16);}
    else if(kind==='VP8L'&&b[20]===47){width=1+(b[21]|(b[22]&63)<<8);height=1+((b[22]>>6)|b[23]<<2|(b[24]&15)<<10);}
    else if(kind==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42){width=v.getUint16(26,true)&16383;height=v.getUint16(28,true)&16383;}
    else fail('Invalid WebP frame');
  }
  if(!width||!height||width>4096||height>4096||width*height>8388608)fail('Invalid image dimensions');
  const digest=await crypto.subtle.digest('SHA-256',b);
  const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==entry.sha256)fail('Asset SHA-256 mismatch');
  return {width,height};
}
