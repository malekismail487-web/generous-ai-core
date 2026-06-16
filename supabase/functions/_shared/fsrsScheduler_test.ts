import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyFuzz,
  detectLeech,
  priorityScore,
  optimalRequestRetention,
  smoothWorkload,
  LEECH_LAPSE_THRESHOLD,
} from "./fsrsScheduler.ts";
import { newFsrsCard } from "./fsrs.ts";

Deno.test("fuzz: sub-day intervals are not fuzzed (in-session)", () => {
  assertEquals(applyFuzz(0.5, "any"), 0.5);
});

Deno.test("fuzz: same seed → same value (deterministic)", () => {
  const a = applyFuzz(10, "card-42:7");
  const b = applyFuzz(10, "card-42:7");
  assertEquals(a, b);
});

Deno.test("fuzz: stays within published Anki band (±15% for 1–6d)", () => {
  for (let i = 0; i < 200; i++) {
    const v = applyFuzz(5, `seed-${i}`);
    assert(v >= 5 * 0.85 - 1e-9 && v <= 5 * 1.15 + 1e-9, `out of band: ${v}`);
  }
});

Deno.test("fuzz: long intervals use the tighter ±5% band", () => {
  for (let i = 0; i < 200; i++) {
    const v = applyFuzz(365, `s-${i}`);
    assert(v >= 365 * 0.95 - 1e-9 && v <= 365 * 1.05 + 1e-9);
  }
});

Deno.test("leech: under threshold → not a leech", () => {
  const c = { ...newFsrsCard(), lapses: LEECH_LAPSE_THRESHOLD - 1 };
  const r = detectLeech(c, 1_000_000);
  assertEquals(r.isLeech, false);
  assertEquals(r.suspendedUntilMs, null);
});

Deno.test("leech: at threshold → flagged and suspended ~1 day", () => {
  const now = 1_700_000_000_000;
  const c = { ...newFsrsCard(), lapses: LEECH_LAPSE_THRESHOLD };
  const r = detectLeech(c, now);
  assertEquals(r.isLeech, true);
  assert(r.suspendedUntilMs! - now >= 86_400_000 - 1);
});

Deno.test("priority: leech severely overdue beats fresh barely-due", () => {
  const leech = priorityScore({
    retrievability: 0.2, overdueDays: 30, stability: 5,
    difficulty: 9, lapses: 12, isLeech: true,
  });
  const fresh = priorityScore({
    retrievability: 0.9, overdueDays: 0.1, stability: 5,
    difficulty: 3, lapses: 0, isLeech: false,
  });
  assert(leech > fresh, `expected leech (${leech}) > fresh (${fresh})`);
});

Deno.test("priority: monotonic in overdueness", () => {
  const base = {
    retrievability: 0.5, stability: 5, difficulty: 5, lapses: 0, isLeech: false,
  } as const;
  const a = priorityScore({ ...base, overdueDays: 1 });
  const b = priorityScore({ ...base, overdueDays: 5 });
  const c = priorityScore({ ...base, overdueDays: 30 });
  assert(a < b && b <= c);
});

Deno.test("optimalRequestRetention: cheap-lapse → lower R, expensive-lapse → higher R", () => {
  const cheap = optimalRequestRetention(1.5);
  const exp = optimalRequestRetention(20);
  assert(cheap < exp, `cheap=${cheap} exp=${exp}`);
  assert(cheap >= 0.70 && cheap <= 0.97);
  assert(exp   >= 0.70 && exp   <= 0.97);
});

Deno.test("optimalRequestRetention: published default cost-ratio ≈ 3..5 → R near 0.85..0.92", () => {
  const r = optimalRequestRetention(4);
  assert(r >= 0.82 && r <= 0.95, `unexpected R=${r}`);
});

Deno.test("smoothWorkload: respects daily cap", () => {
  const now = 1_700_000_000_000;
  const cards = Array.from({ length: 30 }, (_, i) => ({
    cardId: `c${i}`,
    dueAtMs: now + 60_000,        // all due today
    priority: i / 30,             // increasing
  }));
  const smoothed = smoothWorkload(cards, 10, now);
  const buckets = new Map<number, number>();
  for (const c of smoothed) {
    const day = Math.floor((c.dueAtMs - now) / 86_400_000);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  for (const [, n] of buckets) assert(n <= 10, `bucket overflow: ${n}`);
});

Deno.test("smoothWorkload: highest-priority cards stay on their original day", () => {
  const now = 1_700_000_000_000;
  const cards = Array.from({ length: 15 }, (_, i) => ({
    cardId: `c${i}`,
    dueAtMs: now,
    priority: i,
  }));
  const smoothed = smoothWorkload(cards, 5, now);
  // Top-5 priority items should still be on day 0.
  const top = smoothed.filter(c => Number(c.cardId.slice(1)) >= 10);
  for (const t of top) {
    const day = Math.floor((t.dueAtMs - now) / 86_400_000);
    assertEquals(day, 0, `top priority ${t.cardId} got deferred`);
  }
});
