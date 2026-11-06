/**
 * Provably-fair Digital Bunot.
 *
 * MUST stay identical to `public.seeded_shuffle` in supabase/migrations/0001_init.sql:
 *   1. sort items ascending (lowercase uuid strings)
 *   2. for i = n-1 down to 1:
 *        j = parseInt(sha256(`${seed}:${i}`).slice(0, 7), 16) % (i + 1)
 *        swap(items[i], items[j])
 *
 * Kept dependency-free (the hasher is injected) so it can run in Node tests
 * and in the app (expo-crypto).
 */

export type Sha256Hex = (input: string) => Promise<string> | string;

export async function seededShuffle(seed: string, items: string[], sha256: Sha256Hex): Promise<string[]> {
  const arr = items.map((s) => s.toLowerCase()).sort();
  for (let i = arr.length - 1; i >= 1; i--) {
    const hex = await sha256(`${seed}:${i}`);
    const j = parseInt(hex.slice(0, 7), 16) % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export type VerifyResult = {
  hashMatches: boolean;
  orderMatches: boolean;
  computedOrder: string[];
};

/** Re-run the draw locally and compare with what the server published. */
export async function verifyDraw(
  params: { seed: string; seedHash: string; slotGroups: string[]; publishedOrder: string[] },
  sha256: Sha256Hex,
): Promise<VerifyResult> {
  const hashMatches = (await sha256(params.seed)).toLowerCase() === params.seedHash.toLowerCase();
  const computedOrder = await seededShuffle(params.seed, params.slotGroups, sha256);
  const published = params.publishedOrder.map((s) => s.toLowerCase());
  const orderMatches =
    computedOrder.length === published.length && computedOrder.every((g, i) => g === published[i]);
  return { hashMatches, orderMatches, computedOrder };
}
