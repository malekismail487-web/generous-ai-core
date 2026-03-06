## Why Exam Generation Is Slow — Analysis and Fix Plan

### Root Cause

The exam generation makes **multiple sequential AI API calls**, each taking 10-30+ seconds:

1. **Generation call** — Gemini 3 Flash generates questions (~10-15s)
2. **Validation call** — Gemini 2.5 **Pro** validates questions in chunks of 15 (~20-40s per chunk). For 30 questions, that's **2 sequential validation calls**
3. **Replacement generation** — if validation deletes questions, another generation call (~10-15s)
4. **Re-validation of replacements** — yet another validation call (~15-20s)

**Total worst case for 30 questions: 4-6 AI calls = 60-120+ seconds.**

The biggest bottleneck is using `gemini-2.5-pro` for validation — it's the most powerful but also the **slowest** model.

### Plan

1. **Switch validation model to `gemini-2.5-flash**` (primary) and `gemini-2.5-flash-lite` (fallback) — validation doesn't need Pro-tier reasoning, Flash is accurate enough and 3-5x faster
2. **Parallelize validation chunks** — currently chunks of 15 are validated sequentially with `for` loop + `await`. Use `Promise.all()` to validate both chunks simultaneously, cutting validation time in half for 30-question exams
3. **Skip replacement re-validation** — replacement questions are already generated with self-verification prompts. Re-validating them adds another round trip for minimal benefit. Trust the generation prompt instead
4. **Reduce max_tokens on validation** — currently 8000, but validation responses are compact JSON. Reduce to 4000 to speed up response generation
5. **Add a faster generation model** — use `gemini-2.5-flash-lite` as a third fallback for generation to reduce wait times when other models are busy

### Technical Details

**File**: `supabase/functions/generate-exam/index.ts`

- Lines 299-302: Change validation models from `["google/gemini-2.5-pro", "google/gemini-2.5-flash"]` to `["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"]`
- Lines 230-234: Replace sequential chunk loop with `Promise.all()` for parallel validation
- Lines 240-247: Remove the re-validation step for replacement questions (just push replacements directly)
- Line 321: Reduce `max_tokens: 8000` to `max_tokens: 4000`
- Lines 543-546: Add `gemini-2.5-flash-lite` as third generation fallback model

**Expected improvement**: From ~60-120s down to ~20-40s for a 30-question exam.

I like this plan and I approve it but the AI MUST GENERATE CORRECT EQUATIONS WITH ANSWERABLE QUESTIONS AND ANSWERABLE CHOICES