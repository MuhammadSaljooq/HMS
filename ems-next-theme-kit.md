# ems-next Theme Kit — portable design system

A drop-in, copy-paste design system extracted verbatim from the ems-next (ALA Insurance) frontend.
Everything below is the real, shipping source of truth: the token values, fonts, radii, shadows, and
motion. Copy the three "drop-in" blocks (fonts → CSS tokens → Tailwind config) into a fresh Vite +
React + Tailwind app and you have the same look and feel.

- **Canvas:** cool blue-gray / pure-white surfaces
- **Primary accent:** purple `#7C6CF0`
- **Type:** Bricolage Grotesque (display) + Hanken Grotesk (body)
- **Motion:** one signature ease — `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart)
- **Dark mode:** authentic iOS-style, class-based (`.dark` on `<html>`), tokens flip so everything
  built on them adapts for free.

Tailwind v4 note: this project keeps a JS/TS `tailwind.config.ts` and loads it from CSS via
`@config`. Both the CSS and the config are below.

---

## 1. Fonts

Loaded from Google Fonts. Bricolage is a variable font with optical sizing (`opsz 12..96`) used for
headings and numbers; Hanken Grotesk is the body face. They pair on a real contrast axis (expressive
grotesque display vs. neutral humanist body), not two lookalikes.

**`index.html` `<head>`:**

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

- **`font-display` (Bricolage Grotesque)** — headings `h1–h4`, big numbers/stats. Weights 500/600/700/800.
- **`font-sans` (Hanken Grotesk)** — body, labels, tables. Weights 400/500/600/700.
- **`display=swap`** avoids invisible text while fonts load.
- Headings default to `font-display` + `tracking-tight` (see the base layer in the CSS block).
- Add the `.tabular` utility to any figure that updates in place (stats, prices, timers) so digits
  don't jitter (`font-variant-numeric: tabular-nums`).

**Type guidance** (not enforced by tokens — apply per component):
- Display headings: keep letter-spacing ≥ `-0.04em` (Bricolage is already tight; `tracking-tight`
  = `-0.025em` is plenty).
- Body line-height 1.5–1.75; cap measure at ~65–75ch.
- Use `text-wrap: balance` on h1–h3, `text-wrap: pretty` on long prose.

---

## 2. Color tokens

Semantic, token-based. **Never hard-code hex in components** — use the Tailwind classes
(`bg-surface`, `text-ink`, `border-line`, `bg-accent`, `text-accent-ink`, `bg-accent-teal-soft`, …).
Light values live in `:root`; the `.dark` class overrides the same names so consumers flip for free.

### Light (`:root`)

| Role | Token | Value |
|------|-------|-------|
| Page canvas | `--paper` | `#ffffff` |
| Cards / panels | `--surface` | `#ffffff` |
| Wells / search bars / inactive tabs | `--surface-2` | `#f3f4f8` |
| Top elevation (modals/popovers) | `--surface-3` | `#ffffff` |
| Borders / dividers | `--line` | `#e2e5ec` |
| Headings / big numbers | `--ink` | `#151a2d` |
| Body / table cells | `--ink-soft` | `#6b7280` |
| Labels / captions / timestamps | `--muted` | `#98a0b3` |
| Modal scrim | `--scrim` | `rgba(20,24,45,0.40)` |
| **Primary accent** | `--accent` | `#7c6cf0` |
| Accent text on soft bg | `--accent-ink` | `#5b4ed4` |
| Accent tint | `--accent-soft` | `#efecff` |
| Nav idle label | `--nav-idle` | `#565d70` |
| Nav idle icon | `--nav-icon` | `#7c8398` |
| Nav section header | `--nav-section` | `#6b7189` |
| Success / positive | `--positive` | `#1fb15b` |
| Error / negative | `--negative` | `#ef4a5f` |
| Warning | `--warning` | `#f6923a` |

**Named accent palette** — each a base + a `-soft` tint, for status pills, chips, chart series:

| Name | Base | Soft | Typical use |
|------|------|------|-------------|
| purple | `#7c6cf0` | `#efecff` | primary / brand |
| teal | `#18b8a8` | `#e6f9f6` | positive-neutral, "in person" |
| orange | `#f6923a` | `#fff1e3` | caution |
| red | `#ef4a5f` | `#fde8ea` | danger |
| green | `#1fb15b` | `#e7f9ee` | success |
| blue | `#2f6fed` | `#e8f0fe` | info ("contacted", reports) |
| coral | `#f2542d` | `#ffe7df` | cash / installments (charts) |
| amber | `#a16207` | `#fef3c7` | "attention / action needed" |

### Dark (`.dark`)

Authentic iOS elevation: higher surface = lighter; base is near-black `#0b0b0c` (not pure `#000`,
which smears on OLED and kills hairline borders). Primary text is pure white; secondary/tertiary use
translucent white. Accents brighten and their `-soft` tints become dark washes.

| Role | Token | Value |
|------|-------|-------|
| Page canvas | `--paper` | `#0b0b0c` |
| Cards / panels | `--surface` | `#1c1c1e` |
| Inputs / inactive tabs | `--surface-2` | `#2c2c2e` |
| Top elevation | `--surface-3` | `#3a3a3c` |
| Hairline border | `--line` | `rgba(255,255,255,0.11)` |
| Primary text | `--ink` | `#ffffff` |
| Secondary text | `--ink-soft` | `rgba(235,235,245,0.60)` |
| Muted | `--muted` | `rgba(235,235,245,0.58)` |
| Scrim | `--scrim` | `rgba(0,0,0,0.55)` |
| Primary accent | `--accent` | `#9d8df7` |
| Accent ink | `--accent-ink` | `#c6beff` |
| Accent soft | `--accent-soft` | `#2a2350` |
| positive / negative / warning | | `#34d27b` / `#ff6b7d` / `#ffa64d` |
| nav idle / icon / section | | `rgba(235,235,245, 0.62 / 0.45 / 0.55)` |

Dark named accents: purple `#9d8df7`/`#2a2350`, teal `#34d3c0`/`#10322f`, orange `#ffa64d`/`#3a2a14`,
red `#ff6b7d`/`#3a2026`, green `#34d27b`/`#123322`, blue `#6ab0ff`/`#16283d`, coral `#ff7d5a`/`#3a1f16`,
amber `#fbbf24`/`#3a2f10`.

**Toggle dark mode:** add/remove `class="dark"` on `<html>`. Set `color-scheme: dark` (already in the
block) so native controls/scrollbars match.

---

## 3. Radius, shadow, spacing

**Radius scale — concentric (card > control > inset):**

| Token | Value | Use |
|-------|-------|-----|
| `--radius-card` (`rounded-card`, `rounded-xl`, `rounded-2xl`) | `18px` | cards, panels, modals |
| `--radius-control` (`rounded-control`, `rounded-lg`) | `10px` | buttons, inputs, selects, tiles |
| `--radius-inset` (`rounded-inset`, `rounded-md`) | `8px` | chips, nested wells |

> Note: `md/lg/xl/2xl` are intentionally remapped to this scale so stock `rounded-*` classes obey it.
> Full-pill (`rounded-full`) is fine for tags/toggles. Don't exceed 18px on cards — over-rounding reads
> as toy-like.

**Shadows** (soft, layered — a tight contact shadow + a wide ambient one):

```
shadow-card: 0 1px 2px rgba(20,24,45,0.04), 0 8px 24px -12px rgba(20,24,45,0.10)
shadow-lift: 0 4px 6px -1px rgba(20,24,45,0.06), 0 16px 32px -8px rgba(20,24,45,0.12)
```

Use `shadow-card` at rest, `shadow-lift` on hover for a subtle raise. Never pair a 1px border **and**
a wide drop shadow as decoration on the same element — pick one.

**Spacing:** stock Tailwind 4px scale. Vary rhythm; don't use one uniform gap everywhere.

---

## 4. Motion system

One signature easing curve everywhere: **`cubic-bezier(0.22, 1, 0.36, 1)`** (ease-out-quart — fast
out, gentle settle, no bounce).

**CSS animations (Tailwind `animate-*`):**

```
animation: fade-up 0.55s cubic-bezier(0.22,1,0.36,1) both;
@keyframes fade-up { 0% {opacity:0; transform:translateY(10px)} 100% {opacity:1; transform:translateY(0)} }
@keyframes shimmer { 0% {background-position:200% 0} 100% {background-position:-200% 0} }  /* skeleton loaders */
```

- `animate-fade-up` — entrance for cards/rows. Stagger a list with incremental delays
  (`style={{ animationDelay: \`${i * 40}ms\` }}`) — staggering one list is good; the same entrance on
  every section is the tell to avoid.
- `shimmer` — drive skeleton placeholders (a moving gradient background).
- **Hover-lift** — `transition-shadow` + `hover:shadow-lift` (and optionally `hover:-translate-y-0.5`).

**Framer Motion (page/route + drawer transitions), all on the same ease:**

```tsx
// App root: every Framer animation honors the OS "reduce motion" setting.
<MotionConfig reducedMotion="user">{/* app */}</MotionConfig>

// Route content transition
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}

// Mobile drawer slide-in
initial={{ x: -DRAWER_WIDTH }} animate={{ x: 0 }} exit={{ x: -DRAWER_WIDTH }}
transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}

// Backdrop / scrim fade
initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
transition={{ duration: 0.25 }}
```

**Durations:** micro-interactions 150–250ms; entrances ~350–550ms. Animate only `transform`/`opacity`
(+ `background-position` for shimmer). Exits shorter than entrances.

**Reduced motion (required):** the CSS block below neutralizes all CSS animation/transition under
`prefers-reduced-motion: reduce`, and `<MotionConfig reducedMotion="user">` does the same for Framer.

---

## 5. Drop-in `index.css`

```css
@import "tailwindcss";
@config "./tailwind.config.ts"; /* keep the JS/TS config (Tailwind v4 compat path) */

:root {
  /* Backgrounds & surfaces */
  --paper: #ffffff;
  --surface: #ffffff;
  --surface-2: #f3f4f8;
  --surface-3: #ffffff;
  --line: #e2e5ec;

  /* Text */
  --ink: #151a2d;
  --ink-soft: #6b7280;
  --muted: #98a0b3;

  /* Sidebar nav */
  --nav-idle: #565d70;
  --nav-icon: #7c8398;
  --nav-section: #6b7189;

  /* Primary accent — purple */
  --accent: #7c6cf0;
  --accent-ink: #5b4ed4;
  --accent-soft: #efecff;

  /* Semantic */
  --positive: #1fb15b;
  --negative: #ef4a5f;
  --warning: #f6923a;

  /* Named accent palette (base + -soft tint) */
  --accent-purple: #7c6cf0;  --accent-purple-soft: #efecff;
  --accent-teal: #18b8a8;    --accent-teal-soft: #e6f9f6;
  --accent-orange: #f6923a;  --accent-orange-soft: #fff1e3;
  --accent-red: #ef4a5f;     --accent-red-soft: #fde8ea;
  --accent-green: #1fb15b;   --accent-green-soft: #e7f9ee;
  --accent-blue: #2f6fed;    --accent-blue-soft: #e8f0fe;
  --accent-coral: #f2542d;   --accent-coral-soft: #ffe7df;
  --accent-amber: #a16207;   --accent-amber-soft: #fef3c7;

  /* Elevation + scrim */
  --scrim: rgba(20, 24, 45, 0.40);

  /* Radius scale (concentric) */
  --radius-card: 18px;
  --radius-control: 10px;
  --radius-inset: 8px;
}

.dark {
  color-scheme: dark;
  --paper: #0b0b0c;
  --surface: #1c1c1e;
  --surface-2: #2c2c2e;
  --surface-3: #3a3a3c;
  --line: rgba(255, 255, 255, 0.11);
  --ink: #ffffff;
  --ink-soft: rgba(235, 235, 245, 0.60);
  --muted: rgba(235, 235, 245, 0.58);
  --nav-idle: rgba(235, 235, 245, 0.62);
  --nav-icon: rgba(235, 235, 245, 0.45);
  --nav-section: rgba(235, 235, 245, 0.55);
  --scrim: rgba(0, 0, 0, 0.55);
  --accent: #9d8df7;
  --accent-ink: #c6beff;
  --accent-soft: #2a2350;
  --positive: #34d27b;
  --negative: #ff6b7d;
  --warning: #ffa64d;
  --accent-purple: #9d8df7;  --accent-purple-soft: #2a2350;
  --accent-teal: #34d3c0;    --accent-teal-soft: #10322f;
  --accent-orange: #ffa64d;  --accent-orange-soft: #3a2a14;
  --accent-red: #ff6b7d;     --accent-red-soft: #3a2026;
  --accent-green: #34d27b;   --accent-green-soft: #123322;
  --accent-blue: #6ab0ff;    --accent-blue-soft: #16283d;
  --accent-coral: #ff7d5a;   --accent-coral-soft: #3a1f16;
  --accent-amber: #fbbf24;   --accent-amber-soft: #3a2f10;
}

@layer base {
  html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  body { @apply bg-paper text-ink font-sans; }
  h1, h2, h3, h4 { @apply font-display tracking-tight; }
  /* clickable controls read as interactive */
  button:not(:disabled), [role="button"]:not([aria-disabled="true"]) { cursor: pointer; }
  button:disabled, [role="button"][aria-disabled="true"] { cursor: not-allowed; }
}

/* Honor OS reduce-motion for all CSS animation/transition (Framer handled via MotionConfig). */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

@layer utilities {
  .tabular { font-variant-numeric: tabular-nums; }
  .scrollbar-none { scrollbar-width: none; -ms-overflow-style: none; }
  .scrollbar-none::-webkit-scrollbar { display: none; }
}

@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Responsive "stack" tables: below md, a wide table becomes labelled cards (every column visible,
   no sideways scroll). Add class="stack-table" to <table> + data-label="Col" to each data <td>. */
@media (max-width: 767.98px) {
  table.stack-table { display: block; width: 100%; min-width: 0; }
  table.stack-table > thead { display: none; }
  table.stack-table > :is(tbody, tfoot) { display: block; }
  table.stack-table > :is(tbody, tfoot) > tr {
    display: block; border: 1px solid var(--line); border-radius: 14px;
    background: var(--surface); padding: 4px 14px 10px; margin-bottom: 10px;
  }
  table.stack-table > :is(tbody, tfoot) > tr > td {
    display: block; width: auto !important; max-width: none !important;
    padding: 8px 0 0 !important; text-align: left !important;
    white-space: normal !important; border: 0 !important;
  }
  table.stack-table > :is(tbody, tfoot) > tr > td[data-label]::before {
    content: attr(data-label); display: block; margin-bottom: 2px;
    font-size: 10.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.03em; color: var(--muted);
  }
  table.stack-table > :is(tbody, tfoot) > tr > td[colspan] { padding: 0 !important; }
  table.stack-table td .truncate { overflow: visible !important; white-space: normal !important; text-overflow: clip !important; }
}
```

---

## 6. Drop-in `tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Hanken Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        paper: "var(--paper)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        scrim: "var(--scrim)",
        ink: { DEFAULT: "var(--ink)", soft: "var(--ink-soft)" },
        muted: "var(--muted)",
        nav: { idle: "var(--nav-idle)", icon: "var(--nav-icon)", section: "var(--nav-section)" },
        line: "var(--line)",
        accent: {
          DEFAULT: "var(--accent)", ink: "var(--accent-ink)", soft: "var(--accent-soft)",
          purple: "var(--accent-purple)", "purple-soft": "var(--accent-purple-soft)",
          teal: "var(--accent-teal)", "teal-soft": "var(--accent-teal-soft)",
          orange: "var(--accent-orange)", "orange-soft": "var(--accent-orange-soft)",
          red: "var(--accent-red)", "red-soft": "var(--accent-red-soft)",
          green: "var(--accent-green)", "green-soft": "var(--accent-green-soft)",
          blue: "var(--accent-blue)", "blue-soft": "var(--accent-blue-soft)",
          coral: "var(--accent-coral)", "coral-soft": "var(--accent-coral-soft)",
          amber: "var(--accent-amber)", "amber-soft": "var(--accent-amber-soft)",
        },
        positive: "var(--positive)",
        negative: "var(--negative)",
        warning: "var(--warning)",
      },
      borderRadius: {
        card: "var(--radius-card)", control: "var(--radius-control)", inset: "var(--radius-inset)",
        md: "var(--radius-inset)", lg: "var(--radius-control)",
        xl: "var(--radius-card)", "2xl": "var(--radius-card)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,24,45,0.04), 0 8px 24px -12px rgba(20,24,45,0.10)",
        lift: "0 4px 6px -1px rgba(20,24,45,0.06), 0 16px 32px -8px rgba(20,24,45,0.12)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: { "fade-up": "fade-up 0.55s cubic-bezier(0.22,1,0.36,1) both" },
    },
  },
  plugins: [],
} satisfies Config;
```

---

## 7. Component recipes

Composed only from the tokens above — copy and adapt.

**Card**
```html
<div class="rounded-card bg-surface border border-line shadow-card p-5
            transition-shadow hover:shadow-lift">…</div>
```

**Primary button**
```html
<button class="rounded-control bg-accent text-white font-semibold px-4 py-2.5
               transition-[background,transform] hover:brightness-105 active:scale-[0.98]">
  Charge
</button>
```

**Secondary / ghost button**
```html
<button class="rounded-control bg-surface-2 text-ink font-medium px-4 py-2.5
               border border-line hover:bg-surface">Cancel</button>
```

**Status pill** (swap the accent name for the status)
```html
<span class="inline-flex items-center rounded-full bg-accent-teal-soft text-accent-teal
             text-xs font-semibold px-2.5 py-1">In person</span>
```

**Stat / KPI number**
```html
<p class="font-display text-3xl font-700 text-ink tabular">$12,480</p>
<p class="text-xs text-muted">This month</p>
```

**Input**
```html
<input class="rounded-control bg-surface-2 border border-line text-ink placeholder:text-muted
              px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40" />
```

**Skeleton (shimmer)**
```html
<div class="h-4 rounded-inset bg-surface-2
            bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.05),transparent)]
            bg-[length:200%_100%] animate-[shimmer_1.4s_infinite]"></div>
```

**Entrance (staggered list)**
```tsx
{rows.map((r, i) => (
  <div key={r.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>…</div>
))}
```

---

## 8. Responsive & layout

- **Breakpoints:** stock Tailwind — `sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`. Design
  mobile-first, scale up. The critical line here is **`md` (768px)**: the sidebar collapses to a
  drawer and `stack-table` kicks in below it.
- **Wide tables → cards:** add `stack-table` to the `<table>` and `data-label="Column"` to each data
  `<td>`; below `md` every row becomes a labelled card (all columns visible, no horizontal scroll).
- **Shell pattern:** fixed sidebar + `<Outlet/>` content, Framer route transitions. On mobile the
  sidebar is a slide-in drawer over a scrim. Note: a `<motion.*>` ancestor with a transform makes
  `position: fixed` children anchor to *it*, not the viewport — portal fixed overlays (drag layers,
  toasts) to `document.body`.
- Use `min-h-dvh` (not `100vh`) on mobile; give fixed bars safe padding so content isn't hidden.

---

## 9. Accessibility (built into the theme)

- **Contrast:** body text meets WCAG AA on its surface (`--ink-soft` 6.9:1 on white; nav idle 6.57:1;
  dark `--muted` deliberately raised above iOS's 0.30 alpha to clear AA). Keep body ≥ 4.5:1, large
  text ≥ 3:1 if you add new pairings.
- **Reduced motion:** honored for both CSS (media query) and Framer (`MotionConfig reducedMotion="user"`).
- **Focus:** use a visible ring — `focus:ring-2 focus:ring-accent/40` — never remove outlines.
- **Don't rely on color alone** for status; pair the accent with a label/icon (the pills do this).
- Clickable non-buttons get `cursor-pointer` via the base layer; disabled get `not-allowed`.

---

## 10. How to reuse in a new app

1. `npm create vite@latest my-app -- --template react-ts` then add Tailwind + `framer-motion`.
2. Paste the **fonts** `<link>` into `index.html`.
3. Drop in **`index.css`** (§5) and **`tailwind.config.ts`** (§6).
4. Wrap the app root in `<MotionConfig reducedMotion="user">`.
5. Add a dark-mode toggle that puts `class="dark"` on `<html>` (persist the choice).
6. Build UI from the **tokens/classes** and the **recipes** (§7) — never hard-code hex.

That's the whole system. Same tokens, fonts, radii, shadows, and one easing curve = the same product
feel in any app.
