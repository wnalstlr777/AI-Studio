import assert from 'node:assert/strict';
import test from 'node:test';
import { auctionRows, dailyMethods, rankListings, selectBusiestHouse } from '../scripts/refresh-wow-market.mjs';

test('selects the busiest Horde house using unique auction IDs, or fails on incomplete coverage', async () => {
  const index = { auctions: [{ id: 99, name: 'Alliance Auction House' },
    { id: 10, name: 'Horde Auction House' }, { id: 11, name: '호드 경매장' }] };
  const called = [];
  const result = await selectBusiestHouse(index, async id => {
    called.push(id);
    return { listings: [{ id: 1 }], commodities: id === 10 ? [{ id: 1 }, { id: 2 }] : [{ id: 2 }, { id: 3 }] };
  });
  assert.deepEqual(called, [10, 11]);
  assert.equal(result.houseId, 11);
  assert.equal(result.listingCount, 3);
  assert.equal(result.comparedHouses, 2);
  assert.deepEqual(auctionRows({ _links: {} }), []);
  assert.throws(() => auctionRows({ error: 'Unexpected response' }), /Unrecognized/);
  await assert.rejects(selectBusiestHouse(index, async () => ({ listings: [], commodities: null })), /Invalid auction/);
});

test('only thin low-price tiers with positive margin survive', () => {
  const item = (id, unit_price, quantity) => ({ item: { id }, quantity, unit_price });
  const rows = [item(1, 100, 2), item(2, 100, 22), item(3, 190, 2)];
  for (let n = 0; n < 8; n++) rows.push(item(1, 200, 6), item(2, 200, 6), item(3, 200, 6));
  assert.deepEqual(rankListings(rows), [{ id: 1, buy: 100, reference: 200, quantity: 2, estimatedProfit: 90 }]);
});

test('the daily briefing compares gathering, crafting and flipping separately', () => {
  const listing = (id, unit_price, quantity) => ({ item: { id }, quantity, unit_price });
  const rows = [listing(3858, 100, 1), listing(3858, 200, 10), listing(3858, 300, 10),
    listing(3860, 500, 10), listing(3860, 600, 10), listing(3860, 700, 10)];
  for (let index = 0; index < 8; index++) rows.push(listing(1, 600, 5));
  rows.push(listing(1, 100, 2));
  const result = dailyMethods(rows, [
    { name: 'Mithril Bar', output: 3860, quantity: 1, materials: [{ id: 3858, quantity: 2 }] },
    { name: 'Missing reagent', output: 3860, quantity: 2, materials: [{ id: 500, quantity: 2 }] },
  ]);
  assert.deepEqual(result.farm, [{ id: 3858, buy: 100, net: 95 }]);
  assert.deepEqual(result.craft, [{ name: 'Mithril Bar', quantity: 1, cost: 300, receipt: 475, profit: 175 }]);
  assert.equal(result.flips[0].estimatedProfit, 470);
});

test('a conversion is ranked by one craft profit and carries reagent and cooldown details', () => {
  const row = (id, unit_price) => ({ item: { id }, quantity: 5, unit_price });
  const priced = [row(7082, 100), row(7078, 400), row(7078, 450), row(7078, 500)];
  const result = dailyMethods(priced, [{
    name: '바람 → 불', output: 7078, quantity: 1, cooldown: true,
    materials: [{ id: 7082, quantity: 1, name: '바람의 정수' }],
  }]);
  assert.deepEqual(result.craft, [{
    name: '바람 → 불', quantity: 1, cost: 100, receipt: 380, profit: 280, cooldown: true,
    materials: [{ id: 7082, quantity: 1, name: '바람의 정수' }],
  }]);
});
