## Lumina "Onyx" Redesign

A full visual rebuild of every role surface around the new atom logo: a strict two-tone system (Onyx dark / inverted Bone light), living motion, and radically simplified layouts — with zero features removed.

### Design direction
- **Palette:** exactly two families. Onyx (`#0A0A0B` → `#141416` surfaces, `#F4F4F2` ink) and its exact inversion for light mode. No third hue anywhere. Depth comes from elevation, grain, and light — not color.
- **Identity:** the atom logo becomes the app's motion language — orbital arcs, a luminous nucleus, curved arrow paths. It appears as loaders, empty states, section dividers, and the auth centerpiece.
- **Type:** oversized editorial headings, generous line height, sentence-case human wording. Every label, button, and toast rewritten from system-speak to plain speech ("Pick up where you left off" instead of "Resume Session").
- **Simplicity rule:** each screen gets one primary action, one scannable surface, everything else behind progressive disclosure. Same features, fewer things visible at once.

### Motion system (real, not decorative)
A shared `src/lib/motion/` layer:
- **Orbit engine** — SVG/canvas orbital paths with parallax depth, used behind hero areas and loaders.
- **3D layer** — CSS 3D transforms (perspective cards, tilt-on-pointer, depth-stacked panels, flip reveals) plus a lightweight WebGL nucleus for the auth/dashboard hero.
- **Choreography** — staggered reveals, shared-element transitions between tabs, magnetic buttons, morphing icons, scroll-linked parallax.
- **Respect** for `prefers-reduced-motion` and the existing Lite Mode flag; heavy layers auto-disable.

### Phases
1. **Foundation** — rewrite `index.css` tokens + `tailwind.config.ts` for the two-tone system; new elevation/grain/glow primitives; motion library; logo asset wired into `LuminaLogo`; wallpaper presets rebuilt as onyx tonal variants.
2. **Shell** — auth, country/language gates, bottom nav, sidebar, headers, loaders, toasts, empty states, modals.
3. **Student** — home grid, chat, materials, assignments, notes, practice, flashcards, podcasts, live room, profile, gamification.
4. **Teacher** — dashboard, materials, assignments, copilot, analytics, live console.
5. **Admin + Parent** — school admin dashboard, panels, parent portal.
6. **Ministry + Super Admin** — control center shell, all 16 control panels, intelligence workspace, extensions, observatory.
7. **Copy pass + polish** — rewrite all user-facing text, audit both themes, reduced-motion and mobile checks, dossier.

### Technical notes
- Components keep their logic and data flow; changes stay in presentation layers and shared primitives.
- shadcn variants get restyled centrally so the redesign propagates rather than being hand-patched per file.
- No hardcoded color utilities — everything through semantic tokens, so light mode is a true inversion.
- 3D work uses CSS transforms first; WebGL only for the two hero moments, lazy-loaded so bundle cost stays low.

I'll deliver it phase by phase, writing a dossier at the end that reflects exactly what shipped.