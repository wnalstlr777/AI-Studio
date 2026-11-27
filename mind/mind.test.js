import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { domains, ringFractions } from './domains.js';
import { readPublicSummary } from './public-summary.js';

const summary = JSON.parse(readFileSync(new URL('./survival-summary.json', import.meta.url)));

test('public data accepts the actual snapshot and rejects extra fields at every level', () => {
  assert.equal(readPublicSummary(summary), summary);
  for (const target of [data => data, data => data.survival, data => data.survival.evaluation]) {
    const invalid = structuredClone(summary);
    target(invalid).extra = 'private';
    assert.throws(() => readPublicSummary(invalid));
  }
  assert.throws(() => readPublicSummary({ ...summary, savedDay: '2026-02-30' }));
});

test('the fixed experience arc does not shrink as counts cross a former scale boundary', () => {
  const survival = domains.find(domain => domain.id === 'survival');
  const fraction = experience => ringFractions(survival, { experience, ability: 2 }).experience;
  assert.ok(fraction(101) > fraction(100));
  assert.ok(fraction(901) > fraction(900));
  assert.equal(fraction(survival.experienceMax + 1), 1);
  assert.deepEqual(ringFractions(survival), { experience: 0, ability: 0 });
});
