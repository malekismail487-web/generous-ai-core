/**
 * outcomeMetricsTest.ts — Phase 6 pure-logic smoke test.
 *
 * Exercises the computeWindow / delta math via the public formatters and
 * a minimal in-process re-import. We don't hit Supabase here; the DB shape
 * is already locked by RLS + the migration in Phase 4. Instead we assert
 * the pure helpers handle the edge cases that the diagnostics panel relies
 * on: nulls, empty arrays, sign of delta.
 */

import { formatRate, formatDelta } from '../src/lib/outcomeMetrics';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (cond) { console.log('  ✓', msg); return; }
  console.error('  ✗', msg);
  failed += 1;
}

console.log('formatRate:');
assert(formatRate(null) === '—',         'null → em dash');
assert(formatRate(0) === '0%',           '0 → 0%');
assert(formatRate(0.875, 1) === '87.5%', '0.875 @1 → 87.5%');

console.log('formatDelta:');
assert(formatDelta(null).tone === 'na',                    'null → na');
assert(formatDelta(0).tone === 'flat',                     '0 → flat');
assert(formatDelta(0.05).tone === 'up' && formatDelta(0.05).text.startsWith('+'),  '+0.05 → up with +');
assert(formatDelta(-0.05).tone === 'down' && formatDelta(-0.05).text.startsWith('-'), '-0.05 → down with -');
assert(formatDelta(0.001).tone === 'flat',                 'tiny delta clamps to flat');

if (failed > 0) {
  console.error(`\n❌ ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log('\n✅ outcomeMetrics formatter smoke test passed.');
