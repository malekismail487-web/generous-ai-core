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
    CREATE TABLE public.learning_support_plans(
      id uuid PRIMARY KEY, school_id uuid NOT NULL, student_id uuid NOT NULL,
      teacher_id uuid NOT NULL, status text NOT NULL
    );
    CREATE FUNCTION public.has_role(user_id uuid, role public.app_role) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT role = 'teacher' AND EXISTS (SELECT 1 FROM public.teacher_roles WHERE teacher_roles.user_id = $1);
    $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated;
    GRANT SELECT ON public.profiles, public.learning_support_plans TO authenticated;
  `);
  await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [teacher, student, outsider]);
  await db.query('INSERT INTO public.schools(id) VALUES ($1), ($2)', [school, otherSchool]);
  await db.query('INSERT INTO public.profiles(id, school_id, is_active) VALUES ($1, $2, true), ($3, $2, true), ($4, $2, true)', [teacher, school, student, outsider]);
  await db.query('INSERT INTO public.teacher_roles(user_id) VALUES ($1)', [teacher]);
  await db.query('INSERT INTO public.learning_support_plans(id, school_id, student_id, teacher_id, status) VALUES ($1, $2, $3, $4, $5)', [plan, school, student, teacher, 'active']);
  await db.query('INSERT INTO public.learning_support_plans(id, school_id, student_id, teacher_id, status) VALUES ($1, $2, $3, $4, $5)', [otherPlan, otherSchool, student, teacher, 'active']);
  await db.exec(readFileSync(new URL('../supabase/migrations/20260926000000_learning_support_transfer_checks.sql', import.meta.url), 'utf8'));

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
  console.log('Transfer migration: live PostgreSQL syntax, tenant identity, RLS, transitions and reuse passed.');
} finally {
  await db.close();
}
