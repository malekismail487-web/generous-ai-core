

## Diagnosis

The chat function already uses Lovable AI Gateway with `google/gemini-2.5-flash` as the primary model. The issue is:

1. **Temperature 0.4 is still too high** for educational content that must be factually precise.
2. **The model choice could be stronger** — `gemini-2.5-flash` is good but `gemini-2.5-flash-lite` as fallback is weak. Since you want freemium (no extra API cost), we should use better Lovable AI models.
3. **The topic adherence rules in the system prompt may not be strong enough** — the model is mixing topics (e.g., quadratic formula in a systems of equations lecture).

## Plan

### 1. Upgrade primary model to `google/gemini-2.5-pro`
This is the most accurate free model available via Lovable AI. It has the strongest reasoning and will dramatically reduce hallucinations and topic mixing. Use `gemini-2.5-flash` as the fallback (not `flash-lite`).

**Model cascade:**
- Primary: `google/gemini-2.5-pro` (best accuracy)
- Fallback: `google/gemini-2.5-flash` (still good, faster)
- Remove `gemini-2.5-flash-lite` (too weak for educational content)

### 2. Lower temperature to 0.2
Reduces randomness further, making outputs more deterministic and factual.

### 3. Strengthen topic adherence in system prompt
Add an explicit pre-generation checklist instruction: before generating any lecture/notes, the AI must list the exact subtopics that belong to the requested topic and explicitly exclude unrelated ones.

### Technical changes

**File: `supabase/functions/chat/index.ts`**
- Lines 350-353: Change model list to `["google/gemini-2.5-pro", "google/gemini-2.5-flash"]`
- Lines 365-368: Change `temperature: 0.4` → `temperature: 0.2`
- Lines 408-413: Change Groq `temperature: 0.4` → `temperature: 0.2`
- System prompt TOPIC ADHERENCE section: strengthen with explicit "list subtopics first, exclude unrelated concepts" instruction

All models used are free via Lovable AI — no additional API keys needed.

