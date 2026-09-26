import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const school = '00000000-0000-4000-8000-000000000001';
const teacher = '00000000-0000-4000-8000-000000000002';
const student = '00000000-0000-4000-8000-000000000003';
const outsider = '00000000-0000-4000-8000-000000000004';
const plan = '00000000-0000-4000-8000-000000000005';
const otherSchool = '00000000-0000-4000-8000-000000000006';
const otherPlan = '00000000-0000-4000-8000-000000000007';
const admin = '00000000-0000-4000-8000-000000000008';
const studentTwo = '00000000-0000-4000-8000-000000000009';
const studentThree = '00000000-0000-4000-8000-000000000010';
const planTwo = '00000000-0000-4000-8000-000000000011';
const planThree = '00000000-0000-4000-8000-000000000012';
const prompt = 'Apply equivalent fractions to a new shopping example and explain each step.';
const criteria = 'Show that numerator and denominator change by the same factor.';

const db = await PGlite.create();
try {
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE ROLE authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE TYPE public.app_role AS ENUM ('teacher');
    CREATE TABLE public.schools(id uuid PRIMARY KEY);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, school_id uuid NOT NULL, is_active boolean NOT NULL);
    CREATE TABLE public.teacher_roles(user_id uuid PRIMARY KEY);
    CREATE TABLE public.school_admin_roles(user_id uuid NOT NULL, school_id uuid NOT NULL);
    CREATE TABLE public.learning_support_plans(
      id uuid PRIMARY KEY, school_id uuid NOT NULL, student_id uuid NOT NULL,
      teacher_id uuid NOT NULL, status text NOT NULL
    );
    CREATE FUNCTION public.has_role(user_id uuid, role public.app_role) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT role = 'teacher' AND EXISTS (SELECT 1 FROM public.teacher_roles WHERE teacher_roles.user_id = $1);
    $$;
    CREATE FUNCTION public.is_school_admin_of(user_uuid uuid, check_school_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM public.school_admin_roles WHERE user_id = $1 AND school_id = $2);
    $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated;
    GRANT SELECT ON public.profiles, public.learning_support_plans TO authenticated;
  `);
  await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3), ($4), ($5), ($6)', [teacher, student, outsider, admin, studentTwo, studentThree]);
  await db.query('INSERT INTO public.schools(id) VALUES ($1), ($2)', [school, otherSchool]);
  await db.query('INSERT INTO public.profiles(id, school_id, is_active) VALUES ($1, $2, true), ($3, $2, true), ($4, $2, true), ($5, $2, true), ($6, $2, true), ($7, $2, true)', [teacher, school, student, outsider, admin, studentTwo, studentThree]);
  await db.query('INSERT INTO public.teacher_roles(user_id) VALUES ($1)', [teacher]);
  await db.query('INSERT INTO public.school_admin_roles(user_id, school_id) VALUES ($1, $2)', [admin, school]);
  await db.query('INSERT INTO public.learning_support_plans(id, school_id, student_id, teacher_id, status) VALUES ($1, $2, $3, $4, $5)', [plan, school, student, teacher, 'active']);
  await db.query('INSERT INTO public.learning_support_plans(id, school_id, student_id, teacher_id, status) VALUES ($1, $2, $3, $4, $5)', [otherPlan, otherSchool, student, teacher, 'active']);
  await db.query('INSERT INTO public.learning_support_plans(id, school_id, student_id, teacher_id, status) VALUES ($1, $2, $3, $4, $5), ($6, $2, $7, $4, $5)', [planTwo, school, studentTwo, teacher, 'active', planThree, studentThree]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20260926000000_learning_support_transfer_checks.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20260926000100_school_transfer_summary.sql', import.meta.url), 'utf8'));

  await db.exec('SET ROLE authenticated');
  const as = async (identity: string) => db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [identity]);
  await as(teacher);
  const created = await db.query<{ id: string; school_id: string; student_id: string; teacher_id: string; status: string }>(
    'INSERT INTO public.learning_support_transfer_checks(plan_id, prompt, success_criteria) VALUES ($1, $2, $3) RETURNING id, school_id, student_id, teacher_id, status',
    [plan, prompt, criteria],
  );
  const checkId = created.rows[0].id;
  assert.equal(created.rows[0].school_id, school);
  assert.equal(created.rows[0].student_id, student);
  assert.equal(created.rows[0].teacher_id, teacher);
  assert.equal(created.rows[0].status, 'OPEN');
  await assert.rejects(db.query('INSERT INTO public.learning_support_transfer_checks(plan_id, prompt, success_criteria) VALUES ($1, $2, $3)', [plan, prompt, criteria]), /duplicate key/);
  await assert.rejects(db.query('INSERT INTO public.learning_support_transfer_checks(plan_id, prompt, success_criteria) VALUES ($1, $2, $3)', [otherPlan, prompt, criteria]), /row-level security/);
  assert.equal((await db.query('UPDATE public.learning_support_transfer_checks SET student_response = $1, status = $2 WHERE id = $3', ['Teacher cannot answer for a student.', 'SUBMITTED', checkId])).affectedRows, 0);
  await assert.rejects(db.query('DELETE FROM public.learning_support_transfer_checks WHERE id = $1', [checkId]), /permission denied/);

  await as(outsider);
  assert.equal((await db.query('SELECT id FROM public.learning_support_transfer_checks')).rows.length, 0);
  await assert.rejects(db.query('INSERT INTO public.learning_support_transfer_checks(plan_id, prompt, success_criteria) VALUES ($1, $2, $3)', [plan, prompt, criteria]), /transfer_check_plan_unavailable/);

  await as(student);
  assert.equal((await db.query('SELECT id FROM public.learning_support_transfer_checks')).rows.length, 1);
  await assert.rejects(db.query('UPDATE public.learning_support_transfer_checks SET prompt = $1, student_response = $2, status = $3 WHERE id = $4', [prompt + ' altered', 'I applied the same factor to both numbers.', 'SUBMITTED', checkId]), /transfer_check_identity_immutable/);
  await assert.rejects(db.query('UPDATE public.learning_support_transfer_checks SET student_response = $1, verdict = $2, status = $3 WHERE id = $4', ['I applied the same factor to both numbers.', 'DEMONSTRATED', 'SUBMITTED', checkId]), /transfer_check_student_scope/);
  const submitted = await db.query('UPDATE public.learning_support_transfer_checks SET student_response = $1, status = $2 WHERE id = $3 RETURNING status, submitted_at', ['I applied the same factor to both numbers.', 'SUBMITTED', checkId]);
  assert.equal(submitted.rows[0].status, 'SUBMITTED');
  assert.ok(submitted.rows[0].submitted_at);
  assert.equal((await db.query('UPDATE public.learning_support_transfer_checks SET student_response = $1 WHERE id = $2', ['Changed after submission', checkId])).affectedRows, 0);
  assert.equal((await db.query('UPDATE public.learning_support_transfer_checks SET verdict = $1, teacher_feedback = $2, status = $3 WHERE id = $4', ['DEMONSTRATED', 'Student cannot self-certify the outcome.', 'REVIEWED', checkId])).affectedRows, 0);

  await as(teacher);
  await assert.rejects(db.query('UPDATE public.learning_support_transfer_checks SET student_response = $1, verdict = $2, teacher_feedback = $3, status = $4 WHERE id = $5', ['Teacher overwrote response', 'DEMONSTRATED', 'Reasoned correctly in a new context.', 'REVIEWED', checkId]), /transfer_check_teacher_scope/);
  const reviewed = await db.query('UPDATE public.learning_support_transfer_checks SET verdict = $1, teacher_feedback = $2, status = $3 WHERE id = $4 RETURNING status, reviewed_at', ['DEMONSTRATED', 'Reasoned correctly in a new context.', 'REVIEWED', checkId]);
  assert.equal(reviewed.rows[0].status, 'REVIEWED');
  assert.ok(reviewed.rows[0].reviewed_at);
  const next = await db.query('INSERT INTO public.learning_support_transfer_checks(plan_id, prompt, success_criteria) VALUES ($1, $2, $3) RETURNING id', [plan, prompt, criteria]);
  assert.equal(next.rows.length, 1);
  await as(admin);
  const sparse = await db.query<{ evidence_state: string; learner_count: number | null; plans_with_checks: number | null }>('SELECT * FROM public.get_school_transfer_summary($1)', [school]);
  assert.equal(sparse.rows[0].evidence_state, 'INSUFFICIENT_COHORT');
  assert.equal(sparse.rows[0].learner_count, null);
  assert.equal(sparse.rows[0].plans_with_checks, null);
  await assert.rejects(db.query('SELECT * FROM public.get_school_transfer_summary($1)', [otherSchool]), /school_transfer_summary_forbidden/);
  await as(outsider);
  await assert.rejects(db.query('SELECT * FROM public.get_school_transfer_summary($1)', [school]), /school_transfer_summary_forbidden/);
  await as(teacher);
  await db.query('INSERT INTO public.learning_support_transfer_checks(plan_id, prompt, success_criteria) VALUES ($1, $2, $3), ($4, $2, $3)', [planTwo, prompt, criteria, planThree]);
  await as(admin);
  const summary = await db.query<{
    evidence_state: string; learner_count: string; plans_with_checks: string;
    awaiting_learner: string; awaiting_teacher: string; demonstrated_on_one_check: string;
  }>('SELECT * FROM public.get_school_transfer_summary($1)', [school]);
  assert.equal(summary.rows[0].evidence_state, 'AVAILABLE');
  assert.equal(Number(summary.rows[0].learner_count), 3);
  assert.equal(Number(summary.rows[0].plans_with_checks), 3);
  assert.equal(Number(summary.rows[0].awaiting_learner), 3);
  assert.equal(Number(summary.rows[0].awaiting_teacher), 0);
  assert.equal(Number(summary.rows[0].demonstrated_on_one_check), 0);
  assert.equal((await db.query('SELECT * FROM public.learning_support_transfer_checks')).rows.length, 0);
  await as(studentTwo);
  const secondCheck = await db.query<{ id: string }>('SELECT id FROM public.learning_support_transfer_checks WHERE plan_id = $1', [planTwo]);
  assert.equal(secondCheck.rows.length, 1);
  await db.query('UPDATE public.learning_support_transfer_checks SET student_response = $1, status = $2 WHERE id = $3', ['I scaled both ratios to compare equal quantities.', 'SUBMITTED', secondCheck.rows[0].id]);
  await as(teacher);
  await db.query('UPDATE public.learning_support_transfer_checks SET verdict = $1, teacher_feedback = $2, status = $3 WHERE id = $4', ['DEMONSTRATED', 'The new scenario was justified with a consistent scale factor.', 'REVIEWED', secondCheck.rows[0].id]);
  await as(admin);
  const reviewedSummary = await db.query<{ awaiting_learner: string; demonstrated_on_one_check: string }>('SELECT * FROM public.get_school_transfer_summary($1)', [school]);
  assert.equal(Number(reviewedSummary.rows[0].awaiting_learner), 2);
  assert.equal(Number(reviewedSummary.rows[0].demonstrated_on_one_check), 1);
  console.log('Transfer migration: live PostgreSQL syntax, tenant identity, RLS, transitions and reuse passed.');
  console.log('School transfer summary: administrator scope, privacy threshold and latest-check aggregation passed.');
} finally {
  await db.close();
}
