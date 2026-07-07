#!/usr/bin/env -S bun run
/**
 * LSE Stage A9 — Live synchronization benchmark harness
 * -----------------------------------------------------
 * Drives two authenticated browser contexts (teacher + N students) against
 * the deployed preview URL and measures the end-to-end teacher → student →
 * Lumina pipeline in wall-clock terms.
 *
 * This is a MANUAL, per-run tool. Each run consumes real AI gateway credits
 * on real `lumina-live` calls. It is deliberately not wired into CI.
 *
 * ─── Prerequisites (all required — the harness exits cleanly if any is missing) ──
 *
 *   LSE_PREVIEW_URL          e.g. https://<id>.lovable.app
 *   LSE_TEACHER_EMAIL        teacher account with insert perms on public.lesson_events
 *   LSE_TEACHER_PASSWORD
 *   LSE_STUDENT_EMAIL        student enrolled in LSE_LESSON_ID
 *   LSE_STUDENT_PASSWORD
 *   LSE_LESSON_ID            existing UUID in public.lessons the teacher can post to
 *
 * Optional:
 *
 *   LSE_STUDENT_COUNT        default 1; used only by the multi-student pass
 *   LSE_STEADY_EVENTS        default 100; steady-state event count
 *   LSE_STEADY_INTERVAL_MS   default 2000; teacher inter-event delay
 *   LSE_BURST_EVENTS         default 200; burst event count
 *   LSE_BURST_INTERVAL_MS    default 200; burst inter-event delay
 *   LSE_ARTIFACT_DIR         default /tmp/browser/lse-a9
 *
 * ─── What it measures ──
 *
 *   Per event, per student:
 *     broadcast_transit = realtime_received     − teacher_event_created_at
 *     client_pipeline   = inference_started     − realtime_received
 *     model_ttft        = first_token           − inference_started
 *     paint             = first_render          − first_token
 *     TOTAL (SLA)       = first_token           − teacher_event_created_at
 *
 *   Reports p50 / p95 / p99 per hop and per total. Raw records land in
 *   LSE_ARTIFACT_DIR as JSON for post-hoc inspection.
 *
 * ─── Honest scope ──
 *
 *   Both browser contexts run on the same host (the sandbox), so cross-
 *   context clock skew is bounded — measurements represent a controlled
 *   local benchmark environment and MUST NOT be interpreted as a global
 *   internet latency guarantee.
 *
 * Run with:  bun run scripts/lseA9LiveBenchmark.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Playwright is loaded dynamically so the prerequisite check + "playwright
// not installed" message run without requiring the package up front.
type PWBrowser = import("playwright").Browser;
type PWContext = import("playwright").BrowserContext;
type PWPage = import("playwright").Page;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface Env {
  previewUrl: string;
  teacherEmail: string;
  teacherPassword: string;
  studentEmail: string;
  studentPassword: string;
  lessonId: string;
  studentCount: number;
  steadyEvents: number;
  steadyIntervalMs: number;
  burstEvents: number;
  burstIntervalMs: number;
  artifactDir: string;
}

function readEnv(): { ok: true; env: Env } | { ok: false; missing: string[] } {
  const required = [
    "LSE_PREVIEW_URL",
    "LSE_TEACHER_EMAIL",
    "LSE_TEACHER_PASSWORD",
    "LSE_STUDENT_EMAIL",
    "LSE_STUDENT_PASSWORD",
    "LSE_LESSON_ID",
  ] as const;
  const missing = required.filter((k) => !process.env[k] || process.env[k]!.length === 0);
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    env: {
      previewUrl: process.env.LSE_PREVIEW_URL!.replace(/\/$/, ""),
      teacherEmail: process.env.LSE_TEACHER_EMAIL!,
      teacherPassword: process.env.LSE_TEACHER_PASSWORD!,
      studentEmail: process.env.LSE_STUDENT_EMAIL!,
      studentPassword: process.env.LSE_STUDENT_PASSWORD!,
      lessonId: process.env.LSE_LESSON_ID!,
      studentCount: parseInt(process.env.LSE_STUDENT_COUNT ?? "1", 10),
      steadyEvents: parseInt(process.env.LSE_STEADY_EVENTS ?? "100", 10),
      steadyIntervalMs: parseInt(process.env.LSE_STEADY_INTERVAL_MS ?? "2000", 10),
      burstEvents: parseInt(process.env.LSE_BURST_EVENTS ?? "200", 10),
      burstIntervalMs: parseInt(process.env.LSE_BURST_INTERVAL_MS ?? "200", 10),
      artifactDir: process.env.LSE_ARTIFACT_DIR ?? "/tmp/browser/lse-a9",
    },
  };
}

// ---------------------------------------------------------------------------
// Auth + navigation helpers
// ---------------------------------------------------------------------------

async function signIn(page: PWPage, previewUrl: string, email: string, password: string): Promise<void> {
  await page.goto(`${previewUrl}/auth`, { waitUntil: "domcontentloaded" });
  // The app's Auth page uses standard email/password inputs. If these
  // selectors drift, update them here — the driver deliberately fails
  // loudly rather than silently missing a sign-in.
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
  // Wait until session hydrated (Auth page routes away).
  await page.waitForURL((url) => !/\/auth$/.test(url.pathname), { timeout: 15_000 });
}

async function openBenchRoute(page: PWPage, previewUrl: string, lessonId: string, startSeq: number): Promise<void> {
  // `startSeq` seeds the A5 intake gate. Without it the student's `lastSeq`
  // starts at 0 and every emitted event whose seq is not exactly 1 gets
  // gap-rejected. Passing `startSeq` bridges to the teacher's cursor
  // without changing production semantics.
  const url = `${previewUrl}/lse-bench?lesson=${encodeURIComponent(lessonId)}&startSeq=${startSeq}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="bench-session-status"]')?.textContent === "subscribed",
    { timeout: 20_000 },
  );
}


// ---------------------------------------------------------------------------
// Teacher: emit events via Supabase JS from inside the teacher browser page
// (uses the page's already-configured supabase client + session).
// ---------------------------------------------------------------------------

interface EmittedRecord { seq: number; kind: string; teacherEmitTs: number }

async function emitEvent(page: PWPage, lessonId: string, seq: number, kind: string, text: string): Promise<EmittedRecord> {
  const record = await page.evaluate(async ({ lessonId, seq, kind, text }) => {
    // The app's supabase client is not exposed globally by default.
    // Fall back to a raw fetch through the app's REST endpoint using
    // the current session's JWT.
    const w = window as unknown as { __sb_url?: string; __sb_key?: string };
    const url = w.__sb_url ?? (import.meta as unknown as { env: Record<string,string> }).env?.VITE_SUPABASE_URL;
    const key = w.__sb_key ?? (import.meta as unknown as { env: Record<string,string> }).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
    // Grab JWT from localStorage — the SDK persists it under a project-scoped key.
    let jwt: string | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
        try { jwt = JSON.parse(localStorage.getItem(k)!)?.access_token ?? null; } catch { /* ignore */ }
        break;
      }
    }
    if (!url || !key || !jwt) throw new Error("teacher session not available in page");
    const teacherEmitTs = Date.now();
    const resp = await fetch(`${url}/rest/v1/lesson_events`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        lesson_id: lessonId,
        seq,
        kind,
        text,
        priority: kind === "definition" || kind === "formula" ? 1
               : kind === "concept" || kind === "question" ? 2
               : kind === "example" ? 3
               : kind === "discussion" ? 4 : 5,
        teacher_visible: kind !== "silence" && kind !== "admin",
      }),
    });
    if (!resp.ok) throw new Error(`insert failed: ${resp.status} ${await resp.text()}`);
    return { seq, kind, teacherEmitTs };
  }, { lessonId, seq, kind, text });
  return record;
}


// ---------------------------------------------------------------------------
// Student: read bench buffer
// ---------------------------------------------------------------------------

interface BenchMark { eventId: string; phase: string; ts: number }

async function readBench(page: PWPage): Promise<BenchMark[]> {
  return await page.evaluate(() => {
    const w = window as unknown as { __lseBench?: { read: () => BenchMark[] } };
    return w.__lseBench?.read() ?? [];
  });
}

async function resetBench(page: PWPage): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __lseBench?: { reset: () => void } };
    w.__lseBench?.reset();
  });
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(label: string, samples: number[]): { label: string; n: number; p50: number; p95: number; p99: number } {
  const sorted = [...samples].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return { label, n: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99) };
}

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

const KINDS = ["concept", "definition", "example", "question", "formula", "discussion", "admin", "silence"] as const;

interface JoinedRecord {
  seq: number;
  kind: string;
  teacherEmitTs: number;
  realtimeReceived?: number;
  inferenceStarted?: number;
  firstToken?: number;
  firstRender?: number;
}

function joinRecords(emitted: EmittedRecord[], marks: BenchMark[], lessonId: string): JoinedRecord[] {
  const byEventId = new Map<string, BenchMark[]>();
  for (const m of marks) {
    const arr = byEventId.get(m.eventId) ?? [];
    arr.push(m);
    byEventId.set(m.eventId, arr);
  }
  return emitted.map((e) => {
    const eventId = `${lessonId}#${e.seq}`;
    const ms = byEventId.get(eventId) ?? [];
    const pick = (phase: string) => ms.find((m) => m.phase === phase)?.ts;
    return {
      seq: e.seq,
      kind: e.kind,
      teacherEmitTs: e.teacherEmitTs,
      realtimeReceived: pick("realtime_received"),
      inferenceStarted: pick("inference_started"),
      firstToken: pick("first_token"),
      firstRender: pick("first_render"),
    };
  });
}

async function runPass(
  passName: string,
  teacherPage: PWPage,
  studentPages: PWPage[],
  lessonId: string,
  startSeq: number,
  count: number,
  intervalMs: number,
): Promise<{ perStudent: JoinedRecord[][]; emitted: EmittedRecord[] }> {
  console.log(`\n=== Pass: ${passName} — ${count} events @ ${intervalMs}ms interval ===`);
  for (const p of studentPages) await resetBench(p);

  const emitted: EmittedRecord[] = [];
  for (let i = 0; i < count; i++) {
    const seq = startSeq + i;
    const kind = KINDS[i % KINDS.length];
    try {
      emitted.push(await emitEvent(teacherPage, lessonId, seq, kind, `[${passName}] event ${seq}`));
    } catch (err) {
      console.error(`  emit ${seq} failed:`, err);
      break;
    }
    if (i < count - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  // Drain window — wait for streams to reach first-token.
  await new Promise((r) => setTimeout(r, 5000));

  const perStudent: JoinedRecord[][] = [];
  for (const p of studentPages) {
    const marks = await readBench(p);
    perStudent.push(joinRecords(emitted, marks, lessonId));
  }
  return { perStudent, emitted };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const envCheck = readEnv();
  if (!envCheck.ok) {
    console.log("\nLSE A9 — prerequisites missing.");
    console.log("The wall-clock latency claim CANNOT be produced without the following env vars:");
    for (const k of envCheck.missing) console.log(`  - ${k}`);
    console.log("\nThe A9 harness code (this file) and the /lse-bench route ship regardless.");
    console.log("Re-run with the env vars populated to produce p50/p95/p99 numbers.");
    process.exit(0);
  }
  const env = envCheck.env;
  await mkdir(env.artifactDir, { recursive: true });

  console.log("LSE A9 — live synchronization benchmark");
  console.log(`  preview: ${env.previewUrl}`);
  console.log(`  lesson:  ${env.lessonId}`);
  console.log(`  students: ${env.studentCount}`);

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("\nLSE A9 — playwright not installed.");
    console.log("Install with:  bun add -D playwright  (and `bunx playwright install chromium` if launching)");
    console.log("The A9 harness code + /lse-bench route ship regardless. Wall-clock numbers require playwright.");
    process.exit(0);
  }
  const browser: PWBrowser = await chromium.launch({ headless: true });
  const teacherCtx: PWContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const studentCtxs: PWContext[] = [];
  for (let i = 0; i < env.studentCount; i++) {
    studentCtxs.push(await browser.newContext({ viewport: { width: 1280, height: 900 } }));
  }

  try {
    const teacherPage = await teacherCtx.newPage();
    console.log("  signing in teacher…");
    await signIn(teacherPage, env.previewUrl, env.teacherEmail, env.teacherPassword);

    // Choose the seq cursor BEFORE opening bench routes so we can seed each
    // student's A5 intake gate with `startSeq - 1`. Using seconds since epoch
    // keeps values monotonic across runs and avoids `unique(lesson_id, seq)`
    // collisions with any prior test rows on the same lesson.
    let seqCursor = Math.floor(Date.now() / 1000);
    const initialStartSeq = seqCursor;

    const studentPages: PWPage[] = [];
    for (let i = 0; i < studentCtxs.length; i++) {
      const page = await studentCtxs[i].newPage();
      console.log(`  signing in student ${i + 1}…`);
      await signIn(page, env.previewUrl, env.studentEmail, env.studentPassword);
      console.log(`  student ${i + 1} opening /lse-bench (startSeq=${initialStartSeq})…`);
      await openBenchRoute(page, env.previewUrl, env.lessonId, initialStartSeq);
      studentPages.push(page);
    }

    // Pass 1 — steady state (SLA claim).
    const steady = await runPass("steady", teacherPage, studentPages, env.lessonId, seqCursor, env.steadyEvents, env.steadyIntervalMs);
    seqCursor += env.steadyEvents;

    // Pass 2 — burst.
    const burst = await runPass("burst", teacherPage, studentPages, env.lessonId, seqCursor, env.burstEvents, env.burstIntervalMs);
    seqCursor += env.burstEvents;


    // Report
    const report: unknown[] = [];
    for (const [name, pass] of [["steady", steady], ["burst", burst]] as const) {
      for (let i = 0; i < pass.perStudent.length; i++) {
        const recs = pass.perStudent[i];
        const total = recs.map((r) => (r.firstToken ?? NaN) - r.teacherEmitTs);
        const transit = recs.map((r) => (r.realtimeReceived ?? NaN) - r.teacherEmitTs);
        const pipeline = recs.map((r) => (r.inferenceStarted ?? NaN) - (r.realtimeReceived ?? NaN));
        const ttft = recs.map((r) => (r.firstToken ?? NaN) - (r.inferenceStarted ?? NaN));
        const paint = recs.map((r) => (r.firstRender ?? NaN) - (r.firstToken ?? NaN));
        const summaries = {
          pass: name,
          student: i,
          delivered: recs.filter((r) => r.firstToken !== undefined).length,
          total_events: recs.length,
          hops: [
            summarize("broadcast_transit", transit),
            summarize("client_pipeline", pipeline),
            summarize("model_ttft", ttft),
            summarize("paint", paint),
            summarize("TOTAL", total),
          ],
        };
        report.push(summaries);
        console.log(`\n[${name} · student ${i}] delivered ${summaries.delivered}/${summaries.total_events}`);
        for (const h of summaries.hops) {
          console.log(`  ${h.label.padEnd(18)} n=${h.n}  p50=${h.p50.toFixed(1)}ms  p95=${h.p95.toFixed(1)}ms  p99=${h.p99.toFixed(1)}ms`);
        }
      }
    }

    const artifactPath = join(env.artifactDir, `report-${Date.now()}.json`);
    await writeFile(artifactPath, JSON.stringify({ env: { ...env, teacherPassword: "***", studentPassword: "***" }, report, steady: steady.perStudent, burst: burst.perStudent }, null, 2));
    console.log(`\nArtifacts written to ${artifactPath}`);

    // SLA gate (steady, student 0)
    const steadyTotals = steady.perStudent[0].map((r) => (r.firstToken ?? NaN) - r.teacherEmitTs).filter(Number.isFinite);
    const p95 = percentile([...steadyTotals].sort((a, b) => a - b), 95);
    console.log(`\nSLA check — steady p95 total: ${p95.toFixed(1)} ms (target < 1500 ms)`);
    if (steadyTotals.length === 0) {
      console.log("  → no events delivered end-to-end; verify prerequisites and lesson membership.");
    } else if (p95 < 1500) {
      console.log("  → PASS");
    } else {
      console.log("  → FAIL — see per-hop breakdown above to identify the dominant bottleneck.");
    }
  } finally {
    for (const c of studentCtxs) await c.close();
    await teacherCtx.close();
    await browser.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
