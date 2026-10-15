/** A bounded scheduling algorithm, not a solver or authority issuer.
 * Each cardinality receives one lexicographic support per round. Later cheap
 * atoms cannot be starved by all triples of the earliest atoms. The caller's
 * original tick owns generation and its consumer owns the total support cap. */
export const BOUNDED_SUPPORT_INTERLEAVER_POLICY = /* @__PURE__ */ Object.freeze({
  version: "bounded-support-interleaver/1", maxAtoms: 58, maxSupportSize: 8,
  schedule: "ONE_LEXICOGRAPHIC_SUPPORT_PER_CARDINALITY_PER_ROUND",
  authorityGranted: false, mathematicalAcceptanceGranted: false,
});

export function* interleaveBoundedSupports(atoms: number, minimumSize: number, maximumSize: number,
  tick: () => void): Generator<readonly number[], void, unknown> {
  if (typeof tick !== "function") throw Error("support_interleaver_owner");
  tick();
  if (!Number.isSafeInteger(atoms) || atoms < 1 || atoms > BOUNDED_SUPPORT_INTERLEAVER_POLICY.maxAtoms
    || !Number.isSafeInteger(minimumSize) || !Number.isSafeInteger(maximumSize)
    || minimumSize < 1 || minimumSize > maximumSize || maximumSize > atoms
    || maximumSize > BOUNDED_SUPPORT_INTERLEAVER_POLICY.maxSupportSize) throw Error("support_interleaver_contract");
  function* combinations(prefix: readonly number[], start: number, remaining: number): Generator<readonly number[], void, unknown> {
    tick();
    if (!remaining) {yield Object.freeze([...prefix]); return;}
    for (let i = start; i <= atoms - remaining; i++) {
      tick(); yield* combinations([...prefix, i], i + 1, remaining - 1);
    }
  }
  const streams = [];
  for (let size = minimumSize; size <= maximumSize; size++) {
    tick(); streams.push({iterator: combinations([], 0, size), done: false});
  }
  try {
    let active = streams.length;
    while (active) for (const stream of streams) {
      tick(); if (stream.done) continue;
      const item = stream.iterator.next();
      if (item.done === true) {stream.done = true; active--;}
      else yield item.value;
    }
  } finally {
    // Closing an interrupted generator releases its bounded stacks. It neither
    // executes a remaining search nor renews an expired/revoked owner's tick.
    for (const stream of streams) stream.iterator.return();
  }
}
