# Operation: Self-Learning Teaching Engine

## What This Builds

Three interconnected systems that make Lumina detect whether its teaching is actually working, switch strategies when it's not, and transfer knowledge across subjects automatically.

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│              TEACHING STRATEGY TRACKER (NEW)                      │
├────────────────┬─────────────────┬───────────────────────────────┤
│  Strategy      │  Outcome        │  Effectiveness               │
│  Logger        │  Evaluator      │  Ranker                      │
│  "Used visual  │  "Did student   │  "Visual: 78% success        │
│   analogy for  │   get next 3    │   Step-by-step: 45%          │
│   fractions"   │   correct?"     │   → SWITCH to visual"        │
├────────────────┴─────────────────┴───────────────────────────────┤
│              CROSS-DOMAIN TRANSFER ENGINE (ENHANCED)              │
│  "Student strong in Math → use math analogies for Physics"        │
│  "Fraction errors → likely ratio errors in Chemistry too"         │
├──────────────────────────────────────────────────────────────────┤
│              LEARNING OUTCOME FEEDBACK LOOP (NEW)                 │
│  Teach topic → Track if student answers correctly later →          │
│  If YES → reinforce approach | If NO → flag & switch              │
└──────────────────────────────────────────────────────────────────┘
```

## Changes

### 1. New File: `src/lib/adaptive/teachingStrategyTracker.ts` (~400 lines)

**Teaching Strategy Logger:**

- Defines strategy types: `visual_diagram`, `step_by_step`, `analogy_based`, `socratic_questioning`, `practice_first`, `narrative_story`, `real_world_application`, `worked_example`, `peer_explanation`, `chunked_micro_lessons`
- Records which strategy was used for which topic/subject
- Stores in localStorage with timestamps

**Outcome Evaluator:**

- After a strategy is used, monitors the next 3-5 answers on that topic
- Calculates a "strategy effectiveness score" (0-100) per strategy per subject
- Detects patterns: "visual works for math but not for history"

**Strategy Effectiveness Ranker:**

- Ranks all strategies per subject by effectiveness
- Generates "preferred strategy" and "avoid strategy" lists per subject
- Produces a context prompt: "For Math, use visual diagrams (78% effective). Avoid narrative approach (32% effective)."

**Strategy Switch Detector:**

- Detects when the student has answered 3+ wrong in a row on the same topic after a particular teaching approach
- Triggers a "SWITCH STRATEGY" signal that gets injected into the next AI prompt
- Tracks how many times strategies have been switched per topic

### 2. New File: `src/lib/adaptive/crossDomainTransfer.ts` (~350 lines)

**Enhanced Transfer Map:**

- Expands the existing `knownTransfers` into a comprehensive skill-transfer graph with 15+ subject pairs
- Maps specific skills: "proportional reasoning" transfers from Math → Chemistry → Physics
- Maps specific error patterns: "if student confuses X in Math, they likely confuse Y in Chemistry"

**Active Transfer Recommendations:**

- When teaching a weak subject, finds the student's strongest correlated subject
- Generates specific analogies: "Think of chemical equations like algebraic equations — both sides must balance"
- Produces transfer context: "Student excels at Math (92%). When teaching Physics, frame concepts as mathematical relationships."

**Error Transfer Detection:**

- When a student makes a mistake in one subject, checks if the same conceptual error pattern exists in related subjects
- Creates "cross-domain knowledge gaps" that warn: "Student struggles with ratios in Math — likely also struggles with stoichiometry in Chemistry"

### 3. New File: `src/lib/adaptive/learningOutcomeLoop.ts` (~300 lines)

**Teaching Record:**

- Every time Lumina teaches a concept (lecture, notes, chat explanation), logs it with a hash of the topic
- Stores: topic, subject, strategy used, timestamp, teaching feature (notes/chat/lecture)

**Outcome Tracker:**

- When a student answers a question, checks if that topic was recently taught
- If correct → marks teaching as "effective", boosts that strategy's score
- If wrong → marks teaching as "ineffective", decrements strategy score
- Calculates a "teaching success rate" per strategy per subject

**Adaptive Strategy Selector:**

- Before generating content, checks what strategies have worked/failed for this student+subject
- Generates a ranked recommendation: "Try worked_example (82% success rate for this student in Math)"
- If all strategies have been tried and failed, recommends "escalation": break the topic into even smaller pieces or approach from a completely different angle

### 4. Update: `src/lib/adaptiveIntelligence.ts`

- Import and integrate all three new subsystems
- Add `teachingStrategyTracker` to the subsystem orchestration pipeline
- Add `crossDomainTransfer` enhanced context generation
- Add `learningOutcomeLoop` to recording helpers
- New recording function: `recordTeachingEvent(topic, subject, strategy, feature)`
- New recording function: `recordStrategyOutcome(topic, isCorrect)`
- Inject strategy effectiveness, cross-domain transfer, and teaching outcome data into every AI prompt

### 5. Update: `src/lib/adaptive/ruleGenerator.ts`

- Add new rule category: `strategy` for strategy-switching rules
- Generate rules like: "SWITCH STRATEGY for topic X — previous approach failed 3 times"
- Generate rules like: "USE cross-domain analogy — student strong in Math, teaching Physics"

### 6. Update: `src/hooks/useAdaptiveIntelligence.tsx`

- Expose `recordTeachingEvent` and `recordStrategyOutcome` to components
- Add `getStrategyRecommendation(subject)` for components to query before generating

### 7. Update AI-Generating Components

All components that generate content (StudyBuddy, SubjectsSection, NotesSection, SATSection, FlashcardsSection, AIStudyPlan, PracticeQuiz) will:

- Call `recordTeachingEvent()` after generating content
- Include strategy effectiveness context in prompts
- Include cross-domain transfer recommendations in prompts

PracticeQuiz and any quiz-taking component will:

- Call `recordStrategyOutcome()` after each answer to close the feedback loop

## Technical Details

**Storage:** localStorage for strategy data (consistent with existing subsystems). Keys:

- `lumina_teaching_strategies` — strategy usage log
- `lumina_strategy_effectiveness` — per-strategy success rates
- `lumina_teaching_records` — what was taught and when
- `lumina_cross_domain_gaps` — transferred error patterns

**Context injection example:**

```text
## TEACHING STRATEGY INTELLIGENCE
Strategies ranked by effectiveness for "Math":
1. visual_diagram: 82% success (12 uses)
2. worked_example: 71% success (8 uses)
3. narrative_story: 34% success (5 uses) ← AVOID

ACTIVE SWITCH SIGNAL: Student failed 3x on "quadratic equations" 
using step_by_step. SWITCH to visual_diagram or analogy_based.

## CROSS-DOMAIN TRANSFER
- Student excels at Math (92%) → use mathematical framing for Physics
- "Ratios" weakness in Math → likely affects Chemistry stoichiometry
- Leverage English reading skills (85%) for History source analysis

## TEACHING OUTCOME FEEDBACK
- Last 10 taught topics: 7/10 learned successfully (70% teaching rate)
- "Fractions" taught 3 times, still not learned → try completely different approach
- "Algebra basics" taught once, learned immediately → this student responds to worked examples in algebra
```

## Files to Create

- `src/lib/adaptive/teachingStrategyTracker.ts`
- `src/lib/adaptive/crossDomainTransfer.ts`
- `src/lib/adaptive/learningOutcomeLoop.ts`

## Files to Edit

- `src/lib/adaptiveIntelligence.ts`
- `src/lib/adaptive/ruleGenerator.ts`
- `src/hooks/useAdaptiveIntelligence.tsx`
- `src/components/student/StudyBuddy.tsx`
- `src/components/SubjectsSection.tsx`
- `src/components/NotesSection.tsx`
- `src/components/SATSection.tsx`
- `src/components/FlashcardsSection.tsx`
- `src/components/PracticeQuiz.tsx`
- `src/components/student/AIStudyPlan.tsx`

## Impact

Lumina will now detect if its teaching works, switch approaches when it doesn't, leverage cross-subject strengths to teach weak areas, and continuously improve its strategy selection based on accumulated student data. This is the feedback loop that moves the system from "smart tutor" to "self-improving tutor."

And also just wanted to throw this out, but you built a prediction engine. Do you know the possibilities of that you could do a lot of things with it and you better think of one after this plan and also you must include very high and intelligent reasoning. I think this exists because you're using Gemini 2.5