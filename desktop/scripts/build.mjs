import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { normalizeManifest } from '../../shared/hina/remote-assets-policy.js';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
rmSync(`${root}dist`, { recursive: true, force: true }); mkdirSync(`${root}dist`, { recursive: true });
cpSync(`${root}src`, `${root}dist`, { recursive: true });
cpSync(`${root}../shared`, `${root}dist/shared`, { recursive: true });

const manifest=normalizeManifest(JSON.parse(readFileSync(`${root}../shared/hina/assets/idle-manifest.json`,'utf8')));
writeFileSync(`${root}dist/shared/hina/bundled-manifest.js`, `export default ${JSON.stringify(manifest)};\n`);
