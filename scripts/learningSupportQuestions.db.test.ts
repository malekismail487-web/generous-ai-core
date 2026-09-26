import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const school = '10000000-0000-4000-8000-000000000001';
const otherSchool = '10000000-0000-4000-8000-000000000002';
const teacher = '10000000-0000-4000-8000-000000000003';
const student = '10000000-0000-4000-8000-000000000004';
const otherStudent = '10000000-0000-4000-8000-000000000005';
const outsider = '10000000-0000-4000-8000-000000000006';
const plan = '10000000-0000-4000-8000-000000000007';
const otherPlan = '10000000-0000-4000-8000-000000000008';
const studentTwo = '10000000-0000-4000-8000-000000000009';
const studentThree = '10000000-0000-4000-8000-000000000010';
const studentFour = '10000000-0000-4000-8000-000000000011';
const planTwo = '10000000-0000-4000-8000-000000000012';
const question = 'I can simplify the ratio, but why must both numbers change by the same factor?';

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
    CREATE TABLE public.profiles(
      id uuid PRIMARY KEY, school_id uuid NOT NULL, is_active boolean NOT NULL,
      user_type text NOT NULL, status text NOT NULL, student_teacher_id text, grade_level text
    );
    CREATE TABLE public.teacher_roles(user_id uuid PRIMARY KEY);
    CREATE TABLE public.school_admin_roles(user_id uuid, school_id uuid);
    CREATE TABLE public.learning_support_plans(
      id uuid PRIMARY KEY, school_id uuid NOT NULL, student_id uuid NOT NULL,
      teacher_id uuid NOT NULL, subject text NOT NULL, topic text NOT NULL,
      status text NOT NULL
    );
    CREATE TABLE public.assignments(
      school_id uuid, teacher_id uuid, subject text, grade_level text, class_id uuid
    );
    CREATE TABLE public.student_classes(student_id uuid, class_id uuid);
    CREATE TABLE public.learning_support_checkins(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid, kind text, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.learning_support_transfer_checks(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, student_id uuid,
      status text, reviewed_at timestamptz
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
  await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3), ($4), ($5), ($6), ($7)',
    [teacher, student, otherStudent, outsider, studentTwo, studentThree, studentFour]);
  await db.query('INSERT INTO public.schools(id) VALUES ($1), ($2)', [school, otherSchool]);
  await db.query(`INSERT INTO public.profiles(id, school_id, is_active, user_type, status)
    VALUES ($1, $2, true, 'teacher', 'approved'), ($3, $2, true, 'student', 'approved'),
      ($4, $5, true, 'student', 'approved'), ($6, $2, true, 'school_admin', 'approved')`,
    [teacher, school, student, otherStudent, otherSchool, outsider]);
  await db.query(`INSERT INTO public.profiles(id, school_id, is_active, user_type, status, grade_level)
    VALUES ($1, $3, true, 'student', 'approved', 'G7'),
      ($2, $3, true, 'student', 'approved', 'G7'),
      ($4, $3, true, 'student', 'approved', 'G8')`, [studentTwo, studentThree, school, studentFour]);
  await db.query("UPDATE public.profiles SET grade_level = 'G7' WHERE id = $1", [student]);
  await db.query('INSERT INTO public.teacher_roles(user_id) VALUES ($1)', [teacher]);
  await db.query('INSERT INTO public.school_admin_roles(user_id, school_id) VALUES ($1, $2)', [outsider, school]);
  await db.query(`INSERT INTO public.learning_support_plans(id, school_id, student_id, teacher_id, subject, topic, status)
    VALUES ($1, $2, $3, $4, 'Math', 'Equivalent ratios', 'active'),
      ($5, $6, $7, $4, 'Math', 'Equivalent ratios', 'active'),
      ($8, $2, $9, $4, 'Math', 'Equivalent ratios', 'active')`,
    [plan, school, student, teacher, otherPlan, otherSchool, otherStudent, planTwo, studentTwo]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20260925000200_student_learning_records.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20260926000200_link_learning_questions_to_support.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20260926000300_school_learning_attention_by_grade.sql', import.meta.url), 'utf8'));

  await db.exec('SET ROLE authenticated');
  const as = async (identity: string) => db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [identity]);
  const insert = (linkedPlan: string, overrides: Record<string, string> = {}) => db.query<{ id: string; support_plan_id: string }>(
    `INSERT INTO public.student_learning_records
      (support_plan_id, school_id, student_id, teacher_id, kind, subject, topic, body)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, support_plan_id`,
    [linkedPlan, overrides.school_id ?? school, overrides.student_id ?? student,
      overrides.teacher_id ?? teacher, overrides.kind ?? 'QUESTION', overrides.subject ?? 'Math',
      overrides.topic ?? 'Equivalent ratios', overrides.body ?? question],
  );

  await as(student);
  const created = await insert(plan);
  const recordId = created.rows[0].id;
  assert.equal(created.rows[0].support_plan_id, plan);
  await assert.rejects(insert(otherPlan), /support_question_plan_mismatch/);
  await assert.rejects(insert(plan, { topic: 'Different topic' }), /support_question_plan_mismatch/);
  await assert.rejects(insert(plan, { kind: 'EVIDENCE' }), /support_question_plan_mismatch/);
  assert.equal((await db.query('UPDATE public.student_learning_records SET teacher_reply = $1 WHERE id = $2', ['Student cannot reply as teacher.', recordId])).affectedRows, 0);

  await as(outsider);
  assert.equal((await db.query('SELECT id FROM public.student_learning_records')).rows.length, 0);
  await as(otherStudent);
  assert.equal((await db.query('SELECT id FROM public.student_learning_records')).rows.length, 0);
  await as(teacher);
  assert.equal((await db.query('SELECT id FROM public.student_learning_records')).rows.length, 1);
  await assert.rejects(db.query('UPDATE public.student_learning_records SET support_plan_id = $1, teacher_reply = $2 WHERE id = $3',
    [otherPlan, 'This would detach the original question.', recordId]), /support_question_plan_immutable/);
  const replied = await db.query<{ teacher_replied_at: string }>(
    'UPDATE public.student_learning_records SET teacher_reply = $1 WHERE id = $2 RETURNING teacher_replied_at',
    ['Scale both parts equally so the ratio represents the same relationship.', recordId],
  );
  assert.ok(replied.rows[0].teacher_replied_at);
  await assert.rejects(db.query('UPDATE public.student_learning_records SET teacher_reply = $1 WHERE id = $2',
    ['A second reply should not overwrite the first.', recordId]), /teacher_reply_append_only/);
  await as(student);
  const visible = await db.query<{ teacher_reply: string }>('SELECT teacher_reply FROM public.student_learning_records WHERE id = $1', [recordId]);
  assert.match(visible.rows[0].teacher_reply, /same relationship/);
  await as(studentTwo);
  await db.query(`INSERT INTO public.student_learning_records
    (support_plan_id, school_id, student_id, teacher_id, kind, subject, topic, body)
    VALUES ($1, $2, $3, $4, 'QUESTION', 'Math', 'Equivalent ratios', $5)`, [planTwo, school, studentTwo, teacher, question]);
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO public.learning_support_checkins(plan_id, kind) VALUES ($1, 'NEEDS_HELP')", [plan]);
  await db.query(`INSERT INTO public.learning_support_transfer_checks(school_id, student_id, status, reviewed_at)
    VALUES ($1, $2, 'REVIEWED', now())`, [school, student]);
  await db.exec('SET ROLE authenticated');
  await as(outsider);
  assert.equal((await db.query('SELECT id FROM public.student_learning_records')).rows.length, 0);
  const equity = await db.query<{
    grade_label: string; learner_count: string; learners_with_active_plans: string;
    learners_with_recent_help: string; learners_awaiting_teacher_reply: string;
    learners_with_reviewed_transfer: string;
  }>('SELECT * FROM public.get_school_learning_attention_by_grade($1)', [school]);
  assert.deepEqual(equity.rows.map(row => row.grade_label), ['G7']);
  assert.equal(Number(equity.rows[0].learner_count), 3);
  assert.equal(Number(equity.rows[0].learners_with_active_plans), 2);
  assert.equal(Number(equity.rows[0].learners_with_recent_help), 1);
  assert.equal(Number(equity.rows[0].learners_awaiting_teacher_reply), 1);
  assert.equal(Number(equity.rows[0].learners_with_reviewed_transfer), 1);
  await assert.rejects(db.query('SELECT * FROM public.get_school_learning_attention_by_grade($1)', [otherSchool]), /school_learning_attention_forbidden/);
  await as(student);
  await assert.rejects(db.query('SELECT * FROM public.get_school_learning_attention_by_grade($1)', [school]), /school_learning_attention_forbidden/);
  await db.exec('RESET ROLE');
  await db.query("UPDATE public.learning_support_plans SET status = 'closed' WHERE id = $1", [plan]);
  await db.exec('SET ROLE authenticated');
  await as(student);
  await assert.rejects(insert(plan), /support_question_plan_mismatch/);
  const ordinaryQuestion = await db.query<{ support_plan_id: string | null }>(
    `INSERT INTO public.student_learning_records
      (school_id, student_id, teacher_id, kind, subject, topic, body)
      VALUES ($1, $2, $3, 'QUESTION', 'Math', 'Equivalent ratios', $4)
      RETURNING support_plan_id`, [school, student, teacher, question],
  );
  assert.equal(ordinaryQuestion.rows[0].support_plan_id, null);
  console.log('Linked learning questions: plan binding, private visibility, immutable provenance, one-way teacher reply and closure passed.');
  console.log('School grade attention: authorized aggregate, distinct learner counts, small-cohort suppression and private-record isolation passed.');
} finally {
  await db.close();
}
