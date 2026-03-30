# Mind Map Overhaul: Dual Interaction, Saved History, Smooth Animations

## Summary

Three major improvements to the Mind Map feature:

1. **Single tap = generate a lecture** about that node; **Double tap = expand** the node (current behavior)
2. **Saved mind map history** persisted in the database
3. **Smooth branching animations** — nodes grow outward organically instead of popping in

Plus fixing the **text cutoff** and **overlap** issues visible in the screenshots.

---

## 1. Dual Tap Interaction (Single vs Double)

**How it works:**

- Track clicks with a 300ms timer. If a second click arrives within 300ms → double tap (expand node). If not → single tap (generate lecture).
- Single tap opens a slide-up panel/sheet showing a streamed lecture about that node's topic, using the existing `streamChat` pattern.
- Double tap triggers the current `expandNode` AI call.
- Visual hint text updated: "Tap to learn, double-tap to expand"

**Implementation:**

- Add a `clickTimer` ref and `handleNodeClick(branchIdx, childIdx?)` function that distinguishes single vs double click
- Single tap: call chat edge function with a lecture prompt for that label, display result in a Drawer/Sheet component with `MathRenderer`
- Double tap: existing `expandNode` logic

## 2. Saved Mind Map History (Database)

**Database migration:** Create a `mind_map_history` table:

```sql
CREATE TABLE public.mind_map_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  topic TEXT NOT NULL,
  mind_map_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.mind_map_history ENABLE ROW LEVEL SECURITY;
-- Users can only CRUD their own
CREATE POLICY "Users manage own mind maps" ON public.mind_map_history
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**UI changes:**

- After generating a mind map, auto-save to the table
- Add a "History" button (clock icon) in the toolbar that opens a drawer listing past mind maps
- Tapping a saved mind map loads it instantly without re-generating
- Swipe-to-delete or delete button on history items

## 3. Smooth Branching Animations

**Problem:** Currently nodes appear instantly when the map loads or when expanded — feels rigid and mechanical.

**Fix:** Use SVG `<animate>` elements and CSS transitions:

- When mind map first renders, branches animate outward from center with staggered delays (each branch starts 100ms after the previous)
- Lines grow from center to branch position (animate `x2`/`y2` from center coords to final coords)
- Node circles scale from 0 to full size with a spring-like ease
- When expanding a node, new children animate outward from the parent node with the same organic feel
- Use React state to track `animationPhase` — nodes render at center initially, then transition to final positions via inline style transitions

**Approach:** Store node positions as state. On mount/expand, set initial positions at parent, then after a RAF, set final positions. CSS `transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)` handles the spring motion.

## 4. Fix Text Cutoff & Overlap

**Problems from screenshots:**

- 600×600 viewBox is too small — nodes at edges get clipped
- Fixed radii (140px branch, 70px child) cause overlap with 5+ branches
- Text truncated at 12-14 chars is too aggressive

**Fixes:**

- Increase viewBox to 900×900 with dynamic scaling based on branch count
- Increase truncation limits (20 chars for branches, 16 for children)
- Use multi-line `<text>` with `<tspan>` for longer labels (word-wrap inside nodes)
- Dynamically adjust `branchR` based on `branchCount` to prevent overlap
- Increase child angle spread to prevent clustering

---

## Files to Change


| File                                          | Change                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/components/student/MindMapGenerator.tsx` | All 4 features: dual tap, animations, layout fixes, history UI, lecture panel |
| Database migration                            | New `mind_map_history` table with RLS                                         |


## Technical Detail

- Single/double tap detection uses `setTimeout(300ms)` with a ref to track pending clicks
- Lecture panel uses a `Sheet` component from the UI library, streaming via the same chat edge function
- Animation uses CSS transitions on `transform` and `opacity` with staggered `transition-delay` per node index
- History stored as JSONB so the full mind map structure can be restored without re-generation
- ViewBox dynamically sized: `max(900, branchCount * 180)` to accommodate large maps and about lecture generation, it should function exactly like the subject section difficulty set to medium, not long, but everything from the subject section should be the generator for mind nap everything down to the details and image generation should be the generator for mind map