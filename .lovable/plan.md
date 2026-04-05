
Goal:
Make double-tap expansion work reliably on mobile/desktop for every expandable mind-map node, and show “End of node” when a node can’t be meaningfully expanded further.

What I found:
- The current feature uses SVG `onClick` to detect double taps. On phones, two taps on SVG often do not arrive as two clean `click` events, so the single-tap lecture timer wins and the sheet opens instead.
- Expansion is blocked once a node has `expanded = true`, so some nodes stop reacting even when the user expects further branching.
- Grandchildren currently bypass the shared expand handler, so not every visible node can expand.
- The AI prompt forces 3–4 children, which makes “this is a terminal node” impossible to detect cleanly.

Plan:
1. Replace the gesture logic
- Switch node interaction from `onClick` to pointer/touch-safe handling (`onPointerUp`).
- Track the tapped node with a stable node path plus timestamp in a ref.
- Keep the single-tap lecture delay, but cancel it when the same node is tapped again within the double-tap window.
- Add `touch-action: manipulation` on the SVG/container so mobile double taps are not eaten by browser behavior.

2. Make expansion path-based instead of index-limited
- Refactor `expandNode(branchIdx, childIdx?)` into a path-based expansion helper so any visible node can use the same logic.
- Add recursive helpers to read/update a node anywhere in the tree.
- Route all node circles through one shared tap handler, including deeper descendants.

3. Stop treating `expanded` as a blocker
- Remove the `!target.expanded` guard.
- Use expansion state only for UI/animation, not to prevent future branching attempts.
- Merge unique children by label instead of silently doing nothing.

4. Add real “End of node” behavior
- Update the expansion prompt so the AI is allowed to return `{ "children": [] }` when a node is already atomic.
- If the AI returns no valid children, only duplicates, or unusable labels, mark that node as terminal.
- Show a toast message: `End of node` (with Arabic localization too).
- If the user double taps that same terminal node again, show the message immediately without making another AI request.

5. Preserve the lecture feature
- Keep one tap = lecture.
- Only fire lecture generation after the double-tap window expires with no second tap.
- Keep the current lecture sheet and image flow unchanged.

6. Rendering updates
- Pass each rendered node its path and terminal/expanding state.
- Keep the current animation style, but make newly added descendants animate outward from their parent after expansion.

Files to change:
- `src/components/student/MindMapGenerator.tsx`

Technical notes:
- Add a small `terminal?: boolean` field to `MindMapNode`.
- No database changes are needed.
- This should fully cover parent nodes, child nodes, and any deeper nodes that are rendered.
