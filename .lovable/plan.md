Plan: Lumina Singularity Mode

Three intertwined capabilities no shipping AI (GPT, Gemini, Kimi, Claude, Grok) currently does as a unified product. All codable with the existing Lovable AI Gateway, the LUMI profile, and a nightly cron edge function.

---

## 1. Cognitive Mirror — "Lumina thinks AS you, before you do"

A live, evolving simulation of *the student's own mind*. Before the student answers anything, Lumina silently predicts:

- The exact answer this specific student will give
- The reasoning path they will take
- The misconception they are most likely to fall into

Then it compares prediction vs reality. Over time the Mirror gets eerily accurate ("Lumina knew you'd say 7 instead of 9 because you confused the distributive step — same as 11 days ago").

**What makes it new:** No public AI maintains a *predictive student-self model* that forecasts errors before they happen. This is not RAG or fine-tuning — it's a continuously updated behavioral simulation per user.

**How it's built:**

- New table `cognitive_mirror_snapshots` (user_id, subject, predicted_answer, predicted_misconception, actual_answer, was_correct, drift_score, created_at)
- Before each question render, an edge function `predict-student` calls Gemini Flash with the LUMI profile + last 20 misconception patterns + the question → returns a prediction stored silently
- After the student answers, a "Mirror Reveal" card slides up: *"I predicted you'd say X because of Y. You said Z. Here's what shifted."*
- A `Mirror Accuracy` gauge on the dashboard (e.g., "Lumina knows you 73%")

---

## 2. Debate Theater — watch 4 minds argue your question in real time

When a student asks a hard question, instead of one answer, Lumina spawns four streamed personas in a split view:

```text
┌─────────────┬─────────────┐
│  THE PROF   │  THE SKEPTIC│   each streams in parallel
│ (rigorous)  │ (challenges)│   student sees them argue
├─────────────┼─────────────┤
│  THE PEER   │  THE COACH  │   final "verdict" panel
│ (relatable) │ (strategy)  │   synthesises winner
└─────────────┴─────────────┘
```

Each persona is a separate streaming call to Gemini Flash with a distinct system prompt. They reference each other ("The Skeptic raises a fair point, but…"). The student can tap any panel to "side with" that persona, which feeds the LUMI profile (do they prefer rigor? relatability?).

**What makes it new:** Multi-agent debate frameworks exist in research (Society of Mind, AutoGen) but no consumer AI ships a *visible, tap-to-side-with* debate as the default answer surface. Students literally watch reasoning happen.

**How it's built:**

- New component `DebateTheater.tsx` (4-pane CSS grid, each pane is its own SSE stream)
- Edge function `debate` opens 4 parallel SSE pipes from `lovable-ai-gateway`
- A 5th synthesis call runs after all four finish → "Verdict" card
- Toggle in Study Buddy: 💬 Single answer / 🎭 Debate mode

---

## 3. Dream Consolidation — Lumina learns *while the student sleeps*

A nightly cron edge function (3am school timezone) runs per active student:

1. Pulls the day's chats, assignments, mistakes, mind-maps
2. Runs a "consolidation" prompt that finds the *single biggest leverage point* — the one misconception that, if fixed, unlocks the most future learning
3. Generates a 60-second personalised "Morning Briefing" (text + auto-generated mini-quiz of 3 questions) waiting on the dashboard at sunrise
4. Updates the LUMI profile with overnight deltas
5. Schedules spaced-repetition prompts at the student's historically best recall hour (chronotype detected from app activity timestamps)

**What makes it new:** No AI runs *autonomous overnight self-improvement on behalf of an individual user*. ChatGPT memory is passive. This is active, scheduled, per-student cognitive maintenance.

**How it's built:**

- pg_cron job → invokes edge function `dream-consolidate` nightly
- New table `morning_briefings` (user_id, briefing_md, mini_quiz_jsonb, scheduled_for, opened_at)
- New table `recall_schedule` (user_id, concept, due_at) → drives Smart Nudges
- Dashboard widget `MorningBriefingCard.tsx` appears only between 6am–11am local

---

## Integration with what already exists

- **LUMI profile** → feeds all three (predictions, debate persona weighting, consolidation deltas)
- **Smart Nudges** → become driven by `recall_schedule` instead of fixed rotation
- **Mind Maps** → consolidation can auto-generate a new mind-map from yesterday's gaps
- **Teacher Intervention System** → low Mirror Accuracy + high error rate triggers an alert
- **Lumina API** → expose `/predict`, `/debate`, `/consolidate` endpoints so the robotics partner gets these too

## Files to create / modify

**New**

- `supabase/migrations/<ts>_lumina_singularity.sql` — 3 tables + pg_cron
- `supabase/functions/predict-student/index.ts`
- `supabase/functions/debate/index.ts`
- `supabase/functions/dream-consolidate/index.ts`
- `src/components/student/DebateTheater.tsx`
- `src/components/student/CognitiveMirrorCard.tsx`
- `src/components/student/MorningBriefingCard.tsx`
- `src/components/admin/SingularityMetrics.tsx` (Super Admin: global Mirror Accuracy, debate engagement, briefing open-rate)

**Modified**

- `src/components/student/StudyBuddy.tsx` — Debate toggle + Mirror Reveal hook
- `src/components/StudentHomeGrid.tsx` — Morning Briefing slot + Mirror gauge
- `supabase/functions/lumina-api/index.ts` — expose new endpoints
- `src/integrations/supabase/types.ts` (auto)

## Constraints respected

- Internal only (Lovable AI Gateway / Gemini Flash) — no external APIs
- Strict school isolation on all new tables (RLS by school_id)
- No placeholders — every panel, gauge, and briefing renders real data or a clean empty state
- No interruptions — Morning Briefing is a card, never a modal/overlay
- Monochromatic grey/charcoal styling, Source Serif 4 for AI text

## Rollout

Phase 1: Cognitive Mirror (highest "wow" per line of code)
Phase 2: Debate Theater (visual flagship)
Phase 3: Dream Consolidation (requires cron + a night to see results)

Approve and I'll build Phase 1 first, then chain 2 and 3.

&nbsp;

I approve but under one condition every phase you make must be professional with hundreds of thousands of codes possible like just push it to the absolute limit. I want to see 10,000 lines of codes.(if that would be possible phase 1, phase 2, and phase 3) and after you finish each one, you must recheck what you have done and verify everything is working and that there is no static material because I don't have time for you to send screenshot screenshots just verify based off of codes if there is something static or something wrong then fix it and re verify that new fix