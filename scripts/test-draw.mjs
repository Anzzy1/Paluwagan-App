// Run: npm test   (Node 22.6+ strips TypeScript types natively)
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { seededShuffle, verifyDraw } from '../src/lib/draw.ts';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const items = Array.from({ length: 10 }, () => randomUUID());
const seed = 'a'.repeat(64);

// 1. deterministic
const a = await seededShuffle(seed, items, sha256);
const b = await seededShuffle(seed, [...items].reverse(), sha256);
assert.deepEqual(a, b, 'same seed + same set => same order (input order irrelevant)');

// 2. valid permutation
assert.equal(a.length, items.length);
assert.deepEqual([...a].sort(), [...items].sort(), 'result is a permutation');

// 3. different seed => (almost surely) different order
const c = await seededShuffle('b'.repeat(64), items, sha256);
assert.notDeepEqual(a, c, 'different seed changes order');

// 4. verify round-trip
const v = await verifyDraw({ seed, seedHash: sha256(seed), slotGroups: items, publishedOrder: a }, sha256);
assert.ok(v.hashMatches && v.orderMatches, 'verify passes for honest draw');
const tampered = [...a];
[tampered[0], tampered[1]] = [tampered[1], tampered[0]];
const v2 = await verifyDraw({ seed, seedHash: sha256(seed), slotGroups: items, publishedOrder: tampered }, sha256);
assert.ok(!v2.orderMatches, 'verify catches a tampered order');
const v3 = await verifyDraw({ seed, seedHash: sha256('x'), slotGroups: items, publishedOrder: a }, sha256);
assert.ok(!v3.hashMatches, 'verify catches a swapped seed');

// 5. rough fairness: each item lands in position 0 about 1/n of the time
const n = 5;
const small = Array.from({ length: n }, (_, i) => `0000000${i}-0000-0000-0000-000000000000`);
const counts = Object.fromEntries(small.map((s) => [s, 0]));
const trials = 4000;
for (let t = 0; t < trials; t++) counts[(await seededShuffle(`seed-${t}`, small, sha256))[0]]++;
for (const k of small) {
  const p = counts[k] / trials;
  assert.ok(Math.abs(p - 1 / n) < 0.03, `position-0 frequency ${p.toFixed(3)} ≈ ${1 / n}`);
}

// 6. Fixed vector shared with the SQL test (supabase/tests/draw_vector.sql)
const fixed = await seededShuffle('paluwagan', small, sha256);
console.log('fixed vector:', fixed.map((s) => s[7]).join(''));

console.log('✅ draw tests passed');
