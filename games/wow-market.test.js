import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyMethods, pickHouse, rankListings } from '../scripts/refresh-wow-market.mjs';

test('only a verified Horde house is selected, and ambiguity requires an explicit ID', () => {
  const index = { auctions: [{ id: 99, name: 'Alliance Auction House' },
    { id: 10, name: 'Horde Auction House' }, { id: 11, name: '호드 경매장' }] };
  assert.throws(() => pickHouse(index), /10, 11/);
  assert.throws(() => pickHouse(index, '99'), /verified/);
  assert.equal(pickHouse(index, '11'), 11);
  assert.equal(pickHouse({ auctions: index.auctions.slice(0, 2) }), 10);
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
