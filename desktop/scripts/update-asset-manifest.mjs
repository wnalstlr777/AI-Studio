import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeManifest,assetURL,verifyBytes,assetEntries } from '../../shared/hina/remote-assets-policy.js';
const base=new URL('../../shared/hina/assets/',import.meta.url),path=new URL(process.argv[3]||'manifest.json',base);
const manifest=JSON.parse(await readFile(path,'utf8'));
const version=process.argv[2];if(!version||version===manifest.version)throw new Error('Supply a new version, e.g. 2026.11.07.1');
for(const entry of assetEntries(manifest)){
  assetURL(entry); // Validate filename before reading any local file.
  const bytes=await readFile(new URL(entry.file,base));entry.bytes=bytes.length;entry.sha256=createHash('sha256').update(bytes).digest('hex');
  entry.format=entry.file.split('.').at(-1);
  entry.animated=entry.format==='gif'||entry.format==='apng'||(entry.format==='png'&&bytes.includes(Buffer.from('acTL')))||(entry.format==='webp'&&bytes.subarray(12,16).toString()==='VP8X'&&!!(bytes[20]&2));
  await verifyBytes(new Uint8Array(bytes),entry);
}
manifest.version=version;const normalized=normalizeManifest(manifest);
await writeFile(path,JSON.stringify(normalized,null,2)+'\n');console.log(`Updated manifest ${version}; review complete flags before publishing`);

if(path.pathname.endsWith('/manifest.json'))await writeFile(new URL('../../shared/hina/bundled-web-manifest.js',import.meta.url),'// Generated from assets/manifest.json\nexport default '+JSON.stringify(normalized)+';\n');
