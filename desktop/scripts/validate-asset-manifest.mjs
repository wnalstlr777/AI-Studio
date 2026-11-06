import { readFile } from 'node:fs/promises';
import { normalizeManifest,verifyBytes,assetEntries } from '../../shared/hina/remote-assets-policy.js';
const base=new URL('../../shared/hina/assets/',import.meta.url);
const manifest=normalizeManifest(JSON.parse(await readFile(new URL(process.argv[2]||'manifest.json',base),'utf8')));
const seen=new Set();
for(const entry of assetEntries(manifest)){
  if(seen.has(entry.sha256))continue;seen.add(entry.sha256);
  await verifyBytes(new Uint8Array(await readFile(new URL(entry.file,base))),entry);
}
console.log(`PASS asset manifest ${manifest.version}: ${Object.keys(manifest.motions||{}).length} idle motions + six states, ${seen.size} distinct validated files`);
