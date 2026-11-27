import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readMarket } from '../games/market-data.js';

const hours = 60 * 60 * 1000;
const maximumCopper = 1_000_000_000_000;
const positive = value => Number.isSafeInteger(value) && value > 0;
const apiHost = 'https://kr.api.blizzard.com';

export function pickHouse(index, configuredId) {
  if (!Array.isArray(index?.auctions)) throw new Error('Unexpected Forever market index');
  const horde = index.auctions.filter(house => positive(house?.id) &&
    typeof house.name === 'string' && (/^horde\b/i.test(house.name) || house.name.includes('호드')));
  const house = configuredId ? horde.find(house => String(house.id) === configuredId) :
    horde.length === 1 ? horde[0] : undefined;
  if (!house) throw new Error('Select a verified Korean Horde auction-house ID. Candidates: ' +
    (horde.map(house => house.id).join(', ') || 'none'));
  return house.id;
}

export function rankListings(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('No commodity listings returned');
  const byItem = new Map();
  for (const row of rows) {
    const id = row?.item?.id;
    const quantity = row?.quantity;
    const price = row?.unit_price;
    // The commodities endpoint supplies per-unit prices. Skip price variants.
    if (!positive(id) || !positive(quantity) || quantity > 1_000_000 || !positive(price) ||
        price > maximumCopper || row.item.bonus_lists?.length) continue;
    const entries = byItem.get(id) ?? [];
    entries.push({ price, quantity });
    byItem.set(id, entries);
  }
  if (!byItem.size) throw new Error('Forever commodity price fields could not be read');
  const picks = [];
  for (const [id, listings] of byItem) {
    if (listings.length < 8) continue;
    listings.sort((a, b) => a.price - b.price);
    const total = listings.reduce((sum, listing) => sum + listing.quantity, 0);
    if (total < 30) continue;
    let count = 0;
    const reference = listings.find(listing => (count += listing.quantity) >= total / 2).price;
    const buy = listings[0].price;
    const quantity = listings.filter(listing => listing.price === buy).reduce((n, listing) => n + listing.quantity, 0);
    const estimatedProfit = Math.floor(reference * 0.95) - buy;
    const belowReference = listings.filter(listing => listing.price < reference).reduce((n, listing) => n + listing.quantity, 0);
    if (estimatedProfit >= buy * 0.15 && quantity <= 20 && belowReference <= 20) {
      picks.push({ id, buy, reference, quantity, estimatedProfit });
    }
  }
  return picks.sort((a, b) => b.estimatedProfit - a.estimatedProfit).slice(0, 10);
}

async function get(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error(`Blizzard HTTP ${response.status} at ${new URL(url).pathname}`);
  return response;
}

async function refresh(destination, previousFile) {
  const id = process.env.WOW_BLIZZARD_CLIENT_ID;
  const secret = process.env.WOW_BLIZZARD_CLIENT_SECRET;
  if (!id && !secret) {
    console.log('WoW Forever feed disabled until Blizzard API credentials are configured');
    return;
  }
  if (!id || !secret) throw new Error('Both Blizzard API credentials are required');
  // Keep a recent published snapshot on unrelated site builds to avoid rereading the market.
  if (previousFile) {
    const previous = readMarket(JSON.parse(await readFile(previousFile, 'utf8')));
    if (previous.status === 'ready' && Date.now() - Date.parse(previous.observedAt) < 20 * hours &&
        (!process.env.WOW_FOREVER_HORDE_HOUSE_ID || String(previous.houseId) === process.env.WOW_FOREVER_HORDE_HOUSE_ID)) {
      await writeFile(destination, JSON.stringify(previous) + '\n');
      return;
    }
  }
  const tokenRequest = await get('https://oauth.battle.net/token', {
    method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials',
  });
  const { access_token: token } = await tokenRequest.json();
  if (typeof token !== 'string' || !token) throw new Error('Blizzard token response is invalid');
  function request(path, kind = 'dynamic', locale = 'en_US') {
    const url = new URL(path, apiHost);
    url.searchParams.set('namespace', kind + '-forever-kr');
    url.searchParams.set('locale', locale);
    return get(url, { headers: { Authorization: 'Bearer ' + token } });
  }
  const endpoint = '/data/wow/ruleset/1/auctions/';
  const houseId = pickHouse(await (await request(endpoint + 'index')).json(), process.env.WOW_FOREVER_HORDE_HOUSE_ID);
  const response = await request(endpoint + houseId + '/commodities');
  const stamp = new Date(response.headers.get('last-modified') ?? Date.now());
  if (!Number.isFinite(stamp.getTime())) throw new Error('Invalid auction timestamp');
  const { auctions } = await response.json();
  const candidates = rankListings(auctions);
  const picks = await Promise.all(candidates.map(async item => {
    let name = '아이템 #' + item.id;
    try {
      const data = await (await request('/data/wow/item/' + item.id, 'static', 'ko_KR')).json();
      if (typeof data.name === 'string' && data.name.trim()) name = data.name.slice(0, 120);
    } catch {
      // Forever's item endpoint can lag the auction feed.
    }
    return { ...item, name };
  }));
  const result = readMarket({ schemaVersion: 1, game: 'wow-forever', region: 'kr', faction: 'horde',
    status: 'ready', feeBps: 500, houseId, observedAt: stamp.toISOString(), picks });
  await writeFile(destination, JSON.stringify(result) + '\n');
  console.log(`Collected ${picks.length} listing-based candidates from KR Horde house ${houseId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await refresh(process.argv[2], process.argv[3]);
}
