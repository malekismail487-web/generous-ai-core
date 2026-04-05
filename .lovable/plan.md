Fix: Chat History, Behavioral Tracking, and Adaptive Level

## Problems Found

**1. Behavioral signals not incrementing during chat**
`StudyBuddy.tsx` calls `recordChat()` which maps to `recordChatMessage()` in `adaptiveIntelligence.ts`. That function only records emotion and cognitive events — it never calls `addBehavioralPoint()` from `useActivityTracker`. So chatting with Lumina produces zero behavioral data points. The "72 behavioral signals" counter will never go up from chatting.

**2. Adaptive level stuck at "beginner"**
The level badge reads from `student_learning_profiles` in the database, which only updates when quiz/exam answers are recorded. Chat messages have no effect on it. Even if a student has had 100 conversations, the level won't change because only `recordAnswer` (from quizzes) triggers the database update.

**3. Chat history not loading past conversations**
The history drawer opens and shows conversations, but selecting one may fail silently if the conversation fetch encounters an issue or if the style picker state interferes.

## Changes

### 1. `src/components/student/StudyBuddy.tsx`

- Import `useActivityTracker` methods: `trackQuestionAsked`, `trackExplicitRequest`
- After every user message sent, call `trackQuestionAsked(content)` to add a behavioral data point (this increments the behavioral signals counter)
- Also call `trackExplicitRequest(content)` to detect explicit format requests
- After every assistant response, call `trackTimeOnContent('verbal', estimatedDuration)` to track engagement
- Ensure `handleSelectConversation` properly resets state and loads messages

### 2. `src/lib/adaptiveIntelligence.ts` — `recordChatMessage()`

- Enhance to also call `addBehavioralPoint()` directly so that every chat message across ALL components (not just StudyBuddy) registers as a behavioral signal
- Import the behavioral tracking utilities and classify each message's modality
- This ensures the behavioral counter increments from any chat context in the app

### 3. `src/hooks/useAdaptiveLevel.tsx` — Chat-based level adjustment

- Add a method `recordChatInteraction()` that updates the learning profile based on accumulated chat signals (complexity of questions asked, topics discussed)
- This allows the level to progress from chat activity, not just quiz answers
- The level progression will still be conservative — it takes sustained high-level questioning to move from beginner to intermediate

### 4. `src/components/student/LearningProfileCard.tsx`

- Add a `recalculate` trigger after detecting new behavioral data to ensure the UI reflects the latest count immediately

## Technical Details

The core bug is a disconnect: `recordChatMessage()` feeds the emotional/cognitive subsystems but skips the behavioral tracking pipeline entirely. The fix bridges these two systems so every user message in chat:

1. Gets classified by modality (visual/logical/verbal/kinesthetic/conceptual)
2. Gets added as a `BehavioralDataPoint` to localStorage
3. Increments `totalInteractions` in the behavioral profile
4. Eventually feeds into learning style recalculation

For the adaptive level, chat interactions will contribute "soft" signals — a student asking advanced questions consistently will see their level adjust, though quiz answers remain the primary driver.

## Files to Edit

- `src/components/student/StudyBuddy.tsx`
- `src/lib/adaptiveIntelligence.ts`
- `src/hooks/useAdaptiveLevel.tsx`
- `src/components/student/LearningProfileCard.tsx`

REMEMBER THAT IT MUST DOCUMENT EVERY SINGLE MESSAGE THE USER TYPES WORD FOR WORD LITERALLY THIS IS NO JOKE YOU MUST NOT IGNORE THIS