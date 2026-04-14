

# Plan: Interactive Graph Calculator + Chat File Uploads with AI Vision

## Overview

Two major features: (1) a Desmos-style interactive graph calculator that the AI can render inline in chat AND students can use standalone, and (2) file/image/video upload support in the chat input so Lumina can analyze visual content.

---

## Feature 1: Interactive Graph Calculator

### How it works
- Build an `InteractiveGraph` component using **Function Plot** (lightweight, MIT-licensed math graphing library built on D3) or a custom canvas-based plotter
- The AI will output a special tag like `[GRAPH: y=x^2, y=sin(x)]` in its responses
- `MathRenderer` will detect these tags and render an interactive `InteractiveGraph` inline
- Tapping/clicking the small inline graph opens a full-screen modal with zoom, pan, and equation editing
- A standalone "Graph Calculator" tab is added to the student home grid for free exploration

### Components to create
- `src/components/student/InteractiveGraph.tsx` — core graphing component (canvas-based, supports multiple equations, zoom/pan, grid lines, axis labels)
- `src/components/student/GraphCalculator.tsx` — standalone full-page calculator with equation input, color picker, and graph controls
- `src/components/student/GraphModal.tsx` — full-screen modal for expanding inline graphs

### Changes to existing files
- `MathRenderer.tsx` — parse `[GRAPH:...]` tokens and render `InteractiveGraph` inline (small preview, tap to expand)
- `ChatMessage.tsx` — no changes needed (MathRenderer handles it)
- `supabase/functions/chat/index.ts` — add instruction to system prompt telling AI to output `[GRAPH: equation1, equation2]` when discussing mathematical functions
- `Index.tsx` — add `graphcalc` tab route to `renderMainContent`
- `StudentHomeGrid.tsx` — add Graph Calculator to the mind-map grid

---

## Feature 2: Chat File/Image/Video Uploads with AI Analysis

### How it works
- Add attachment button (paperclip icon) to `ChatInput`
- Support images (jpg/png/gif/webp), PDFs, and short video clips
- Files are uploaded to a new `chat-attachments` storage bucket
- For images: send as base64 data URL in the message content to the AI (Gemini supports multimodal input)
- For PDFs: extract text client-side and append to message
- For videos: extract a frame or send as-is if model supports it
- User messages with attachments show a thumbnail preview in the chat bubble

### Database & storage changes
- Create `chat-attachments` storage bucket (private, with RLS for authenticated users)
- Add `attachments` JSON column to `messages` table (optional, stores file metadata)

### Components to modify
- `ChatInput.tsx` — add paperclip button, file picker, preview thumbnails, support `onSend(message, attachments?)` signature
- `ChatMessage.tsx` — render attachment previews (image thumbnails, file icons) in user bubbles
- `StudyBuddy.tsx` — pass attachments through to the edge function, handle multimodal message format
- `supabase/functions/chat/index.ts` — accept multimodal messages (Gemini vision format with `image_url` content parts)

### Edge function changes
The chat edge function needs to support the OpenAI-compatible multimodal format that Gemini accepts:
```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "What is this?"},
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
  ]
}
```

---

## Technical Details

### Graph rendering approach
- Use HTML Canvas for performance (no heavy dependencies)
- Parse equations using a lightweight math expression parser
- Support: polynomial, trig, exponential, logarithmic, and custom functions
- Features: pinch-to-zoom, pan, toggleable grid, equation list with colors
- The AI prompt instructs Lumina to use `[GRAPH: y=x^2]` syntax when explaining math visually

### File upload flow
1. User taps paperclip → file picker opens (accept: image/*, .pdf, video/*)
2. File uploaded to `chat-attachments/{user_id}/{uuid}.ext`
3. For images < 4MB: convert to base64, send inline to AI
4. For larger files/PDFs: extract text, send as text context
5. Attachment metadata stored alongside the message

### File size limits
- Images: 10MB max
- PDFs: 10MB max  
- Videos: 20MB max (frame extraction for AI, full file stored)

---

## New files
1. `src/components/student/InteractiveGraph.tsx`
2. `src/components/student/GraphCalculator.tsx`
3. `src/components/student/GraphModal.tsx`

## Modified files
1. `src/components/MathRenderer.tsx` — graph tag parsing
2. `src/components/ChatInput.tsx` — attachment support
3. `src/components/ChatMessage.tsx` — attachment rendering
4. `src/components/student/StudyBuddy.tsx` — multimodal message handling
5. `src/components/StudentHomeGrid.tsx` — graph calculator grid item
6. `src/pages/Index.tsx` — graph calculator route
7. `supabase/functions/chat/index.ts` — multimodal message support
8. Migration: storage bucket + messages table update

