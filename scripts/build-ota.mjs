import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROTOCOL, validateRelease } from '../ota/protocol.js';

const [destination, input = destination, channel = 'stable'] = process.argv.slice(2);
if (!destination) throw new Error('Usage: build-ota.mjs output [input] [stable|development]');
const root = await realpath(resolve(input));
const target = await realpath(resolve(destination));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const { trustedKeys } = await import(pathToFileURL(resolve(target, 'ota/trust.js')));
async function readSource(path, encoding) {
  const file = resolve(root, path);
  if (await realpath(file) !== file || !(await lstat(file)).isFile()) {
    throw new Error('Invalid OTA source file: ' + path);
  }
  return readFile(file, encoding);
}

const bundled = (await readSource('shared/hina/bundled-web-manifest.js', 'utf8'))
  .split('export default ')[1]?.trim().replace(/;$/, '');
const assets = JSON.parse(bundled);
const bundleAssets = [...new Set(Object.values(assets.assets).map(asset => asset.file).concat('secretary.png'))];
if (!bundleAssets.every(file => typeof file === 'string' && /^[a-z0-9-]+\.(?:gif|png|webp)$/.test(file))) {
  throw new Error('Unsafe asset filename in bundled manifest');
}
const paths = [
  'index.html', 'pwa/icon-192.png', 'pwa/icon-512.png', 'ota/ui.js', 'ota/ui.css', 'ota/location.js',
  'games/wow-panel.js', 'games/wow-panel.css', 'games/market-data.js',
  'mind/mind.js', 'mind/mind.css', 'mind/domains.js', 'mind/public-summary.js',
  ...['assets', 'bundled-web-manifest', 'dashboard', 'remote-assets', 'remote-assets-policy', 'state']
    .map(name => 'shared/hina/' + name + '.js'),
  ...bundleAssets.map(name => 'shared/hina/assets/' + name),
];
const contents = new Map();
for (const path of paths) contents.set(path, await readSource(path));
const files = [...contents].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: digest(bytes) }));
const sequence = Number(process.env.GITHUB_RUN_ID || process.env.HINA_OTA_SEQUENCE || 1);
const versions = {
  content: digest(JSON.stringify(files)),
  modules: digest(JSON.stringify(files.filter(file => file.path.endsWith('.js') && file.path !== 'mind/domains.js'))),
  intelligence: digest(contents.get('mind/domains.js')),
  dataSchema: 1,
};
const release = validateRelease({ protocol: PROTOCOL, channel, sequence, versions, files,
  note: (await readSource('ota/release-note.txt', 'utf8')).trim() }, channel);
const keyValue = channel === 'stable' ? process.env.HINA_OTA_STABLE_KEY : process.env.HINA_OTA_DEVELOPMENT_KEY;
const payload = Buffer.from(JSON.stringify(release));
await mkdir(resolve(target, 'ota/blobs'), { recursive: true });
for (const [path, bytes] of contents) await writeFile(resolve(target, 'ota/blobs', digest(bytes)), bytes);
if (channel === 'stable') await writeFile(resolve(target, 'ota/bootstrap.json'), payload);
if (!keyValue && !trustedKeys[channel] && channel === 'stable') {
  console.log('Built same-origin PWA bootstrap. Signed OTA awaits a pinned key and signing secret.');
} else {
  if (!keyValue || !trustedKeys[channel]) throw new Error('Signing key and committed public pin are both required');
  const key = createPrivateKey({ key: Buffer.from(keyValue, 'base64'), format: 'der', type: 'pkcs8' });
  if (key.asymmetricKeyType !== 'ed25519' ||
      createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64') !== trustedKeys[channel]) {
    throw new Error('Signing key does not match the committed Ed25519 pin');
  }
  await writeFile(resolve(target, 'ota', channel + '.json'), JSON.stringify({
    payload: payload.toString('base64'), signature: sign(null, payload, key).toString('base64')
  }));
  console.log('Built signed OTA for ' + channel + ' / ' + sequence);
}
