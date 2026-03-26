

# Full Monochromatic Grey Redesign — 360 Overhaul

## What We're Building

A complete visual overhaul of the entire app to match your new logo's aesthetic: a monochromatic grey/charcoal palette for dark mode (matching the textured charcoal background in your dark logo photo) and a clean neutral white/grey palette for light mode (matching your light logo photo). Every role — Student, Teacher, School Admin, Super Admin, Ministry — gets this treatment.

## Summary of Changes

### 1. Replace the Logo Asset
- Copy your new icon (dark variant for dark mode, light variant for light mode) into the project
- Update `LuminaLogo` component to swap between dark/light variants based on current theme
- Remove the old `lumina-mascot.png` and all references to `LuminaMascot` component (the blue ghost)
- Replace `LuminaMascot` usage in `StudentHomeGrid.tsx` center button with the new `LuminaLogo`

### 2. Rewrite the Core Color System (`src/index.css`)

**Dark mode (`:root` / `.dark`)** — Monochromatic charcoal:
```text
Background:    ~#1a1a1a  (0 0% 10%)
Card:          ~#242424  (0 0% 14%)
Foreground:    ~#e5e5e5  (0 0% 90%)
Primary:       ~#ffffff  (0 0% 100%) — white as the accent
Secondary:     ~#2a2a2a  (0 0% 16%)
Muted:         ~#333333  (0 0% 20%)
Muted-fg:      ~#888888  (0 0% 53%)
Border:        ~#333333  (0 0% 20%)
Accent:        ~#a0a0a0  (0 0% 63%) — soft grey highlight
```

**Light mode (`.light`)** — Clean white/grey:
```text
Background:    ~#f5f5f5  (0 0% 96%)
Card:          ~#ffffff  (0 0% 100%)
Foreground:    ~#1a1a1a  (0 0% 10%)
Primary:       ~#1a1a1a  (0 0% 10%) — dark as the accent
Secondary:     ~#ebebeb  (0 0% 92%)
Muted:         ~#e0e0e0  (0 0% 88%)
Muted-fg:      ~#666666  (0 0% 40%)
Border:        ~#d4d4d4  (0 0% 83%)
Accent:        ~#555555  (0 0% 33%)
```

All gradient custom properties (`--gradient-primary`, `--gradient-warm`, `--gradient-hero`, etc.) will be rewritten to use grey tones — no more gold/teal/coral.

### 3. Update the Animated Background (`AnimatedBackground.tsx`)
- Change particle colors from gold/teal to shades of grey/white
- Connection lines become subtle white/grey instead of gold/coral

### 4. Update Ambient Glow CSS
- Blob colors change from gold/teal radial gradients to subtle white/grey glows
- Light mode blobs become soft grey shadows

### 5. Redesign the Student Dashboard (`StudentHomeGrid.tsx`)
- Center button: Replace `LuminaMascot` + purple gradient with `LuminaLogo` on a clean dark/light circle
- Ring items: Replace colorful gradients (`from-blue-500 to-cyan-500`, etc.) with monochromatic grey shades — each icon gets a subtle grey tone distinction rather than rainbow colors
- Hero greeting banner: Change from `--gradient-hero` (colorful) to a grey gradient
- Streak bar: Muted grey tones instead of rainbow gradient

### 6. Update Bottom Navigation (`BottomNav.tsx`)
- Active state uses `text-foreground` instead of `text-primary` (which was gold/coral)
- Active icon background becomes subtle grey instead of `bg-primary/15`

### 7. Update Wallpaper Presets (`wallpaperPresets.ts`)
- Change `default-dark` to the new charcoal grey HSL values
- Change `default-light` to the new neutral white HSL values
- Keep "Sunrise Sand" and other warm presets as selectable options

### 8. Preserve the Old Theme as a Selectable Option
- Keep all existing warm wallpaper presets (Midnight Ocean, Sunrise Sand, etc.) available in the wallpaper picker
- The defaults just become the new grey aesthetic

### 9. Update All Dashboard Pages
- **Teacher Dashboard**: Tab triggers, cards, badges — all follow the new grey tokens
- **School Admin Dashboard**: Same treatment — no hardcoded colors, everything flows from CSS variables
- **Auth page**: Gradient text and button styling updated
- **Language Select**: Same grey aesthetic
- Since these pages already use Tailwind's `bg-background`, `text-foreground`, `bg-card`, etc., most of the change is automatic via the CSS variable update. Hardcoded color classes (`from-blue-500`, `text-amber-400`, etc.) need to be replaced with grey equivalents.

### 10. Component-Level Color Fixes
Scan and update any components using hardcoded non-grey colors:
- `gradient-text` utility → grey-to-white gradient (dark) / dark-to-grey gradient (light)
- `message-user` bubble → dark grey gradient instead of gold
- Tab active states → grey/white instead of gold
- Streak flame icon → neutral grey instead of amber
- Badge/progress colors throughout teacher/admin panels

## Technical Details

**Files to modify:**
- `src/index.css` — Core theme rewrite (biggest change)
- `src/components/LuminaLogo.tsx` — Theme-aware logo switching
- `src/components/LuminaMascot.tsx` — Remove (or keep for legacy, unused)
- `src/components/AnimatedBackground.tsx` — Grey particle palette
- `src/components/StudentHomeGrid.tsx` — Remove color gradients, use monochrome
- `src/components/BottomNav.tsx` — Grey active states
- `src/lib/wallpaperPresets.ts` — Update defaults
- `src/pages/LanguageSelect.tsx` — Grey styling
- `src/pages/Auth.tsx` — Grey styling
- Various teacher/admin components with hardcoded colors

**Files to add:**
- New logo assets (dark + light variants) in `src/assets/`

**Approach:** The CSS variable system means ~70% of the app updates automatically when we change `index.css`. The remaining 30% is hunting down hardcoded Tailwind color classes (`from-blue-500`, `text-amber-400`, etc.) and replacing them with theme-aware equivalents.

