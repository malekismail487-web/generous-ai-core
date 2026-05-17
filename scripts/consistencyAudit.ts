/**
 * consistencyAudit.ts — Phase 6
 *
 * Static audit that scans the codebase and reports, per AI-producing
 * surface, which Phase 1–5 contracts it satisfies:
 *
 *   - Adaptive context injection: imports useAdaptiveIntelligence / getContext
 *   - Behavioral recording      : calls recordAnswer | recordChat | recordActivity
 *   - Validator wired           : imports adaptiveValidator (Phase 1/2)
 *   - Helpfulness feedback      : mounts <HelpfulnessFeedback> (Phase 4)
 *   - Profile-bus aware         : reads profileVersion or calls bumpProfile (Phase 3)
 *
 * Output is a Markdown matrix written to /tmp/consistency-audit.md and a
 * non-zero exit code if any *required* contract is missing for a tracked
 * surface. Helpfulness coverage is reported but NOT required (Phase 4b
 * cleanup is still tracked in plan.md).
 *
 * Run:   bun run scripts/consistencyAudit.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Surface {
  name: string;
  file: string;
  requiresFeedback: boolean; // long-form generative output → should mount HelpfulnessFeedback
}

const SURFACES: Surface[] = [
  { name: 'LectureGenerator',  file: 'src/components/student/LectureGenerator.tsx', requiresFeedback: true  },
  { name: 'StudyBuddy',        file: 'src/components/student/StudyBuddy.tsx',       requiresFeedback: true  },
  { name: 'AIStudyPlan',       file: 'src/components/student/AIStudyPlan.tsx',      requiresFeedback: true  },
  { name: 'FileNotesGenerator',file: 'src/components/FileNotesGenerator.tsx',       requiresFeedback: true  },
  { name: 'PracticeQuiz',      file: 'src/components/PracticeQuiz.tsx',             requiresFeedback: false },
  { name: 'FlashcardsSection', file: 'src/components/FlashcardsSection.tsx',        requiresFeedback: false },
  { name: 'ExaminationSection',file: 'src/components/ExaminationSection.tsx',       requiresFeedback: false },
  { name: 'SATSection',        file: 'src/components/SATSection.tsx',               requiresFeedback: false },
  { name: 'SubjectsSection',   file: 'src/components/SubjectsSection.tsx',          requiresFeedback: false },
];

interface Result {
  surface: Surface;
  exists: boolean;
  hasAdaptiveContext: boolean;
  hasRecording: boolean;
  hasValidator: boolean;
  hasFeedback: boolean;
  hasBusAwareness: boolean;
}

function audit(s: Surface): Result {
  let src = '';
  let exists = true;
  try {
    src = readFileSync(join(process.cwd(), s.file), 'utf8');
  } catch {
    exists = false;
  }

  const has = (pat: RegExp) => exists && pat.test(src);

  return {
    surface: s,
    exists,
    hasAdaptiveContext: has(/useAdaptiveIntelligence|generateAdaptiveContext|getSimpleAdaptiveParams/),
    hasRecording:       has(/recordAnswer|recordChat|recordActivity|recordIntelligentAnswer|recordChatMessage|recordStudyActivity/),
    hasValidator:       has(/adaptiveValidator|validateAdaptiveOutput/),
    hasFeedback:        has(/HelpfulnessFeedback|recordHelpfulness/),
    hasBusAwareness:    has(/profileVersion|bumpProfile|invalidateProfile/),
  };
}

function mark(b: boolean): string { return b ? '✅' : '❌'; }

function main(): void {
  const results = SURFACES.map(audit);

  const lines: string[] = [];
  lines.push('# Cross-feature consistency audit — Phase 6');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('| Surface | Context | Recording | Validator | Feedback | Bus |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of results) {
    if (!r.exists) {
      lines.push(`| ${r.surface.name} | _file missing_ |  |  |  |  |`);
      continue;
    }
    lines.push(
      `| ${r.surface.name} | ${mark(r.hasAdaptiveContext)} | ${mark(r.hasRecording)} | ${mark(r.hasValidator)} | ${mark(r.hasFeedback)}${r.surface.requiresFeedback ? '' : ' *(opt)*'} | ${mark(r.hasBusAwareness)} |`,
    );
  }
  lines.push('');

  // Required contracts: every surface that exists must inject adaptive context.
  // requiresFeedback surfaces SHOULD mount HelpfulnessFeedback, but we only
  // warn — full migration is Phase 4b cleanup tracked in plan.md.
  const missingRequired = results.filter((r) => r.exists && !r.hasAdaptiveContext);
  const missingFeedback = results.filter((r) => r.exists && r.surface.requiresFeedback && !r.hasFeedback);
  const missingFiles    = results.filter((r) => !r.exists);

  lines.push('## Required (Phase 1–5) — must pass');
  if (missingRequired.length === 0 && missingFiles.length === 0) {
    lines.push('All tracked surfaces inject adaptive context. ✅');
  } else {
    for (const r of missingFiles) lines.push(`- ❌ ${r.surface.name}: file not found at \`${r.surface.file}\``);
    for (const r of missingRequired) lines.push(`- ❌ ${r.surface.name}: missing useAdaptiveIntelligence / context injection`);
  }
  lines.push('');
  lines.push('## Warnings (Phase 4b — helpfulness coverage)');
  if (missingFeedback.length === 0) {
    lines.push('All long-form generative surfaces mount HelpfulnessFeedback. ✅');
  } else {
    for (const r of missingFeedback) lines.push(`- ⚠️ ${r.surface.name}: missing <HelpfulnessFeedback>`);
  }

  const out = lines.join('\n');
  // eslint-disable-next-line no-console
  console.log(out);

  try {
    // Write artifact for posterity
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs');
    fs.writeFileSync('/tmp/consistency-audit.md', out);
  } catch { /* ignore */ }

  const failed = missingRequired.length + missingFiles.length;
  if (failed > 0) {
    console.error(`\n❌ ${failed} required contract(s) missing.`);
    process.exit(1);
  }
  console.log(`\n✅ Required contracts satisfied. (${missingFeedback.length} feedback warning(s) — Phase 4b cleanup.)`);
}

main();
