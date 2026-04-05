# Operation: Unleash the Full Intelligence Engine

## The Discovery

The 1,434-line adaptive intelligence engine with 7 subsystems (cognitive model, spaced repetition, mistake analyzer, predictive engine, emotional state, concept graph, rule generator) is **completely disconnected from every component**. None of the three main recording functions or the context generation API are called anywhere in the app. The brain exists but has no nervous system.

## What This Plan Does

Wire every AI-powered feature directly into the full intelligence engine so that all 7 subsystems actively feed data AND shape every AI response.

## Changes

### 1. Create a React hook: `useAdaptiveIntelligence` (NEW FILE)

A hook that wraps the engine's async functions for easy component use:

- `getContext(feature, subject?)` → calls `generateAdaptiveContext`
- `recordAnswer(params)` → calls `recordIntelligentAnswer`
- `recordChat(text)` → calls `recordChatMessage`
- `recordActivity(params)` → calls `recordStudyActivity`
- Caches the profile to avoid re-fetching on every render

### 2. StudyBuddy (`src/components/student/StudyBuddy.tsx`)

- Replace basic `useAdaptiveLevel` with the full engine
- Call `generateAdaptiveContext(userId, 'chat')` when building system prompt → injects all 7 subsystem contexts
- Call `recordChatMessage(content)` on every user message sent
- Call `recordStudyActivity` when a session starts

### 3. PracticeQuiz (`src/components/PracticeQuiz.tsx`)

- Replace `useAdaptiveLevel().recordAnswer` with `recordIntelligentAnswer` → feeds mistake analyzer, spaced repetition, cognitive model, emotional state, predictive engine, AND knowledge gaps simultaneously
- Use `generateAdaptiveContext(userId, 'practice_quiz')` to inject full context into question generation prompt

### 4. NotesSection (`src/components/NotesSection.tsx`)

- Call `getSimpleAdaptiveParams(userId, 'notes', subject)` before generation
- Pass full context string (not just level/style) to `streamChat`
- Call `recordStudyActivity` when notes are generated

### 5. SATSection (`src/components/SATSection.tsx`)

- Same pattern: use `getSimpleAdaptiveParams(userId, 'sat_prep', subject)`
- Call `recordStudyActivity` on lecture generation

### 6. FlashcardsSection (`src/components/FlashcardsSection.tsx`)

- Use full adaptive context for flashcard generation
- Call `recordStudyActivity` when flashcards are created

### 7. AIStudyPlan (`src/components/student/AIStudyPlan.tsx`)

- Call `generateAdaptiveContext(userId, 'study_plan', subject)` to get the full context including spaced repetition due items, knowledge gaps, cognitive state
- Inject `fullContext` into the system prompt (replacing the current basic level/style injection)

### 8. FileNotesGenerator (`src/components/FileNotesGenerator.tsx`)

- Pass full adaptive context to the `/functions/v1/explain-file` edge function

### 9. Main Chat (Index home via `StudentAppPreview` / `streamChat`)

- The home chat in Index.tsx uses `streamChat` directly — inject adaptive params

### 10. ExaminationSection

- Pass adaptive context to exam generation edge function

## Technical Pattern

Every component follows this flow:

```text
Component mounts
  → useAuth() gets userId
  → generateAdaptiveContext(userId, featureType, subject)
  → Returns { adaptiveLevel, learningStyle (= fullContext), profile }
  → Pass adaptiveLevel + learningStyle to streamChat / edge function
  → On user action, call recordIntelligentAnswer / recordChatMessage / recordStudyActivity
  → These feed all 7 subsystems simultaneously
```

## Files to Create

- `src/hooks/useAdaptiveIntelligence.tsx`

## Files to Edit

- `src/components/student/StudyBuddy.tsx`
- `src/components/PracticeQuiz.tsx`
- `src/components/NotesSection.tsx`
- `src/components/SATSection.tsx`
- `src/components/FlashcardsSection.tsx`
- `src/components/student/AIStudyPlan.tsx`
- `src/components/FileNotesGenerator.tsx`
- `src/components/ExaminationSection.tsx`

## Impact

Every AI response will now be shaped by: cognitive load, emotional state, mistake patterns, spaced repetition schedules, performance predictions, concept prerequisites, and personalized teaching rules — all at once.

Don't forget the normal subject as well because you didn't mention it and as I said, go absolute haywire with it I approve you using my credit. Heck you could even use like 60 credits. If you wanted just use the amount that you really need to go to the absolute max with every feature, you could think of.