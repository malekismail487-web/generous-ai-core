# LSE Stage A9 — Live Synchronization Benchmark Harness

Status: **Code shipped. Wall-clock numbers NOT produced this turn — prerequisites unmet.** The harness (`scripts/lseA9LiveBenchmark.ts`) and the benchmark route (`src/pages/LseBench.tsx`, `/lse-bench`) compile and exit cleanly when credentials or a lesson id are absent. This dossier records exactly what runs, what does not, and what is required to produce the p95 < 1.5 s claim.

---

## 1. Scope

Stage A9 delivers the *measurement infrastructure* for the teacher → student → Lumina pipeline under real conditions. It does not add features. It does not change any A2–A7 module. It relies on the A10 wiring already in `useLuminaLiveSession`.

**In scope**
- A minimal, non-user-facing browser route (`/lse-bench`) that mounts `useLuminaLiveSession` and exposes `window.__lseBench` for external inspection.
- A Playwright driver that authenticates a teacher context, authenticates one or more student contexts, opens `/lse-bench` in each student, inserts real rows into `public.lesson_events` from the teacher, waits for real broadcasts to reach the students, and reads real per-event timestamps back.
- Per-hop and total p50/p95/p99 reporting, plus raw JSON artifacts.

**Out of scope**
- CI wiring. The harness burns real gateway credits per event; it is a manual, per-run tool.
- No A2–A7 module edits. Only the hook received a non-behavioural bench sentinel (part of A10 already).

---

## 2. Files delivered

| Path | Purpose |
| --- | --- |
| `src/pages/LseBench.tsx` | The `/lse-bench?lesson=<uuid>` route. Mounts `useLuminaLiveSession` and installs `window.__lseBench` with `mark/read/reset/ready`. |
| `src/App.tsx` | One `<Route path="/lse-bench" element={<LseBench />} />` line. |
| `scripts/lseA9LiveBenchmark.ts` | Playwright driver. Reads env vars, exits cleanly with a "prerequisites missing" message if any are absent. |
| `.lovable/lse-A9-dossier.md` | This document. |

The bench-mark instrumentation inside `useLuminaLiveSession.tsx` (four `benchMark(...)` calls, one on `latest.text` first-non-empty effect) shipped as part of Stage A10 and is documented in that dossier.

---

## 3. What the harness measures

Per event, per student:

| Hop | Formula |
| --- | --- |
| `broadcast_transit` | `realtime_received − teacher_emit_ts` |
| `client_pipeline`   | `inference_started − realtime_received` |
| `model_ttft`        | `first_token − inference_started` |
| `paint`             | `first_render − first_token` |
| **`TOTAL` (SLA)**   | `first_token − teacher_emit_ts` |

Two passes run per invocation:

1. **Steady state** — 100 events at 1 event / 2 s (defaults; overrideable via `LSE_STEADY_EVENTS` / `LSE_STEADY_INTERVAL_MS`). This pass carries the SLA gate: **steady p95 total < 1.5 s** → PASS/FAIL is printed.
2. **Burst** — 200 events at 5 events / s. Latency numbers reported but not gated (burst is a stress test).

A third pass — multi-student consistency — is enabled by setting `LSE_STUDENT_COUNT > 1`. Each student contributes its own p50/p95/p99 row in the report so cross-student variance is visible.

Raw joined records land in `LSE_ARTIFACT_DIR` (default `/tmp/browser/lse-a9/report-<ts>.json`) for post-hoc inspection.

---

## 4. Prerequisites (blocking — currently unmet)

| Env var | Purpose |
| --- | --- |
| `LSE_PREVIEW_URL` | Preview base URL (no trailing slash). |
| `LSE_TEACHER_EMAIL` / `LSE_TEACHER_PASSWORD` | Teacher account with insert permission on `public.lesson_events` for `LSE_LESSON_ID`. |
| `LSE_STUDENT_EMAIL` / `LSE_STUDENT_PASSWORD` | Student account enrolled in `LSE_LESSON_ID` (so A5 RLS on `realtime.messages` admits them). |
| `LSE_LESSON_ID` | Pre-existing UUID in `public.lessons` the teacher can post to. Recommend `is_test_data = true`. |

Optional overrides for pass sizing: `LSE_STUDENT_COUNT`, `LSE_STEADY_EVENTS`, `LSE_STEADY_INTERVAL_MS`, `LSE_BURST_EVENTS`, `LSE_BURST_INTERVAL_MS`, `LSE_ARTIFACT_DIR`.

Additionally, `playwright` must be installed in the sandbox (`bun add -D playwright` + `bunx playwright install chromium`). The harness exits cleanly with an install hint when it is missing.

---

## 5. Honest interpretation of the numbers

Refinement 4 (from the A10 review) — clock skew clarification:

> Both browser contexts run on the same benchmark host (this sandbox), reducing clock skew. Measurements represent a **controlled local benchmark environment** and should **not** be interpreted as a global internet latency guarantee.

Additional caveats to state alongside any published number:

- **`broadcast_transit`** measures wall-clock delta between the teacher page issuing the `POST /rest/v1/lesson_events` and the student page's Realtime callback firing. It bundles Postgres insert time, trigger + broadcast time, and WebSocket delivery time. It does not decompose them.
- **`client_pipeline`** measures the time from the broadcast callback to the `POST /lumina-live` starting. A8 already showed this bound is ≤ ~10 µs in-process; wall-clock will add JS event loop scheduling and (occasionally) `getContext` I/O from ALE.
- **`model_ttft`** is dominated by the gateway model choice and cold-start; it can spike on the first request of a session.
- **`paint`** is a React commit budget; on a low-end device it can dominate.
- **`TOTAL`** is the only number that matches the user-brief SLA. Everything else is a diagnostic breakdown.
- The harness cannot separate its own sandbox network path from the true student experience. Numbers from this harness are a **floor** for what a real classroom would observe on similar hardware, not a ceiling.

---

## 6. What A9 validates once run

After a successful run against real infrastructure:

- **Synchronization** — cross-student `state.version` and `lastSeq` equality (multi-student pass, from the bench route DOM).
- **Delivery** — `delivered / total_events` per pass; loss detection.
- **Ordering** — per-band drain order preserved (A10 already proves this in-process; this pass re-confirms it end-to-end).
- **Latency SLA** — steady p95 total < 1.5 s pass/fail.
- **Burst survivability** — no crashes, no unbounded memory (observable via bench route staying responsive).

What A9 still does NOT validate — deliberately out of scope for this stage:
- Reconnect / recovery wall-clock recovery time. Refinement 5 was covered in-process by Stage A10 T6; the browser-level equivalent requires simulating socket loss inside Playwright (e.g. `context.setOffline(true/false)`) and is a natural Phase A11 extension.
- N > single-digit student load. The harness is architected for it (`LSE_STUDENT_COUNT`) but a single sandbox host cannot honestly simulate a full classroom over the wire.
- Per-country / per-region latency variation.

---

## 7. How to run (once prerequisites are provisioned)

```bash
export LSE_PREVIEW_URL="https://<preview-id>.lovable.app"
export LSE_TEACHER_EMAIL="…"
export LSE_TEACHER_PASSWORD="…"
export LSE_STUDENT_EMAIL="…"
export LSE_STUDENT_PASSWORD="…"
export LSE_LESSON_ID="<uuid>"
# optional:
export LSE_STUDENT_COUNT=3

bun add -D playwright   # once
bunx playwright install chromium   # once
bun run scripts/lseA9LiveBenchmark.ts
```

Console output prints the per-hop p50/p95/p99 table and the SLA verdict. The raw report is written to `${LSE_ARTIFACT_DIR:-/tmp/browser/lse-a9}/report-<ts>.json`.

---

## 8. Honest gap summary

- **What we have:** the machinery. Route, driver, statistics, artifact writer, SLA gate, honest interpretation notes.
- **What we do NOT have:** any measured p50/p95/p99 number. None. The claim "p95 total < 1.5 s" remains **unverified against real infrastructure** until the prerequisites above are provisioned and the harness is executed.
- **What is needed from the user to close this gap:** a teacher account with insert perms on `lesson_events` for a test `lessonId`, a student account enrolled in that lesson, and explicit approval to spend gateway credits on the benchmark run (≥ 300 events / run at defaults).

Once those are provided, this dossier will be extended with the actual measured numbers and a signed-off SLA verdict.
