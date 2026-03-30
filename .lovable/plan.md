

# Fix Mind Map JSON Parsing

## Root Cause
The `/functions/v1/chat` edge function prepends the Lumina personality system prompt to every request. When MindMapGenerator sends its "return ONLY valid JSON" system prompt, the AI gets conflicting instructions and sometimes wraps JSON in markdown fences, adds conversational text, or produces slightly malformed output.

## Fix (single file: `src/components/student/MindMapGenerator.tsx`)

1. **Robust JSON extraction** — Strip markdown code fences (`\`\`\`json ... \`\`\``), remove control characters, fix trailing commas before `}` or `]`, then find the outermost `{...}` with balanced brace counting instead of greedy regex.

2. **Truncation detection** — If open/close braces are unbalanced, attempt to repair by closing open structures before parsing.

3. **Stronger prompt** — Reinforce the "ONLY JSON, no markdown, no explanation" instruction and add "Do not wrap in code fences" to fight the Lumina prompt influence.

4. **Apply same fix to `expandNode`** function which has the identical parsing vulnerability.

No other files need changes.

