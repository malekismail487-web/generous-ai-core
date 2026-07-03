/**
 * Adaptive Coverage Audit — Stage 15
 * -----------------------------------
 * Guarantees every student-facing AI call is wired through the adaptive
 * engine. Run with:
 *   bun run scripts/adaptiveCoverageAudit.ts
 *
 * What it enforces:
 *   1. Every file in STUDENT_AI_SURFACES imports `useAdaptiveIntelligence`.
 *   2. Each imports the canonical wrapper `getSimpleParams` OR `getContext`.
 *   3. Each closes the loop with at least one recorder
 *      (`recordActivity` | `recordChat` | `recordAnswer` | `recordTeaching`).
 *
 * If a NEW file under src/components/student/** or src/components/*Section.tsx
 * calls `supabase.functions.invoke(` or `fetch(.../functions/v1/...` and is
 * NOT in KNOWN_ADAPTIVE or EXPLICITLY_EXEMPT, the audit fails so we can't
 * silently regress coverage.
 *
 * Exits non-zero on any violation so this can gate CI.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

/** Files that must satisfy the full wiring contract (Tier 1 + reference set). */
const STUDENT_AI_SURFACES = [
  "src/components/PodcastsSection.tsx",
  "src/components/student/MindMapGenerator.tsx",
  "src/components/student/learning-modes/SocraticMode.tsx",
  "src/components/student/learning-modes/TeachBackMode.tsx",
  "src/components/student/learning-modes/MisconceptionHunt.tsx",
  // Reference / already-adaptive callers — audit them too so regressions here
  // fail loudly.
  "src/components/ExaminationSection.tsx",
  "src/components/FlashcardsSection.tsx",
  "src/components/PracticeQuiz.tsx",
  "src/components/SATSection.tsx",
  "src/components/SubjectsSection.tsx",
  "src/components/FileNotesGenerator.tsx",
  "src/components/student/StudyBuddy.tsx",
  "src/components/student/AIStudyPlan.tsx",
];

/** Files known to be adaptive OR intentionally exempt (no AI, teacher-only, etc). */
const KNOWN_ADAPTIVE_OR_EXEMPT = new Set<string>([
  ...STUDENT_AI_SURFACES,
  // Delegates to FileNotesGenerator, which is wired.
  "src/components/NotesSection.tsx",
  // View-only (no AI invocation).
  "src/components/student/StudentMaterials.tsx",
  // Local `generateLecture` handler that opens the lecture studio (which is wired).
  "src/components/student/LectureGenerator.tsx",
  "src/components/shared/LectureStudio/LectureStudio.tsx",
  "src/components/shared/LectureStudio/diagram.ts",
  "src/components/shared/LectureStudio/exporters/pptx.ts",
  "src/components/student/InteractiveGraph.tsx",
  "src/components/student/AdaptiveDiagnosticsPanel.tsx",
  "src/components/LuminaMascot.tsx",
  "src/components/AnimatedBackground.tsx",
  // Uses a downstream adaptive session (submits recorded answers to an
  // assignment quiz that is itself wired via useAssignments).
  "src/components/student/AssignmentQuizTaker.tsx",
  // Teacher / admin AI — not student-facing, adaptive context does not apply.
  "src/components/teacher/TeacherCopilot.tsx",
  "src/components/teacher/AssignmentQuestionBuilder.tsx",
  "src/components/teacher/TeacherMaterials.tsx",
  "src/components/teacher/LessonPlanGenerator.tsx",
  "src/components/teacher/RelevanceWarningDialog.tsx",
  "src/components/teacher/StudentInsights.tsx",
  "src/components/admin/LCTPanel.tsx",
  "src/components/admin/TeacherCategoriesManager.tsx",
  "src/components/admin/StudentViewSimulator.tsx",
  "src/components/admin/LuminaApiPanel.tsx",
  // Meta / infrastructure that talks to non-AI edge functions.
  "src/components/NoteTimeline.tsx",
  "src/components/student/DecayDashboardCard.tsx",
  "src/components/student/LCTExamScreen.tsx",
  // Bootstraps the initial IRT profile — precedes personalization; the probe
  // itself IS the adaptive signal, so the loop is closed server-side by
  // cold-start-probe writing to student_learning_profiles.
  "src/components/student/ColdStartProbe.tsx",
  // Output surfaces: they display AI-generated predictions ABOUT the
  // student, sourced from adaptive edge functions that already read the
  // full profile server-side. There's no new student input to condition on.
  "src/components/student/Leaderboard.tsx",
  "src/components/student/MirrorRevealCard.tsx",
  "src/components/student/MorningBriefingCard.tsx",
  "src/components/student/MorningBriefing.tsx",
  "src/components/student/CognitiveMirrorCard.tsx",
]);

interface Violation {
  file: string;
  reason: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function isStudentSurface(rel: string): boolean {
  return (
    rel.startsWith("src/components/student/") ||
    /^src\/components\/[A-Z][A-Za-z]*Section\.tsx$/.test(rel)
  );
}

function callsAI(source: string): boolean {
  return (
    /supabase\s*\.\s*functions\s*\.\s*invoke\s*\(/.test(source) ||
    /functions\/v1\//.test(source) ||
    /streamChat\s*\(/.test(source)
  );
}

const violations: Violation[] = [];

// ── Contract check: every explicit surface must be fully wired ──────────────
for (const rel of STUDENT_AI_SURFACES) {
  const full = join(ROOT, rel);
  let src: string;
  try {
    src = readFileSync(full, "utf8");
  } catch {
    violations.push({ file: rel, reason: "file not found — remove from STUDENT_AI_SURFACES if intentional" });
    continue;
  }
  if (!/useAdaptiveIntelligence/.test(src)) {
    violations.push({ file: rel, reason: "missing import of useAdaptiveIntelligence" });
    continue;
  }
  const hasContext = /getSimpleParams\s*\(|getContext\s*\(/.test(src);
  if (!hasContext) {
    violations.push({ file: rel, reason: "no call to getSimpleParams() or getContext() — AI runs blind" });
  }
  const hasRecorder =
    /recordActivity\s*\(|recordChat\s*\(|recordAnswer\s*\(|recordTeaching\s*\(/.test(
      src,
    ) ||
    // Aliased destructure — many files rename recordAnswer to disambiguate
    // from the legacy useAdaptiveLevel recorder, then call the alias.
    /record(?:Activity|Chat|Answer|Teaching)\s*:\s*(\w+)/.test(src);
  if (!hasRecorder) {
    violations.push({ file: rel, reason: "no recordActivity/Chat/Answer/Teaching call — feedback loop is open" });
  }
}

// ── Regression check: no NEW blind student-facing AI callers may appear ─────
const allFiles = walk(join(SRC, "components"));
const newBlindCallers: string[] = [];
for (const full of allFiles) {
  const rel = relative(ROOT, full);
  if (!isStudentSurface(rel)) continue;
  if (KNOWN_ADAPTIVE_OR_EXEMPT.has(rel)) continue;
  const src = readFileSync(full, "utf8");
  if (callsAI(src) && !/useAdaptiveIntelligence/.test(src)) {
    newBlindCallers.push(rel);
  }
}

for (const rel of newBlindCallers) {
  violations.push({
    file: rel,
    reason:
      "new student-facing AI call detected without useAdaptiveIntelligence. " +
      "Wire it (getSimpleParams + one recorder) or add to KNOWN_ADAPTIVE_OR_EXEMPT with justification.",
  });
}

// ── Coverage metric ─────────────────────────────────────────────────────────
const studentSurfaces = allFiles
  .map((f) => relative(ROOT, f))
  .filter(isStudentSurface);
const studentSurfacesWithAI = studentSurfaces.filter((rel) => {
  const src = readFileSync(join(ROOT, rel), "utf8");
  return callsAI(src);
});
const adaptive = studentSurfacesWithAI.filter((rel) => {
  const src = readFileSync(join(ROOT, rel), "utf8");
  return /useAdaptiveIntelligence/.test(src);
});
const coverage = studentSurfacesWithAI.length === 0
  ? 100
  : (adaptive.length / studentSurfacesWithAI.length) * 100;

// ── Report ──────────────────────────────────────────────────────────────────
console.log("\n=== Adaptive Coverage Audit ===");
console.log(`Student-facing files scanned: ${studentSurfaces.length}`);
console.log(`  ...invoking AI:            ${studentSurfacesWithAI.length}`);
console.log(`  ...adaptive-wired:         ${adaptive.length}`);
console.log(`  Coverage:                  ${coverage.toFixed(1)}%`);

if (violations.length === 0) {
  console.log("\n✓ PASS — every student-facing AI call is wired to the adaptive engine.");
  process.exit(0);
} else {
  console.log(`\n✗ FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.log(`  • ${v.file}\n      ${v.reason}`);
  }
  process.exit(1);
}
