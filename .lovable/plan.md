## Lumina Code Lab — student-side coding capability

Goal: let Lumina write code (like Claude/ChatGPT/Kimi) and let students view, copy, and **live-preview** the result inside the app. No hosting/domains involved — preview is sandboxed in-browser only.

### 1. Inline code rendering in chat (every Lumina message)

Upgrade `src/components/MathRenderer.tsx` to render fenced code blocks (`lang …` ) with a real code component instead of the current minimal `<code>` styling:

- New `CodeBlock` component with:
  - Syntax highlighting (`react-syntax-highlighter` w/ Prism, dark/light theme aware).
  - Header row: language label, **Copy**, **Run / Preview** (when previewable), **Open in Code Lab**.
  - Copy uses `navigator.clipboard`, shows toast.
- Wire into `MathRenderer` via the ReactMarkdown `code` component override.

### 2. Live preview (sandboxed, in-browser only)

Previewable languages:

- **HTML / CSS / JS / HTML+CSS+JS combos** → rendered in an `<iframe sandbox="allow-scripts">` using a generated `srcDoc`. No network, no parent access.
- **React (JSX/TSX single-file)** → rendered in the same sandboxed iframe using Babel standalone (CDN inside the iframe) + React/ReactDOM CDN. Single `App` component convention.
- **Python** → executed in-browser via Pyodide (loaded lazily on first run). Stdout streams into a console panel. No filesystem/network.
- **SQL** → executed via `sql.js` (SQLite WASM) against an in-memory DB, results shown as a table.
- **Markdown** → rendered preview.
- Other languages (Java, C++, Go, Rust, etc.) → show code only with a note: “Preview not available for {lang}. Copy and run locally or paste into GitHub.”

All execution happens client-side. Nothing is uploaded; no domains needed.

### 3. Code Lab page (full editor + preview)

New route `/code-lab` and a new tab in `BottomNav` for students (icon: `Code2`).

Layout (mobile-first, split):

```text
┌──────────────────────────────┐
│ Files | Lang ▾ | Run | Share │
├──────────────┬───────────────┤
│   Editor     │   Preview     │
│ (Monaco)     │ (iframe /     │
│              │  console)     │
├──────────────┴───────────────┤
│ Console (stdout / errors)    │
└──────────────────────────────┘
```

- Editor: `@monaco-editor/react` with TS/JS/HTML/CSS/Python/SQL modes, theme synced with app.
- Multi-file tabs for HTML/CSS/JS projects (index.html / styles.css / script.js).
- “Ask Lumina” button: sends the current code + a prompt to the chat edge function, response streams back and can replace or insert into the editor.
- “Copy all”, “Download .zip” (via `jszip`), and a “Copy GitHub-ready snippet” action (formatted with file headers) — satisfies the “paste into GitHub” requirement without needing a domain.
- Saved snippets persisted per-user in a new `code_snippets` table (RLS: owner-only).

### 4. Lumina prompt upgrade (server side only)

Edit `supabase/functions/chat/index.ts` system prompt to add a **Coding** section:

- Lumina may write code in any language when asked.
- Always wrap code in proper fenced blocks with the language tag.
- For runnable web demos, prefer a single self-contained HTML block.
- For React, output one file exporting `App`.
- Never claim it deployed anything; tell the student they can preview in Code Lab or copy to GitHub.
- Keep existing identity/safety rules intact.

No client-side prompt changes (per project rules).

### 5. Database (Lovable Cloud)

Migration:

- `code_snippets` table: `id`, `user_id`, `title`, `language`, `files jsonb`, `created_at`, `updated_at`.
- RLS: `user_id = auth.uid()` for select/insert/update/delete.
- Trigger to auto-update `updated_at`.

### 6. Files to add / change

- Add: `src/components/CodeBlock.tsx`, `src/components/code/CodePreviewFrame.tsx`, `src/components/code/PyodideRunner.tsx`, `src/components/code/SqlRunner.tsx`, `src/pages/CodeLab.tsx`, `src/hooks/useCodeSnippets.tsx`.
- Edit: `src/components/MathRenderer.tsx` (code override), `src/components/BottomNav.tsx` (new tab), `src/App.tsx` (route), `src/components/StudentHomeGrid.tsx` (entry tile), `supabase/functions/chat/index.ts` (coding rules).
- Deps: `react-syntax-highlighter`, `@monaco-editor/react`, `monaco-editor`, `jszip`. Pyodide and sql.js loaded lazily from CDN inside the iframe so they don’t bloat the main bundle.

### 7. Safety & isolation

- All previews run in `<iframe sandbox="allow-scripts">` (no `allow-same-origin`) so student code can’t touch app state, cookies, or other schools’ data.
- Pyodide/sql.js are CPU-only, no network access from the sandboxed iframe.
- Snippets are RLS-scoped per user; no cross-school leakage.
- Code is scanned by the existing `scan-content` flow before saving (reuses moderation pipeline).

### Out of scope

- No deployment, no custom domains, no server-side code execution.
- No collaborative editing (can be a follow-up).
- Also Lumina should be able to code with all languages if that's possible and there should be a circle on the top left called code. It should not be connected to the web. It should be a tiny circle on the top left it should function literally exactly like you and any other AI that can code you tell it what to code, it codes it, you preview the Work, but minus the ability of creating a domain, but if they use really wants to create a domain, then they have the option to view the entire codes that Lumina coded