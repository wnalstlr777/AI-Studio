import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { appRoot } from './location.js';
import { requiredFiles, verifyEnvelope, validateRelease } from './protocol.js';

const digest = '0'.repeat(64);
const manifest = {
  protocol: 1, channel: 'stable', sequence: 1,
  versions: { content: digest, modules: digest, intelligence: digest, dataSchema: 1 },
  files: requiredFiles.map(path => ({ path, sha256: digest, bytes: 1 })),
  note: 'Release validation',
};

test('signed releases cannot be modified or accepted into another channel', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pin = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const payload = Buffer.from(JSON.stringify(manifest));
  const signature = sign(null, payload, privateKey).toString('base64');
  const envelope = { payload: payload.toString('base64'), signature };
  assert.deepEqual(await verifyEnvelope(envelope, pin, 'stable'), manifest);
  await assert.rejects(verifyEnvelope(envelope, '', 'stable'), /No trusted signature/);
  await assert.rejects(verifyEnvelope(envelope, pin, 'development'), /Incompatible/);
  await assert.rejects(verifyEnvelope({ ...envelope, payload: 'e30=' }, pin, 'stable'), /Invalid release signature/);
});

test('release manifest cannot include private data or escape the file namespace', () => {
  for (const path of ['../index.html', 'https://example.com/index.html', '.local/hina-mind.json',
    'mind/survival-summary.json', 'shared/hina/assets/secretary.png?x=1']) {
    assert.throws(() => validateRelease({ ...manifest, files: [
      ...manifest.files, { path, bytes: 1, sha256: digest },
    ] }, 'stable'), /Invalid release file/);
  }
  assert.throws(() => validateRelease({ ...manifest, protocol: 2 }, 'stable'), /Incompatible/);
});

test('versioned app files resolve data and install metadata at the original site scope', () => {
  const expected = 'https://wnalstlr777.github.io/AI-Studio/';
  assert.equal(appRoot(expected + 'mind/mind.js').href, expected);
  assert.equal(appRoot(expected + '__hina_release/development/2/ota/ui.js').href, expected);
});
