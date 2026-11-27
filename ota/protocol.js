export const PROTOCOL = 1;
export const CHANNELS = ['stable', 'development'];
export const MAX_FILE = 8 * 1024 * 1024;
export const MAX_MANIFEST = 128 * 1024;
export const HASH = /^[a-f0-9]{64}$/;
const filePath = /^(?:index\.html|pwa\/[^/]+\.png|(?:ota|mind|games)\/[a-z0-9-]+\.(?:js|css)|shared\/hina\/(?:[a-z0-9-]+\.js|assets\/[a-z0-9-]+\.(?:gif|png|webp)))$/;
export const requiredFiles = [
  'index.html', 'ota/ui.js', 'ota/ui.css', 'ota/location.js',
  'mind/mind.js', 'mind/mind.css', 'mind/domains.js', 'mind/public-summary.js',
  'shared/hina/dashboard.js', 'shared/hina/assets.js', 'shared/hina/remote-assets.js',
  'shared/hina/remote-assets-policy.js', 'shared/hina/bundled-web-manifest.js',
  'shared/hina/state.js', 'shared/hina/assets/secretary.png',
];

export function validateRelease(release, channel) {
  if (!CHANNELS.includes(channel) || release?.channel !== channel ||
      release.protocol !== PROTOCOL || !Number.isSafeInteger(release.sequence) || release.sequence < 0 ||
      !HASH.test(release.versions?.content) || !HASH.test(release.versions?.modules) ||
      !HASH.test(release.versions?.intelligence) || release.versions?.dataSchema !== 1 ||
      typeof release.note !== 'string' || release.note.length > 300 ||
      !Array.isArray(release.files) || release.files.length > 100) {
    throw new Error('Incompatible release manifest');
  }
  const paths = new Set();
  let bytes = 0;
  for (const file of release.files) {
    if (typeof file?.path !== 'string' || !filePath.test(file.path) || paths.has(file.path) ||
        typeof file.sha256 !== 'string' || !HASH.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_FILE) {
      throw new Error('Invalid release file');
    }
    paths.add(file.path);
    bytes += file.bytes;
  }
  if (bytes > 32 * 1024 * 1024 || !requiredFiles.every(path => paths.has(path))) {
    throw new Error('Incomplete or oversized release');
  }
  return release;
}

export async function sha256(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

const decode64 = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
export async function verifyEnvelope(envelope, publicKey, channel) {
  if (!publicKey || typeof envelope?.payload !== 'string' || typeof envelope?.signature !== 'string') {
    throw new Error('No trusted signature');
  }
  const key = await crypto.subtle.importKey('spki', decode64(publicKey), 'Ed25519', false, ['verify']);
  const content = decode64(envelope.payload);
  if (content.byteLength > MAX_MANIFEST || !(await crypto.subtle.verify(
    'Ed25519', key, decode64(envelope.signature), content
  ))) throw new Error('Invalid release signature');
  return validateRelease(JSON.parse(new TextDecoder().decode(content)), channel);
}
