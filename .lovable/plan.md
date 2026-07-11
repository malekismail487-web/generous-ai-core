## Phase B — Lumina Live Meeting Experience

The A1–A10 sync stack (Realtime channel `lesson:<uuid>`, `lesson_events` table, priority scheduler, context cache, `useLuminaLiveSession`, `lumina-live` edge function) is the infrastructure. It is complete and untouched by this phase.

This phase builds the actual **parallel-live classroom** on top: a teacher meeting console that emits lecture events, a student meeting room that continuously renders Lumina's personalized interpretation of those events, and the session lifecycle that binds the two.

### What we build

**1. `lesson_sessions` lifecycle (data + RLS)**

New rows in the existing `lesson_sessions` table represent an *active meeting*:

- `status`: `scheduled | live | ended`
- `started_at`, `ended_at`, `teacher_id`, `class_id`, `subject`, `title`
- RLS: teacher of the class can create/update; enrolled students can read live sessions for their class; strict school isolation.
- Realtime `postgres_changes` on this table → students see sessions appear/disappear without polling.

**2. Teacher console — "Start Lumina Live"**

New tab on the Teacher Dashboard: **Live Lecture**.

- Pick class + subject + title → **Go Live** button flips a session to `status=live`.
- Composer to emit lecture events into `public.lesson_events` (the A1 trigger already broadcasts them). Event kinds already supported by A2: `concept | definition | formula | example | question | discussion | admin | silence`.
- Quick-emit controls: concept chip, definition field, formula (LaTeX), example, "moved on / silence".
- **Optional voice capture** (Web Speech API, already used in `useTextToSpeech`): teacher speaks → chunks get classified into event kinds via a small helper edge function and inserted. Manual controls remain the source of truth; voice is an assist.
- **End Meeting** button → `status=ended`, `ended_at=now()`. Triggers automatic termination on student side.

**3. Student meeting room — parallel live stream**

New route `/live/:lessonId` and a **"Join Live"** card that appears on the Student Dashboard whenever a `lesson_sessions` row for one of their classes flips to `live`.

Layout (mobile-first, matches monochromatic system):

```text
┌─────────────────────────────────┐
│ Live • [Subject] • [Teacher]    │  ← header, ends button
├─────────────────────────────────┤
│ Current concept: Newton's 2nd   │  ← from LessonState.currentConcept
│ Prereqs covered: [chips]        │
├─────────────────────────────────┤
│ ── Lumina, teaching you now ──  │
│                                 │
│  [streaming personalized        │  ← latest.text from
│   explanation of the current    │    useLuminaLiveSession,
│   event, in student's ALE       │    Source Serif 4, MathRenderer
│   style]                        │
│                                 │
├─────────────────────────────────┤
│ Timeline (recent teacher beats) │  ← LessonState.timeline, collapsed
├─────────────────────────────────┤
│ [Ask Lumina about this]         │  ← optional side chat, non-blocking
└─────────────────────────────────┘
```

Behavior:

- Wraps `useLuminaLiveSession(lessonId)` — every accepted event auto-generates a personalized explanation via the existing edge function, which already fuses `cachedContext` (lecture state) + `studentContext` (full ALE).
- No manual refresh, no re-upload. State evolves continuously.
- When the parent `lesson_sessions.status` flips to `ended`, the room auto-closes and shows a "Meeting ended" summary card (concepts covered, mastery deltas from `recordTeaching` events already fired during the session).
- Joining mid-lecture: on mount, hook seeds `initialLastSeq` from `SELECT max(seq) FROM lesson_events WHERE lesson_id=?` so the student catches up cleanly without gap-rejecting the next real event; a one-shot backfill fetches the last N events to hydrate `LessonState` before subscribing.

**4. Auto session management**

- Student join card is driven by Realtime on `lesson_sessions` — appears when live, disappears when ended.
- Teacher ending the meeting closes all student rooms via the same signal.
- Reconnect on tab focus / network return is already handled by A5's subscription lifecycle.

**5. Continuous personalization loop (already wired, made visible)**

The A10 hook already:

- calls `getContext(feature)` per event → pulls full ALE profile.
- feeds student interactions back via `recordTeaching` / `recordChat` / `recordAnswer`.

This phase surfaces that loop in the UI: a small "adapting to you" indicator when a new ALE snapshot is folded in, and the optional side-chat routes through `recordChat` so ALE keeps evolving during the meeting.

### What we do NOT build (explicit non-goals)

- No changes to A1–A10 modules (sync, scheduler, cache, hook, reducer, `lumina-live` function).
- No WebRTC video/audio conferencing. The "meeting" is the teacher's real classroom + the student's Lumina stream. If teachers want video, that's a separate stack (Daily/LiveKit) — not this phase.
- No AI self-editing. No ministry feature-generation. (Those threads stay closed per prior turns.)
- No predictive precompute (Phase B1 in the plan doc) and no gap-driven replay (Phase B3) — join-time backfill covers the common case; deep replay stays deferred.

### Technical section

Files to add:

- Migration: extend `lesson_sessions` with `status`, `title`, `started_at`, `ended_at` columns if missing; RLS policies; `GRANT` block; realtime publication.
- `src/pages/TeacherLiveConsole.tsx` — teacher UI, uses `supabase.from('lesson_events').insert(...)`.
- `src/pages/StudentLiveRoom.tsx` — student UI, uses `useLuminaLiveSession`.
- `src/components/student/LiveJoinCard.tsx` — dashboard entry point, subscribes to `lesson_sessions` changes.
- `src/hooks/useLessonSessionLifecycle.tsx` — thin hook to observe/mutate a `lesson_sessions` row.
- `src/hooks/useLessonBackfill.tsx` — one-shot fetch of `lesson_events` up to current `max(seq)` for mid-lecture joiners; returns `{ hydratedState, startSeq }` to seed the hook.
- Route registration in `src/App.tsx`; nav entries under the existing Teacher and Student dashboards.
- Optional: `supabase/functions/lumina-live-classify-speech/index.ts` for voice → event-kind classification (Lovable AI). Deferrable to a sub-phase if you'd rather ship text-only first.

No edits to:

- `useLuminaLiveSession.tsx`, `lumina-live/index.ts`, or any `src/lib/lse/*` module.
- `adaptiveIntelligence.ts` — we only *call* it via the existing hook API.

### Open questions before I write code

1. **Voice capture on the teacher side — in this phase, or a follow-up?** Text-only ships faster and cleaner; voice is a nice second pass.
2. **Should the student side-chat during a live meeting write to the existing `conversations`/`messages` tables, or stay ephemeral to the session?**
3. **Who can start a live session — any teacher of the class, or only the class's primary teacher?** (Affects the RLS `WITH CHECK` clause.)
4. There should be a new tab for students called online meetings but this time it's in the taskbar, not a tab as a circle and it must show a red dot near the icon if there is an ongoing live for this student's grade teachers can schedule a live and when they do so a notification gets sent to all of the students that will get this meeting like if a teacher schedules a meeting for grade 8 every student in grade 8 should be notified and I have noticed that for every zoom meeting a teacher can copy it and paste the meeting link so I think they should be able to do the same thing with Lumina so create your own message and what not
5. And the most important part is that Lumina must be added, and it should be effective it should always hear what the teacher is saying and the second a student requests Lumina live the meeting switches from the teachers perspective to another teaching perspective as in a parallel, live video where Lumina is speaking, and there are also subtitles for Lumina so we need a transcription system to help Lumina and my suggestion is whisper.cppâ  +Â  whisper.cpp.ts bindingsâ  this is a link you can go look it up and the name of the actual device itself is called whisper.cpp and please know that lumina listens to the teacher with that transcription engine and then like, for example, if I call aluminum live at the very start of the meeting it should shift from the teacher view where I can see what the teacher is saying to Lumina of view, and it cuts audio of the teacher and luminas audio begins, and there should be also an option to view what the teacher is sharing on the screen, but without what the teacher saying, but anyways, Lumina, I should listen to the teacher and whoever calls Lumina Lumina must respond, not at the very start of the lecture, but at the point, they are currently in like if the start of the lecture was talking about photosynthesis and a part comes and it's all about how plans produce sugar and what not then I called Lumina live the live must start at the part where plants make sugar. Then Lumina collect the data that the teacher says, and it gets the adaptive data of the student that called it so it can identify what would be the most great way of explanation be for this student and Lumina should do all of that while keeping great synchronization and low latency and because I really don't feel like testing anything I want you to verify everything by code and I know low latency can only be verified if I physically test it, but I don't feel like it so just verify my code because if you verify my code, they tell us if this should work or not when I actually verify it physically