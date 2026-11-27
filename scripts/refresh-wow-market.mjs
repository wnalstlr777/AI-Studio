import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readMarket, farmItems } from '../games/market-data.js';

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

function indexListings(rows) {
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
  for (const listings of byItem.values()) listings.sort((a, b) => a.price - b.price);
  if (!byItem.size) throw new Error('Forever commodity price fields could not be read');
  return byItem;
}

export function rankListings(rows) {
  return rankFlips(indexListings(rows));
}

function rankFlips(byItem) {
  const picks = [];
  for (const [id, listings] of byItem) {
    if (listings.length < 8) continue;
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

function rankFarm(byItem) {
  return Object.keys(farmItems).map(Number).flatMap(id => {
    const listings = byItem.get(id);
    if (!listings || listings.length < 3) return [];
    const buy = listings[0].price;
    return [{ id, buy, net: Math.floor(buy * 0.95) }];
  }).sort((a, b) => b.net - a.net).slice(0, 3);
}

function buyCost(listings, quantity) {
  let paid = 0;
  for (const listing of listings ?? []) {
    const take = Math.min(quantity, listing.quantity);
    paid += take * listing.price;
    quantity -= take;
    if (!quantity) return paid;
  }
  return null;
}

function rankCraft(byItem, recipes) {
  return recipes.flatMap(recipe => {
    const output = byItem.get(recipe.output);
    if (!output || output.length < 3) return [];
    let cost = 0;
    for (const material of recipe.materials) {
      const paid = buyCost(byItem.get(material.id), material.quantity);
      if (paid === null) return [];
      cost += paid;
    }
    const receipt = Math.floor(output[0].price * recipe.quantity * 0.95);
    const profit = receipt - cost;
    return profit > 0 ? [{ name: recipe.name, quantity: recipe.quantity, cost, receipt, profit }] : [];
  }).sort((a, b) => b.profit - a.profit).slice(0, 3);
}

export function dailyMethods(rows, recipes) {
  const market = indexListings(rows);
  return { farm: rankFarm(market), craft: rankCraft(market, recipes), flips: rankFlips(market) };
}

// Candidate IDs are only starting points. Every recipe must resolve in the
// current Forever namespace with the expected output and deterministic yield.
const recipeCandidates = [
  [10097, 3860], [16153, 12359],
  [17553, 13443], [17557, 13454], [17577, 13461], [24367, 20008],
];

async function getRecipes(request) {
  const recipes = [];
  for (const [recipeId, output] of recipeCandidates) {
    try {
      const recipe = await (await request('/data/wow/recipe/' + recipeId, 'static', 'ko_KR')).json();
      const amount = recipe.crafted_quantity;
      const quantity = amount?.value ?? (amount?.minimum === amount?.maximum ? amount?.minimum : null);
      if (recipe.crafted_item?.id !== output || !positive(quantity) || quantity > 100 ||
          typeof recipe.name !== 'string' || !recipe.name.trim() ||
          !Array.isArray(recipe.reagents) || !recipe.reagents.length ||
          !recipe.reagents.every(row => positive(row.reagent?.id) && positive(row.quantity) && row.quantity <= 100) ||
          new Set(recipe.reagents.map(row => row.reagent.id)).size !== recipe.reagents.length) continue;
      recipes.push({ output, quantity, name: recipe.name.slice(0, 120),
        materials: recipe.reagents.map(row => ({ id: row.reagent.id, quantity: row.quantity })) });
    } catch {
      // An unconfirmed recipe is excluded from recommendations.
    }
  }
  return recipes;
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
    if (previous.status === 'ready' && previous.farm && previous.craft && Date.now() - Date.parse(previous.observedAt) < 20 * hours &&
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
  const recipes = await getRecipes(request);
  const { farm, craft, flips } = dailyMethods(auctions, recipes);
  const picks = await Promise.all(flips.map(async item => {
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
    status: 'ready', feeBps: 500, houseId, observedAt: stamp.toISOString(), picks, farm, craft, recipesChecked: recipes.length });
  await writeFile(destination, JSON.stringify(result) + '\n');
  console.log(`Collected ${picks.length} listing-based candidates from KR Horde house ${houseId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await refresh(process.argv[2], process.argv[3]);
}
