# Supercharging Lumina: Maximum Intelligence Features

## Summary

A comprehensive set of features to push Lumina as close to AGI-like behavior as possible within the current tech stack. These features give Lumina long-term memory, proactive initiative, multi-modal reasoning, self-reflection, emotional awareness, tool use, and autonomous planning capabilities.

---

## Features (9 total)

### 1. Persistent Long-Term Memory System

Lumina remembers facts about the student forever across all conversations — not just recent chat history.

- New `student_memory` table: `{ user_id, memory_type ('fact' | 'preference' | 'struggle' | 'strength' | 'personal'), content, subject, confidence, created_at }`
- After every conversation, Lumina auto-extracts key facts (e.g., "student struggles with fractions," "prefers visual examples," "is in Grade 10") and stores them
- On every new message, inject the top 20 most relevant memories into the system prompt
- Memory deduplication: merge similar memories, increase confidence on repeated signals
- Students can view and delete their memories from the Profile section

### 2. Proactive AI Agent (Daily Briefing + Nudges)

Lumina takes initiative instead of waiting to be asked.

- **Morning Briefing**: When the student opens the app, Lumina generates a personalized "Today's Plan" card on the home grid based on: upcoming assignments, weak subjects, streak status, unfinished goals, and exam schedule
- **Smart Nudges**: Proactive toast notifications like "You haven't practiced Biology in 5 days — want a quick quiz?" or "Your Math accuracy dropped to 62% — let's review fractions"
- Uses data from `student_learning_profiles`, `student_goals`, `assignment_submissions`, and `student_answer_history`

### 3. Reasoning Chain (Think-Before-Answering)

Lumina shows its reasoning process, like a thinking AI.

- Add a "Thinking..." expandable section before each response where Lumina shows its internal reasoning chain
- Modify the chat system prompt to instruct: "Before answering, output your reasoning inside `<thinking>...</thinking>` tags. Break down the problem, identify what you know, what you need to figure out, and your approach"
- Parse these tags client-side: show them in a collapsible `<details>` block with a brain icon
- Toggle in settings: "Show Lumina's thinking process" (default on)

### 4. Multi-Step Task Planner

Lumina can break complex requests into autonomous sub-steps and execute them sequentially.

- When a student says something complex like "Help me prepare for my Biology exam next week," Lumina:
  1. Identifies weak Biology topics from `student_learning_profiles`
  2. Creates a multi-day study plan
  3. Generates practice questions for weak areas
  4. Suggests flashcard decks to review
  5. Sets goals automatically in `student_goals`
- Rendered as a step-by-step checklist the student can follow, with each step actionable (tap to navigate to the relevant section)

### 5. Emotional Intelligence & Sentiment Detection

Lumina detects student frustration, confusion, or excitement and adapts its tone.

- Add sentiment analysis instructions to the system prompt: detect frustration ("I don't get it!", "this is so hard"), confusion ("what?", "huh"), boredom ("this is boring"), excitement ("wow!", "cool!")
- Adaptive responses:
  - Frustrated → simplify explanation, offer encouragement, break into smaller steps
  - Confused → ask clarifying questions, provide analogies
  - Bored → make it more engaging, add challenges, use storytelling
  - Excited → build on momentum, introduce advanced concepts
- Visual indicator: subtle emoji/mood icon next to Lumina's responses showing detected student mood

### 6. Self-Reflection & Accuracy Scoring

Lumina evaluates its own answers and flags uncertainty.

- Add to system prompt: "After generating your answer, rate your confidence 1-5 and explain why. Output as `<confidence level="N">reason</confidence>`"
- Parse and display as a small badge: green (4-5), yellow (3), red (1-2)
- For low-confidence answers, Lumina automatically adds: "I'm not fully sure about this. You may want to verify with your teacher."
- Track confidence over time in the memory system for self-improvement

### 7. Cross-Subject Connection Engine

Lumina automatically links concepts across different subjects.

- When explaining a topic, Lumina identifies and surfaces connections to other subjects the student is studying
- Example: "This concept of equilibrium in Chemistry is similar to supply-demand equilibrium you learned in Social Studies"
- Add to system prompt: "Always look for cross-disciplinary connections. Reference what the student has studied in other subjects (check their learning profiles)"
- Inject the student's active subjects and recent topics into the prompt context

### 8. Voice Personality & Conversational Memory

Make Lumina feel like a real tutor with personality continuity.

- Lumina remembers the student's name (from profile), uses it naturally
- Tracks conversation mood arc: if the session started frustrated but ended with understanding, Lumina acknowledges: "Great progress today! You went from confused to confident on derivatives"
- Lumina develops running jokes or callbacks: "Remember when you thought mitochondria was a planet? Look how far you've come!"
- Implemented via the long-term memory system (Feature 1) with a `personality` memory type

### 9. Autonomous Knowledge Gap Detector

Lumina proactively identifies what the student doesn't know.

- After every exam/quiz/assignment, Lumina analyzes wrong answers and builds a "Knowledge Gap Map"
- New `knowledge_gaps` table: `{ user_id, subject, topic, gap_description, severity ('minor' | 'moderate' | 'critical'), detected_from, resolved, created_at }`
- Gaps are shown as a visual "health chart" per subject in the Profile section
- Lumina references gaps in conversations: "I noticed you keep getting stoichiometry wrong — want me to break it down differently?"
- Gaps auto-resolve when the student demonstrates mastery (>85% accuracy on related questions)

---

## Technical Approach

### Database Migrations (2 new tables)

```text
student_memory:     user_id, memory_type, content, subject, confidence, created_at
knowledge_gaps:     user_id, subject, topic, gap_description, severity, detected_from, resolved, created_at
```

Both with RLS policies scoped to `auth.uid()`.

### Edge Function Changes

- `chat/index.ts`: Expand system prompt with memory injection, reasoning chain tags, sentiment instructions, confidence scoring, cross-subject context, and multi-step planning instructions
- New edge function `extract-memories/index.ts`: Called after each conversation to extract and store memories using a lightweight AI call

### Frontend Changes

- `StudyBuddy.tsx`: Parse `<thinking>` and `<confidence>` tags, render collapsible reasoning and confidence badges, inject memories into context
- `StudentHomeGrid.tsx`: Add "Morning Briefing" card that calls the AI on mount
- `ProfileSection.tsx`: Add "Lumina's Memory" and "Knowledge Gaps" subsections
- `GoalTracker.tsx`: Support AI-auto-created goals from the task planner
- `ChatMessage.tsx`: Render thinking blocks and confidence indicators
- New `SmartNudges.tsx`: Component that checks activity data and shows proactive suggestions

### Prompt Engineering

The bulk of features 3, 5, 6, 7, and 8 are achieved through sophisticated

&nbsp;

I like these so much if you could think of like a couple more than add them please if you can't or it's impossible then that's fine and continue on