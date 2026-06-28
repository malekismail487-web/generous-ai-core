// ════════════════════════════════════════════════════════════════════
// Stage 13 §3.2 — Curriculum Binding & Standards Alignment
//
// Pure resolution layer that maps an engine concept (subject + topic OR
// concept-id) to (standard, objective) pairs in the school's curriculum.
//
// Two responsibilities:
//   1. `resolveBindingCandidates` — read concept_standard_map and rank
//      candidate (standard, objective) pairs by alignment_strength.
//   2. `pickBinding` — deterministically choose the strongest candidate
//      (with stable tie-breaking on standard code) so the same lesson
//      always binds to the same objective.
//
// All ranking math is pure; IO is isolated in `loadConceptMappings`.
// ════════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface ConceptKeyInput {
  schoolId: string | null;
  subject: string;
  topic?: string | null;
  conceptId?: string | null;
}

export interface BindingCandidate {
  standardId: string;
  objectiveId: string | null;
  standardCode: string;
  objectiveCode: string | null;
  framework: string;
  textbookReference: string | null;
  alignmentStrength: number;
  rationale: string | null;
}

export interface BindingResult {
  candidates: BindingCandidate[];
  chosen: BindingCandidate | null;
  conceptKey: string;
}

// Canonical concept key. Stable formula:
//   conceptId if available, else `${subject}::${topic}` (topic blanked → '*').
export function buildConceptKey(input: ConceptKeyInput): string {
  if (input.conceptId && input.conceptId.trim().length > 0) return input.conceptId.trim();
  const subj = (input.subject ?? "").trim().toLowerCase();
  const topic = (input.topic ?? "*").trim().toLowerCase() || "*";
  return `${subj}::${topic}`;
}

// Deterministic tie-break: highest alignment_strength wins; ties broken
// by lexicographically smallest standardCode, then objectiveCode.
export function pickBinding(cands: readonly BindingCandidate[]): BindingCandidate | null {
  if (cands.length === 0) return null;
  const sorted = [...cands].sort((a, b) => {
    if (b.alignmentStrength !== a.alignmentStrength)
      return b.alignmentStrength - a.alignmentStrength;
    if (a.standardCode !== b.standardCode)
      return a.standardCode < b.standardCode ? -1 : 1;
    const ao = a.objectiveCode ?? "";
    const bo = b.objectiveCode ?? "";
    if (ao !== bo) return ao < bo ? -1 : 1;
    return 0;
  });
  return sorted[0];
}

// ─── IO layer (kept thin so the math above stays unit-testable) ───

export async function loadConceptMappings(
  admin: SupabaseClient,
  input: ConceptKeyInput,
): Promise<BindingCandidate[]> {
  const key = buildConceptKey(input);
  const { data, error } = await admin
    .from("concept_standard_map")
    .select(`
      standard_id, objective_id, alignment_strength, rationale,
      curriculum_standards!inner ( code, framework ),
      learning_objectives ( code, textbook_reference )
    `)
    .eq("concept_key", key)
    .eq("subject", input.subject)
    .or(`school_id.is.null,school_id.eq.${input.schoolId ?? "00000000-0000-0000-0000-000000000000"}`);

  if (error || !data) return [];
  return data.map((r: any) => ({
    standardId: r.standard_id,
    objectiveId: r.objective_id,
    standardCode: r.curriculum_standards?.code ?? "",
    objectiveCode: r.learning_objectives?.code ?? null,
    framework: r.curriculum_standards?.framework ?? "",
    textbookReference: r.learning_objectives?.textbook_reference ?? null,
    alignmentStrength: Number(r.alignment_strength ?? 0),
    rationale: r.rationale ?? null,
  }));
}

export async function resolveBinding(
  admin: SupabaseClient,
  input: ConceptKeyInput,
): Promise<BindingResult> {
  const cands = await loadConceptMappings(admin, input);
  return { candidates: cands, chosen: pickBinding(cands), conceptKey: buildConceptKey(input) };
}

// Audit-friendly persistence. Idempotent at (student_id, lesson_ref).
export async function recordLessonBinding(
  admin: SupabaseClient,
  args: {
    schoolId: string | null;
    studentId: string;
    subject: string;
    topic: string | null;
    lessonRef: string | null;
    binding: BindingResult;
    trace?: Record<string, unknown>;
  },
): Promise<void> {
  const { chosen } = args.binding;
  await admin.from("lesson_objective_bindings").insert({
    school_id: args.schoolId,
    student_id: args.studentId,
    subject: args.subject,
    topic: args.topic,
    lesson_ref: args.lessonRef,
    standard_id: chosen?.standardId ?? null,
    objective_id: chosen?.objectiveId ?? null,
    standard_code: chosen?.standardCode ?? null,
    objective_code: chosen?.objectiveCode ?? null,
    framework: chosen?.framework ?? null,
    textbook_reference: chosen?.textbookReference ?? null,
    alignment_trace: {
      concept_key: args.binding.conceptKey,
      candidate_count: args.binding.candidates.length,
      chosen_strength: chosen?.alignmentStrength ?? null,
      rationale: chosen?.rationale ?? null,
      ...(args.trace ?? {}),
    },
  });
}

export function _adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
