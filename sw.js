import { CHANNELS, MAX_MANIFEST, PROTOCOL, sha256, validateRelease, verifyEnvelope } from './ota/protocol.js';
import { releaseMarker } from './ota/location.js';
import { trustedKeys } from './ota/trust.js';
import { readPublicSummary } from './mind/public-summary.js';

const root = new URL(self.registration.scope);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(root.hostname);
const allowed = local || (root.origin === 'https://wnalstlr777.github.io' && root.pathname === '/AI-Studio/');
const url = path => new URL(path, root).href;
const storeName = 'hina-ota-v1:' + root.pathname;
const metaKey = url('ota/_local/state');
const feed = url('mind/survival-summary.json');
const blobKey = hash => url('ota/blobs/' + hash);
const releaseURL = (channel, sequence) => url(`${releaseMarker}${channel}/${sequence}/index.html`);
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const empty = () => ({ channels: {}, releases: {}, history: [] });
let queue = Promise.resolve();
let download;

function exclusive(callback) {
  const next = queue.then(callback);
  queue = next.catch(() => {});
  return next;
}

async function load() {
  const cache = await caches.open(storeName);
  const saved = await cache.match(metaKey);
  return [cache, saved ? await saved.json() : empty()];
}

const save = (cache, state) => cache.put(metaKey, Response.json(state));
const channelState = (state, channel) => state.channels[channel] ??= {};
const releaseId = release => release.channel + '/' + release.sequence;

async function fetchBytes(address, limit) {
  const response = await fetch(address, {
    redirect: 'error', credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok || response.url !== address || !response.body) throw new Error('Release download unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Release download exceeds size limit');
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

async function json(address, limit = MAX_MANIFEST) {
  return JSON.parse(new TextDecoder().decode(await fetchBytes(address, limit)));
}

async function prepare(cache, release, progress = () => {}) {
  let fetched = 0;
  let completed = 0;
  for (const file of release.files) {
    const key = blobKey(file.sha256);
    const cached = await cache.match(key);
    if (!cached || await sha256(await cached.arrayBuffer()) !== file.sha256) {
      const bytes = await fetchBytes(key, file.bytes);
      if (bytes.byteLength !== file.bytes || await sha256(bytes) !== file.sha256) {
        throw new Error('Release file integrity check failed');
      }
      await cache.put(key, new Response(bytes));
      fetched += 1;
    }
    progress({ status: 'downloading', completed: ++completed, total: release.files.length, fetched });
  }
}

async function usable(cache, release) {
  if (!release) return false;
  // Verify again before making a release visible, including offline and rollback starts.
  for (const file of release.files) {
    const response = await cache.match(blobKey(file.sha256));
    if (!response || await sha256(await response.arrayBuffer()) !== file.sha256) return false;
  }
  return true;
}

async function prune(cache, state) {
  const keep = new Set(Object.values(state.channels).flatMap(value =>
    [value.active, value.previous, value.pending]).filter(Boolean));
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    const match = new URL(client.url).pathname.match(/\/__hina_release\/(stable|development)\/(\d+)\//);
    if (match) keep.add(match[1] + '/' + match[2]);
  }
  for (const id of Object.keys(state.releases)) {
    if (!keep.has(id)) delete state.releases[id];
  }
  await save(cache, state);
  const blobs = new Set(Object.values(state.releases).flatMap(release =>
    release.files.map(file => blobKey(file.sha256))));
  for (const request of await cache.keys()) {
    if (request.url.startsWith(url('ota/blobs/')) && !blobs.has(request.url)) await cache.delete(request).catch(() => {});
  }
}

async function bootstrap() {
  const [cache, state] = await load();
  if (state.channels.stable?.active) return;
  // Before key provisioning, only the first same-origin PWA installation is available.
  const release = trustedKeys.stable
    ? await verifyEnvelope(await json(url('ota/stable.json')), trustedKeys.stable, 'stable')
    : validateRelease(await json(url('ota/bootstrap.json')), 'stable');
  await prepare(cache, release);
  state.releases[releaseId(release)] = release;
  channelState(state, 'stable').active = releaseId(release);
  await save(cache, state);
}

function snapshot(state, channel) {
  const current = state.channels[channel] || {};
  return {
    protocol: PROTOCOL, channel, signed: Boolean(trustedKeys[channel]),
    active: state.releases[current.active]?.versions,
    pending: state.releases[current.pending]?.versions,
    note: state.releases[current.pending]?.note,
    canRollback: Boolean(current.previous),
    history: state.history.filter(item => item.channel === channel).slice(-8).reverse(),
  };
}

async function check(channel, progress) {
  if (download) return download.then(async () => snapshot((await load())[1], channel));
  download = downloadRelease(channel, progress);
  try {
    return await download;
  } finally {
    download = undefined;
  }
}

async function downloadRelease(channel, progress) {
  const initial = await exclusive(async () => {
    const [cache, state] = await load();
    const current = channelState(state, channel);
    if (!trustedKeys[channel] || Date.now() - (current.checkedAt || 0) < 30 * 60 * 1000) {
      return { value: snapshot(state, channel) };
    }
    current.checkedAt = Date.now();
    await save(cache, state);
    return { cache, known: state.releases[current.pending || current.active], highest: current.highest };
  });
  if (initial.value) return initial.value;
  const { cache, known, highest } = initial;
  const release = await verifyEnvelope(await json(url('ota/' + channel + '.json')), trustedKeys[channel], channel);
  if (release.sequence < (highest ?? known?.sequence ?? 0)) throw new Error('Older release rejected');
  if (release.sequence === known?.sequence && release.versions.content !== known.versions.content) {
    throw new Error('Conflicting release sequence');
  }
  if (release.sequence <= (highest ?? known?.sequence ?? -1) || release.versions.content === known?.versions.content) {
    return snapshot((await load())[1], channel);
  }
  try {
    // Background downloads never hold the navigation/state lock.
    await prepare(cache, release, progress);
  } catch (error) {
    await exclusive(async () => prune(cache, (await load())[1]));
    throw error;
  }
  return exclusive(async () => {
    const [, state] = await load();
    const current = channelState(state, channel);
    state.releases[releaseId(release)] = release;
    current.pending = releaseId(release);
    current.highest = release.sequence;
    await prune(cache, state);
    return snapshot(state, channel);
  });
}

async function choose(channel, activate = true, rollback = false) {
  const [cache, state] = await load();
  const current = channelState(state, channel);
  if (rollback && await usable(cache, state.releases[current.previous])) {
    current.active = current.previous;
    delete current.previous;
    delete current.pending;
    state.history.push({ channel, at: new Date().toISOString(), kind: 'rollback',
      versions: state.releases[current.active].versions });
    await save(cache, state);
  }
  if (activate && current.pending) {
    const candidate = state.releases[current.pending];
    if (await usable(cache, candidate)) {
      current.previous = current.active;
      current.active = current.pending;
      state.history.push({ channel, at: new Date().toISOString(), kind: 'activation',
        versions: candidate.versions, note: candidate.note });
    }
    delete current.pending;
    await save(cache, state);
  }
  if (!(await usable(cache, state.releases[current.active]))) {
    if (await usable(cache, state.releases[current.previous])) {
      current.active = current.previous;
      state.history.push({ channel, at: new Date().toISOString(), kind: 'recovery',
        versions: state.releases[current.active].versions });
    } else {
      delete current.active;
    }
    delete current.previous;
    await save(cache, state);
  }
  return state.releases[current.active];
}

async function navigate(request, channel) {
  const release = await exclusive(() => choose(channel));
  if (release) {
    const destination = new URL(releaseURL(channel, release.sequence));
    destination.search = new URL(request.url).search;
    destination.searchParams.delete('channel');
    return Response.redirect(destination.href);
  }
  if (channel !== 'stable') return Response.redirect(root.href);
  // Recover the original installer if the browser has evicted its entire cache.
  return fetch(request);
}

async function cachedFile(request, channel, sequence, path) {
  const [cache, state] = await load();
  const release = state.releases[channel + '/' + sequence];
  if (request.mode === 'navigate' && !(await usable(cache, release))) {
    return Response.redirect(url('?channel=' + channel));
  }
  const file = release?.files.find(entry => entry.path === path);
  const response = file && await cache.match(blobKey(file.sha256));
  if (!response) {
    if (request.mode === 'navigate') return Response.redirect(url('?channel=' + channel));
    return new Response('Cached release file unavailable', { status: 503 });
  }
  const type = TYPES[path.split('.').at(-1)];
  return new Response(response.body, { headers: {
    'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'",
  } });
}

async function publicData() {
  const cache = await caches.open(storeName);
  try {
    const value = readPublicSummary(await json(feed, 4096));
    const response = Response.json(value);
    await cache.put(feed, response.clone());
    return response;
  } catch {
    const previous = await cache.match(feed);
    if (previous) return new Response(previous.body, { headers: {
      'Content-Type': 'application/json', 'X-Hina-Offline': '1',
    } });
    return new Response(null, { status: 503 });
  }
}

if (allowed) {
  self.addEventListener('install', event => event.waitUntil(exclusive(bootstrap)));
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', event => {
    const address = new URL(event.request.url);
    if (event.request.method !== 'GET' || address.origin !== root.origin ||
        !address.pathname.startsWith(root.pathname)) return;
    const path = address.pathname.slice(root.pathname.length);
    if (address.href === feed) {
      event.respondWith(publicData());
    } else if (path.startsWith(releaseMarker)) {
      const [, channel, sequence, ...parts] = path.split('/');
      if (CHANNELS.includes(channel) && /^\d+$/.test(sequence)) {
        event.respondWith(cachedFile(event.request, channel, sequence, parts.join('/')));
      }
    } else if (event.request.mode === 'navigate' && (path === '' || path === 'index.html')) {
      const channel = address.searchParams.get('channel') === 'development' ? 'development' : 'stable';
      event.respondWith(navigate(event.request, channel));
    }
  });

  self.addEventListener('message', event => {
    const { type, channel } = event.data || {};
    if (!event.source?.url?.startsWith(root.href) || !CHANNELS.includes(channel)) return;
    const reply = event.ports[0];
    if (!reply) return;
    if (!['check', 'rollback', 'status'].includes(type)) return;
    const run = async () => {
      if (type === 'rollback') await choose(channel, false, true);
      const [, state] = await load();
      return snapshot(state, channel);
    };
    const operation = type === 'check' ? check(channel, value => reply.postMessage(value)) : exclusive(run);
    event.waitUntil(operation.then(value => reply.postMessage({ status: 'ready', value }),
      error => reply.postMessage({ status: 'error', message: error.message })));
  });
}
