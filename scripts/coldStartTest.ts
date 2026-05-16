/**
 * Phase 5 smoke test — verifies the cold-start mapping and gate logic
 * without touching Supabase. Run with: bunx tsx scripts/coldStartTest.ts
 */
import {
  shouldApplyColdStart,
} from '../src/lib/coldStartBootstrap';

let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log('  ✓', label);
  else { console.log('  ✗', label); failed++; }
}

console.log('Gate: brand-new student → applies');
assert(shouldApplyColdStart({ answerCount: 0, behaviorDataPoints: 0, hadExplicitLevelOverride: false }) === true, 'fresh user');

console.log('Gate: explicit per-subject profile already exists → skip');
assert(shouldApplyColdStart({ answerCount: 0, behaviorDataPoints: 0, hadExplicitLevelOverride: true }) === false, 'hadExplicitLevelOverride wins');

console.log('Gate: enough behavior → skip');
assert(shouldApplyColdStart({ answerCount: 0, behaviorDataPoints: 25, hadExplicitLevelOverride: false }) === false, '25 behavior points');

console.log('Gate: enough answers → skip');
assert(shouldApplyColdStart({ answerCount: 6, behaviorDataPoints: 0, hadExplicitLevelOverride: false }) === false, '6 answers');

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll Phase 5 gate assertions passed.');
