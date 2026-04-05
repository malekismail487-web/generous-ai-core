Fix: Wire Adaptive Learning Into All AI Generation Features

## Problem

6 out of 11 AI-powered features completely ignore the student's adaptive level and learning style. They generate identical content for beginners and advanced students.

## What Changes

### 1. Notes Section (`src/components/NotesSection.tsx`)

- Import `useAdaptiveLevel` and `useLearningStyle`
- Pass `adaptiveLevel` and `learningStyle` to `streamChat()` call

### 2. SAT Section (`src/components/SATSection.tsx`)

- Import both hooks
- Pass adaptive params to `streamChat()` call

### 3. Flashcards Section (`src/components/FlashcardsSection.tsx`)

- Import both hooks
- Pass adaptive params to the AI generation call

### 4. File Notes Generator (`src/components/FileNotesGenerator.tsx`)

- Import both hooks
- Pass `adaptiveLevel` and `learningStyle` to the `/functions/v1/explain-file` fetch body (same pattern as PodcastsSection)

### 5. AI Study Plan (`src/components/student/AIStudyPlan.tsx`)

- Import both hooks
- Inject level context into the system prompt sent to `/functions/v1/chat`

### 6. Practice Section (`src/components/PracticeSection.tsx`)

- Import both hooks
- Pass adaptive params to the AI generation call

## Pattern

Every fix follows the same 3-line pattern already used in SubjectsSection and PodcastsSection:

1. `const { currentLevel: adaptiveLevel } = useAdaptiveLevel();`
2. `const { getLearningStylePrompt } = useLearningStyle();`
3. Add `adaptiveLevel` and `learningStyle: getLearningStylePrompt()` to the AI call

## Files to change

- `src/components/NotesSection.tsx`
- `src/components/SATSection.tsx`
- `src/components/FlashcardsSection.tsx`
- `src/components/FileNotesGenerator.tsx`
- `src/components/student/AIStudyPlan.tsx`
- `src/components/PracticeSection.tsx`

No database or edge function changes needed.

&nbsp;

And remember the flow should work like this the AI tracks the data of the user like literal data from every questions answered and every activity and every single chat message and chat history this is gonna be considered input or the feeding source, the AI feeds on those sources and stores those sources in its brain it then like "talks" to itself and tries to make sense of the data. It makes sense of the data and converts it into like a new rule and also remember that it MUST record every single question they use their ever types and the AI ever types because this place is a huge role and let me tell you why for example the student talks to the AI and the AI notices that for example the student learns logically the most this is considered a data it stores it in its brain and it always knows to make that approach unless it changes again and the students now surprisingly learns conceptually this is all just an example.This is how it should work for the AI chat. For questions and answers it should record every answer solved by the student for answers that are solved right the AI brings a bit more questions like them, but if a question was answered wrong, the AI takes the data and tries to make less questions like it or maybe the same questions but like word it differently and the output or the AI's response should apply to the subject, and I think the subject should feed off the data recorded in every chat message and probably every right and wrong answers AI study plans should feed off chat messages and also right or wrong answer answers notes should follow both chat and answers and the SAT prep should follow chat and answers as well and flashcards should follow chat and answers as well. I think I have now. Explained to you how the adaptive learning should work and also a note. Take your time. I know I know that this is gonna be hard so take your time and please do it. Professionally don't do rushed codes or a little amount of code. No, I want it to be professional like I want you to write thousands upon thousands of lines because I need you to perfect this I know that the JSON files are big. They are like probably 9000 lines of codes. I want the adaptive learning to be as big or almost as big as that, whatever you can do just do a professionally.