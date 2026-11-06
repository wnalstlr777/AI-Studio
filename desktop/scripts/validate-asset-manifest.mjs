import { readFile } from 'node:fs/promises';
import { normalizeManifest,verifyBytes } from '../../shared/hina/remote-assets-policy.js';
const base=new URL('../../shared/hina/assets/',import.meta.url);
const manifest=normalizeManifest(JSON.parse(await readFile(new URL('manifest.json',base),'utf8')));
const seen=new Set();
for(const entry of Object.values(manifest.assets)){
  if(seen.has(entry.sha256))continue;seen.add(entry.sha256);
  await verifyBytes(new Uint8Array(await readFile(new URL(entry.file,base))),entry);
}
console.log(`PASS asset manifest ${manifest.version}: six states, ${seen.size} distinct validated files`);
