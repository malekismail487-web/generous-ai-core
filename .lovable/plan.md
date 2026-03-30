# Merge AI Tutor into Lumina + Add Mind Maps

## What's Changing

1. **AI Tutor tab merges into Study Buddy (Lumina)** — The chat tab with conversation history, streaming, and the empty state gets absorbed into the Study Buddy component. Lumina becomes the single AI chat interface.
2. **Mind Maps replaces AI Tutor** on the home grid — A new interactive feature where students enter a topic and the AI generates a visual mind map they can explore.

## Merge: AI Tutor → Lumina (Study Buddy)

The AI Tutor (`chat` tab) currently has features Study Buddy lacks:

- **Conversation history** (persistent via Supabase, with a history drawer)
- **Conversation management** (create, select, delete conversations)
- **Background context** from past conversations

Study Buddy currently uses only `localStorage` for memory.

### Changes:

- **StudyBuddy.tsx**: Add conversation persistence using `useConversations` hook. Add the history drawer button. Replace localStorage memory with real Supabase-backed conversations.
- **StudentHomeGrid.tsx**: Replace the `chat`/`AI Tutor` entry with `mindmaps`/`Mind Maps`.
- **Index.tsx**: Remove the `chat` case from `renderMainContent`. Remove chat-related state/imports (localMessages, historyOpen, conversation hooks used only for chat). Add `mindmaps` case.
- **BottomNav.tsx**: Remove `chat` from the TabType union.

## New Feature: Mind Maps

A component where the student types a topic (e.g., "Photosynthesis") and the AI generates a structured mind map.

### Implementation:

- **New file: `src/components/student/MindMapGenerator.tsx**`
  - Input form: topic + optional subject/grade
  - Calls the chat edge function with a specialized prompt that returns JSON nodes/connections
  - Renders an interactive SVG/canvas mind map with:
    - Central topic node
    - Branch nodes for subtopics
    - Sub-branch nodes for details
    - Tap a node to expand it with more AI detail
  - Color-coded branches, smooth animations
  - Option to regenerate or explore a subtopic deeper

### AI Prompt Strategy:

- System prompt instructs Gemini to return structured JSON: `{ center, branches: [{ label, children: [{ label }] }] }`
- Parse the JSON and render as an interactive radial/tree layout using SVG

### Files to modify:

- `src/components/StudentHomeGrid.tsx` — Replace `chat` with `mindmaps`
- `src/pages/Index.tsx` — Remove chat case, add mindmaps case, merge chat hooks into StudyBuddy
- `src/components/BottomNav.tsx` — Update TabType
- `src/components/student/StudyBuddy.tsx` — Add conversation history support (useConversations), history drawer
- `src/components/student/MindMapGenerator.tsx` — New component

## Technical Detail

The mind map renderer will use pure SVG with React state for node positions, calculated radially from center. Tapping a leaf node triggers another AI call to expand that subtopic, adding child nodes with animation. No external library needed — the home grid already uses a similar SVG circular layout pattern.

Make sure that Lumina has its current powers. The only thing that will change is that Lumina will have her previous powers but merged with the powers of AI tutor so they can become one 