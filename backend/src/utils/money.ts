/** Money is calculated in integer cents to avoid floating point drift. */
export const toCents = (value: number) => Math.round((value + Number.EPSILON) * 100);
export const fromCents = (cents: number) => cents / 100;
export const round2 = (value: number) => fromCents(toCents(value));
export const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

/** PostgREST returns numeric columns as numbers or strings; normalise to number. */
export const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));

/**
 * Splits a total (in cents) across weights, largest-remainder method, so the
 * parts always add up to exactly the total.
 */
export function allocateCents(totalCents: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0 || totalCents === 0) return weights.map(() => 0);
  const raw = weights.map(weight => (totalCents * weight) / weightSum);
  const floored = raw.map(Math.floor);
  let remainder = totalCents - floored.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floored[index] += 1;
    remainder -= 1;
  }
  return floored;
}
