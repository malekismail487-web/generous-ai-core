- Inline Contextual Images — Replacing "Visual References" Gallery

## Summary

Currently, images (Wikipedia + AI diagrams) are fetched after lecture/note generation and displayed in a separate gallery section at the bottom ("Educational Diagrams" / "Visual References"). You want images placed **inline within the content**, contextually next to the relevant section they relate to — not lumped together at the end.

## Current State

- **Image sources**: Wikipedia thumbnails (up to 2) + AI-generated diagrams (up to 3) = 3-5 images total. This is already implemented and working.
- **Display**: Images appear in a separate grid section below the lecture/notes content.
- **MathRenderer**: Has an `images` prop that renders a "📸 Visual References" horizontal gallery at the bottom (only used by StudyBuddy chat).
- **SubjectsSection & NotesSection**: Render their own image grids after the MathRenderer content block.

## Plan

### Step 1: Update AI prompts to include image placement markers

Modify the lecture/notes generation prompts (in `SubjectsSection.tsx` and `NotesSection.tsx`) to instruct the AI to output markers like `[IMAGE_PLACEHOLDER_1]`, `[IMAGE_PLACEHOLDER_2]`, etc. at contextually appropriate points within the lecture text. This tells us where images should go.

### Step 2: Create an image insertion utility

Build a helper function that takes the generated text content + the array of fetched images, finds `[IMAGE_PLACEHOLDER_N]` markers, and replaces them with actual image markdown or a custom token that MathRenderer can render.

### Step 3: Update MathRenderer to render inline images

Instead of stripping all markdown images and showing a gallery at the bottom:

- Keep a whitelist of image sources (our own fetched Wikipedia/diagram URLs)
- Render `[INLINE_IMG:url:alt]` custom tokens as inline `<img>` elements within the content flow
- Remove the "📸 Visual References" gallery section entirely

### Step 4: Update SubjectsSection lecture view

- After images are fetched, call the insertion utility to merge images into `lectureContent` at the placeholder positions
- Remove the separate "Educational Diagrams" grid section below the lecture
- Images now appear inline within the lecture text

### Step 5: Update NotesSection notes view

- Same approach: merge images into `notesContent` at placeholder positions
- Remove the separate diagrams grid section

### Step 6: Update StudyBuddy / ChatMessage

- Remove the `images` gallery from MathRenderer
- For chat messages with images, insert them inline into the message content before rendering

## Files to modify

- `src/components/MathRenderer.tsx` — Add inline image rendering, remove gallery
- `src/components/SubjectsSection.tsx` — Update prompts with placeholders, merge images into content, remove separate image grid
- `src/components/NotesSection.tsx` — Same as above
- `src/components/ChatMessage.tsx` — Pass images inline instead of as gallery prop
- `src/components/student/StudyBuddy.tsx` — Merge images into message content
- `src/components/FileNotesGenerator.tsx` — If it also shows images, apply same pattern

## Technical Detail

The image placeholder approach works because:

1. AI generates text with `[IMAGE_PLACEHOLDER_1]` at contextual spots (e.g., after explaining photosynthesis)
2. Wikipedia/diagram images arrive async after text generation
3. A merge function maps placeholder N to image N from the fetched array
4. MathRenderer renders `<img>` tags at those positions inline

If the AI doesn't output enough placeholders or images don't match exactly, remaining images get distributed evenly through the content (e.g., after major section headings).

&nbsp;

Make sure that math renderer does not render from the inside and only renders when the user wants to view them, this should've been implemented by now but I'm just telling you to make sure 