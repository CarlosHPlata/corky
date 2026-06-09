# Corky Design Constitution & Specification

---

## Part I — Constitution (Guiding Principles)

### 1. The Product Character

Corky is a **coach, not a hype machine**. It opens after a ranked session, beside a dark monitor, and tells you the truth about why you lost. Every visual decision flows from that role: calm, analytical, evidence-first, never flashy. The design is a dark analyst's desk — "**Rift Ink**" — not a gaming overlay.

### 2. Core Design Principles

1. **Evidence over assertion.** Every coaching claim is backed by a number, chart, or map position. The UI makes the evidence as readable as the verdict.
2. **Progressive disclosure.** The verdict and focus tasks come first, large and unambiguous. The evidence dashboard sits below, consistent every game, there to drill into — never greeting you with a wall of stats.
3. **Dark-only, single surface.** There is no light mode. The UI lives beside the game at night. Every surface, shadow, and border is tuned for low-light comfort.
4. **One accent, used meaningfully.** Gold (`--accent: #F2B33D`) is the single warm accent. It means coaching insight, economy, and primary action. Used sparingly — a little gold against Rift Ink goes a long way.
5. **Numbers are mono.** Any stat, timer, CS count, gold value, or evidence reference is typeset in JetBrains Mono with tabular figures. Readability of data is non-negotiable.
6. **No decoration.** No gradients except functional ones (chart area fills, VerdictCard ambient glow). No left-accent borders as status indicators — use a top bar or a badge instead. No emoji. No hype words.
7. **Compliant by construction.** The UI only ever surfaces information the player could already see themselves. This shapes what data is shown and how coaching language is framed.

### 3. Voice & Tone Rules (enforced in UI copy)

- **Sentence case** for all readable text (headings, buttons, body). UPPERCASE only for eyebrow/section labels with wide tracking.
- **Second person, present tense.** "You fell behind", "be present for the first two dragons."
- **Honest about limits.** When data can't support a conclusion, say so and name the fallback: *"Not enough Ahri games yet — comparing against a general benchmark."*
- No exclamation marks. No "insane", "cracked", or trash talk. Encouragement is specific and earned.

---

## Part II — Visual Foundations Specification

### Color System

#### Base Ramp — "Rift Ink" (cool blue-charcoal)

| Token | Hex | Usage |
|---|---|---|
| `--ink-1000` | `#05070C` | Letterbox / deepest void |
| `--ink-950` | `#080B12` | App background |
| `--ink-900` | `#0C1019` | Minimap background |
| `--ink-850` | `#11161F` | Panel / sidebar background |
| `--ink-800` | `#161C27` | Card background |
| `--ink-750` | `#1C2330` | Card raised / row hover |
| `--ink-700` | `#232C3B` | Input / control background |
| `--ink-650` | `#2D3747` | Strong border |
| `--ink-600` | `#3A4556` | Border / divider on raised |
| `--ink-500` | `#4C5869` | Disabled foreground / faint icon |

Never use pure black. The blue undertone reads like Summoner's Rift at night.

#### Gold Ramp — The One Accent

| Token | Hex | Usage |
|---|---|---|
| `--gold-300` | `#FFD98A` | Gilded emphasis text (`<em>` in verdict) |
| `--gold-400` | `#FFC857` | Icon color, eyebrow labels |
| `--gold-500` / `--accent` | `#F2B33D` | Primary buttons, active nav, focus ring |
| `--gold-600` | `#D8951F` | Button press state |
| `--gold-glow` | `rgba(242,179,61,0.28)` | Glow shadow, text selection highlight |

#### Team / Data Convention — NEVER swap these

| Token | Hex | Meaning |
|---|---|---|
| `--data-ally` / `--blue-500` | `#4C8DFF` | You / your side / ally |
| `--data-enemy` / `--red-500` | `#FF5765` | Enemy |

#### Semantic Intent Colors

| Token | Hex | Meaning |
|---|---|---|
| `--win` / `--teal-500` | `#21D0A3` | Win, ahead, improved, positive delta |
| `--loss` / `--red-500` | `#FF5765` | Loss, death, regressed, negative delta |
| `--warn` / `--orange-500` | `#FF8A3D` | Caution, tempo warning |
| `--objective` / `--violet-500` | `#9B7BF0` | Baron, Herald, objectives |

Each has a `-soft` variant (`rgba` at 0.13–0.14 opacity) used for badge/card backgrounds.

#### Semantic Surface Aliases (use these in components, never raw ink values)

```css
--bg-void:        #05070C   (letterbox)
--bg-app:         #080B12   (root background)
--bg-panel:       #11161F   (sidebar)
--bg-card:        #161C27   (cards)
--bg-card-raised: #1C2330   (hover, raised state)
--bg-input:       #232C3B   (inputs, rule chips)
--bg-hover:       rgba(255,255,255,0.04)
--bg-active:      rgba(255,255,255,0.07)
--bg-scrim:       rgba(5,7,12,0.72)

--text-primary:   #E7ECF4   (gray-100)
--text-secondary: #A2ADBF   (gray-300)
--text-muted:     #7E8A9D   (gray-400)
--text-faint:     #626E80   (gray-500)
--text-on-gold:   #1A1205   (text on gold backgrounds)

--border-subtle:  rgba(255,255,255,0.06)
--border-default: #2D3747   (ink-650)
--border-strong:  #3A4556   (ink-600)
--border-focus:   #F2B33D   (gold-500)
```

---

### Typography

#### Typefaces

| Face | Variable axes | Usage |
|---|---|---|
| **Saira** (variable, `Saira-VF.ttf`) | `wght` 100–900, `wdth` 50–125% | Display headlines, all UI text |
| **JetBrains Mono** (variable, `JetBrainsMono-VF.ttf`) | `wght` 100–800 | All numbers, timers, CS values, gold values, evidence refs, metric rules |

Saira is the face of the brand — squared, technical, esports-analyst energy. Pull `wdth` to ~76–82% (`fontVariationSettings: "'wght' 800, 'wdth' 78"`) for stat callouts and the VerdictCard W/L label for visual punch. JetBrains Mono carries all data — if a character represents a number that means something, it must be mono.

Font delivery: variable `.ttf` files in `src/renderer/src/assets/fonts/`, referenced via relative `url()` in `@font-face`, bundled and hashed by Vite at build time.

#### Type Scale

| Token | Value | Use |
|---|---|---|
| `--text-2xs` | 11px | Micro labels, eyebrows, evidence refs |
| `--text-xs` | 12px | Meta, captions, timestamps |
| `--text-sm` | 13px | Secondary UI, table cells |
| `--text-base` | 15px | Body, task descriptions |
| `--text-md` | 17px | Card titles, lead body |
| `--text-lg` | 20px | Section headings |
| `--text-xl` | 24px | Panel titles, StatBlock sm |
| `--text-2xl` | 30px | Screen/verdict text |
| `--text-3xl` | 40px | StatBlock md |
| `--text-4xl` | 54px | StatBlock lg |
| `--text-5xl` | 72px | Score / dominant number |

#### Line Heights & Tracking

| Token | Value | Use |
|---|---|---|
| `--leading-tight` | 1.08 | Display / condensed headlines |
| `--leading-snug` | 1.25 | H1–H6 defaults |
| `--leading-normal` | 1.45 | Body text |
| `--leading-relaxed` | 1.6 | Long-form coaching prose |
| `--tracking-tight` | -0.01em | Large display text |
| `--tracking-wide` | 0.04em | Secondary labels |
| `--tracking-label` | 0.12em | Eyebrow uppercase labels |

#### Eyebrow Label Rule

Section labels are always: Saira, 11px, `font-weight: 600`, `letter-spacing: 0.12em`, `text-transform: uppercase`, color `--text-muted`. Applied via the `.eyebrow` utility class.

---

### Spacing

4px base grid. Explicit token set:

| Token | Value |
|---|---|
| `--space-1` | 2px |
| `--space-2` | 4px |
| `--space-3` | 6px |
| `--space-4` | 8px |
| `--space-5` | 12px |
| `--space-6` | 16px |
| `--space-7` | 20px |
| `--space-8` | 24px |
| `--space-9` | 32px |
| `--space-10` | 40px |
| `--space-11` | 48px |
| `--space-12` | 64px |

Standard gutters: 16–24px. Sidebar/topbar inner padding: `20px 14px` / `0 24px`.

### Radii

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 3px | Smallest inset markers |
| `--radius-sm` | 5px | Chips, evidence refs |
| `--radius-md` | 8px | Buttons, inputs, avatar rounded, small cards |
| `--radius-lg` | 12px | Cards, match rows, task rows |
| `--radius-xl` | 16px | VerdictCard, panels |
| `--radius-2xl` | 22px | Large modal surfaces |
| `--radius-pill` | 999px | Badges, toggles, scrollbars |

### Elevation

Dark-UI elevation uses **lighter surface + hairline border + soft shadow**, with an optional 1px inner-top highlight to lift the card off the void:

```css
--shadow-sm:   0 1px 2px rgba(0,0,0,0.4)
--shadow-md:   0 4px 14px rgba(0,0,0,0.45)     /* standard card */
--shadow-lg:   0 12px 34px rgba(0,0,0,0.5)     /* VerdictCard */
--shadow-xl:   0 24px 64px rgba(0,0,0,0.55)    /* modals */
--shadow-lift: inset 0 1px 0 rgba(255,255,255,0.045)  /* top highlight */
--glow-gold:   0 0 0 1px rgba(242,179,61,0.5), 0 0 20px var(--gold-glow)
--glow-blue:   0 0 0 1px rgba(76,141,255,0.5), 0 0 20px var(--blue-glow)
--focus-ring:  0 0 0 2px var(--bg-app), 0 0 0 4px var(--gold-500)
```

### Motion

Calm and confident. Never bounce on data reveals.

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 90ms | Press feedback |
| `--dur-fast` | 150ms | UI hover/border transitions |
| `--dur-base` | 220ms | Page-enter fade, chart reveals |
| `--dur-slow` | 360ms | Progress bar fill |
| `--ease-out` | `cubic-bezier(0.22,1,0.36,1)` | All standard transitions |
| `--ease-in-out` | `cubic-bezier(0.65,0,0.35,1)` | Modals, overlays |
| `--ease-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | Toggle knob only |

Screen transitions use `.ck-fade`: `transform: translateY(8px) → none` + `opacity: 0 → 1` over `--dur-base`. Respects `prefers-reduced-motion`.

### Layout Constants

```css
--sidebar-w:   248px   /* fixed left sidebar */
--topbar-h:    56px    /* sticky top bar with blur */
--content-max: 1120px  /* scrollable content cap */
```

---

## Part III — Component Specification

### Button (`.ck-btn`)

**Variants:** `primary` (gold fill + glow on hover), `secondary` (raised card bg + border), `ghost` (transparent, muted text), `danger` (transparent, loss-colored, red border on hover).

**Sizes:** `sm` (13px, 7px/12px padding), `md` (15px, 10px/16px), `lg` (17px, 13px/22px).

**Rules:**
- Maximum one `primary` button per view.
- Uses CSS custom property cascade (`--_bg`, `--_fg`, `--_bd`) — variants set them via class; hover/active override via nested selectors.
- `:active` scales to `0.98`.
- `disabled`: `opacity: 0.45`, `pointer-events: none`.
- Icon slots: `iconLeft` and `iconRight` props, rendered inline with an 8px gap.

### Badge (`.ck-badge`)

Pill shape (`--radius-pill`). Intents: `win`, `loss`, `warn`, `info`, `objective`, `accent`, `neutral`.

- Add `solid` prop for filled treatment (win/loss/accent only).
- Add `dot` prop for a 6px status dot before label text.
- Always `white-space: nowrap`.
- Font: Saira 11px weight-600, letter-spacing 0.06em.

### Card (`.ck-card`)

`--bg-card` fill, `--border-subtle` hairline border, `--radius-lg`, `--shadow-lift` + `--shadow-md`.

- Optional `accent` prop: 3px color bar at the top (`win`/`loss`/`accent`/`objective`).
- Optional `title`/`eyebrow` renders a header section with a bottom border divider.
- Padding controlled via `--pad` CSS variable (default 18px, overridable per instance).

**Rule:** No colored left-border. Status is communicated via the top accent bar or a badge, never a left border.

### Avatar (`.ck-avatar`)

Shapes: `circle` (pill radius) or `rounded` (radius-md). Sizes: `xs` 24px, `sm` 32px, `md` 44px, `lg` 64px.

- If no `src`: renders initials (up to 2 characters, uppercase, mono 600-weight).
- Ring colors: `win` → teal, `loss` → coral, `accent` → gold, `info` → blue. Applied via `--_ring` CSS variable as a double-ring `box-shadow` (2px gap in app bg color, 3px outer color ring).
- For champion portraits: use `ChampAvatar` which lazy-loads from Data Dragon CDN via `champImgUrl()`. Shows initials while loading; swaps to portrait once resolved.

### StatBlock (`.ck-stat`)

Sizes: `sm` (24px value, `--text-xl`), `md` (40px, `--text-3xl`), `lg` (54px, `--text-4xl`).

- Value is always mono (`--font-mono`), tabular figures.
- Delta indicators: `▲` teal (up), `▼` coral (down), `—` muted (flat), set via `deltaDir` prop.
- Caption in 12px faint sans below value.
- Label as `.eyebrow` above value.

### VerdictCard (`.ck-verdict`)

The hero component of the coaching report. Two-column inner layout:

- **Left column:** W/L label in 56px condensed Saira (`wdth: 78`), champion name, queue, duration.
- **Right column:** gold `.eyebrow` "VERDICT", verdict text at 30px Saira, tag row (badges).
- Ambient glow: radial gradient from top-left corner — teal for win, coral for loss.
- `--radius-xl`, `--shadow-lg`.

### FocusTask (`.ck-task`)

Five states: `improved`, `held`, `regressed`, `not_applicable`, `pending`.

- Circle icon: teal checkmark for `improved`/`held`; coral cross for `regressed`; dot for others.
- Right side: `actual` value large and mono, state label beneath.
- Metric rule rendered as a mono chip (e.g., `cs_at_10 >= 70`).
- Scope shown as faint uppercase mono (`ROLE`, `UNIVERSAL`).

### TurningPoint (`.ck-tp`)

- **Left:** 116×116px schematic minimap (`--ink-900` bg with blue/red radial corner gradients and grid lines). Marker types: `you` (blue, 4px glow), `event` (coral, 4px glow), `objective` (violet).
- **Right:** time + swing delta (teal for positive, coral for negative), what-happened text, "Better play" section with gold eyebrow label.

### EvidenceChip (`.ck-evidence`)

Inline interactive chip linking coaching text to chart/map evidence.

- `data` kind: gold text on `--accent-soft` bg.
- `death` kind: `--red-300` text on `--loss-soft` bg.
- `objective` kind: `--violet-400` text on `--objective-soft` bg.
- Gold glow on hover.

### ProgressBar (`.ck-progress`)

Label + value text row above a pill-shaped track. Fill color via `--_c` CSS variable, driven by `intent` prop. Animated fill width on mount (`--dur-slow`, `--ease-out`).

### Toggle (`.ck-toggle`)

40×22px pill track. Gold fill + right-translated knob when checked. Spring easing (`--ease-spring`) on knob transition. Hidden native checkbox maintains accessibility.

### Icon (`components/Icon.tsx`)

Inline SVG registry with 22 Lucide paths. `currentColor` stroke, `1.75px` default stroke-width, sizes on 4px grid (16/18/20/24px). Renders via `dangerouslySetInnerHTML` into an `<svg>` wrapper.

---

## Part IV — Screen Specifications

### App Shell

```
[Sidebar 248px fixed] [Main: flex-column]
                        [TopBar 56px sticky, blur]
                        [.ck-scroll flex:1 overflow-y:auto]
                          [.ck-fade keyed screen content]
```

**Sidebar:** Logo (crosshair icon + "CORKY" in condensed 800-weight Saira, tracked wide) → nav items → spacer → compliance notice (win-soft tinted) → summoner card (Avatar + name + tag + rank/LP badge).

**Nav item active state:** `--accent-soft` background, `--gold-300` text, gold icon. Match-history item shows a pill badge with the game count.

**TopBar:** Blurred glass effect (`backdrop-filter: blur(8px)`, `background: color-mix(in srgb, var(--bg-app) 78%, transparent)`). Left: optional back button (report screen). Center/left: title + subtitle. Right: Sync button (secondary variant, refresh icon, `.ck-spin` animation while syncing).

### Match History Screen

Content width capped at `--content-max`. Header row: game count eyebrow + W/L mono summary + "Click a game" hint.

**Match row (`.ck-match`):**
- Card bg, `--radius-lg`, 3px left bar (teal=win, coral=loss), `translateX(2px)` on hover.
- Contents left-to-right: `ChampAvatar` (md, rounded, win/loss ring) → champion name + result badge + optional "New" dot badge → KDA (mono, 3-col, death count in coral) → CS + CS/min (mono) → reason text (2-line clamp, sans 13.5px muted) → duration (mono, faint) → chevron-right icon.

### Post-Game Report Screen

Progressive disclosure order, single column, max-width 1120px, 26px gap between sections.

1. **VerdictCard** — win/loss, champion, queue, duration, headline tag badge, cohort badge.
2. **Since last game** — Card with task count summary + on-track/slipped badge + FocusTask rows.
3. **Evidence dashboard** — `1.5fr / 1fr` grid:
   - Left: **GoldChart** — SVG `viewBox="0 0 600 150"`. Zero-line dashed at y=70. Ahead area: teal fade gradient (clip top half). Behind area: coral fade gradient (clip bottom half). Line strokes: teal above zero / coral below zero (via `clipPath`). Turning-point markers: vertical dashed line + filled circle. Foot labels: timestamps + gold values.
   - Right: 2×3 **StatBlock** grid (sm size).
   - Full width: **DeathMap** — 150×150px minimap (schematic: diagonal river stripe, blue/red corner radials, grid lines) with numbered death circles; legend list on right with time + death type label + note.
4. **Turning points** — TurningPoint rows.
5. **Next-game focus** — FocusTask rows (pending state) + gold sparkles footnote.

**Analyze gate:** If the match is new and unanalyzed, show `AnalyzePanel` instead of the report: centered `ChampAvatar` (lg) + title + description with gilded `<em>` + primary "Analyze this match" button. While running: spinner + mono "Reading the timeline…".

### Champion Select Screen

3-column grid: `1fr auto 1fr`.

**Team columns:** Player rows with `ChampAvatar` (sm, rounded). Your row: gold-soft bg + gold border. Allied ring: `info` (blue). Enemy ring: `loss` (coral). Role in mono faint below name. Column label `.eyebrow` in team color (blue/red). Enemy team column is right-aligned (`flex-direction: row-reverse`).

**VS divider:** 30px condensed "VS" in faint Saira + `swords` icon.

**InfoCards (2×2 grid below, `--radius-lg`):**
- Lane matchup: `Card accent="accent"`, matchup summary + favor badge.
- Main threats: ChampAvatar (sm) per threat + name + threat text.
- Win condition: prose text.
- Build direction: key-value rows (`RUNES` / `SUMMONERS` / `FIRST ITEM` / `BOOTS`) — keys faint 11px uppercase display, values mono secondary.

### Trends Screen

Pattern card (`Card accent="loss"`) with trending-down icon + headline sentence + body. 4-column StatBlock grid (sm). ProgressBar patch comparison (win/warn/loss intent progression).

### Settings Screen

Max-width 680px. Account card (Riot ID / Region / Role as mono field displays). Coaching card (Toggle rows). Compliance notice (win-soft tinted, shield icon, faint prose).

---

## Part V — Data Dragon Integration

Champion portraits are fetched from the Riot Data Dragon CDN. The authoritative source is `champion.json`. **Do not maintain a hardcoded name→ID mapping** — fetch at runtime.

**Fetch chain (once per renderer session, module-level cache in `src/renderer/src/utils/ddragon.ts`):**

1. `GET https://ddragon.leagueoflegends.com/api/versions.json` → take `[0]` as current patch.
2. `GET https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json` → iterate `data`, index both `entry.name` ("Lee Sin") and `entry.id` ("LeeSin") → `entry.image.full` filename.
3. Portrait URL: `https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{imageFile}`

`ensureDDLoaded()` returns the same `Promise<void>` on repeated calls — the fetch never fires twice. `champImgUrl(name)` returns `null` before the cache is ready.

**`ChampAvatar` component:** Shows initials placeholder while loading, swaps to portrait once the fetch resolves. Multiple mounted instances trigger only one fetch.

---

## Part VI — Iconography

**System:** Lucide (open-source, ISC license). Style: outline/line, 1.75px stroke, `currentColor`, sizes 16/18/20/24px.

**Domain icons and their meanings:**

| Icon | Domain use |
|---|---|
| `crosshair` | Logo, farming focus tasks |
| `target` | Evidence section label |
| `sparkles` | AI verdict, coaching insight, analyze button |
| `skull` | Deaths |
| `flag` | Objectives |
| `map` | Turning points, pathing/macro |
| `swords` | Matchup, champion select |
| `shield` | Compliance/safety notice |
| `trending-up` / `trending-down` | Leads, trends navigation |
| `clock` | Timers, tempo |
| `history` | Match history navigation |
| `refresh-cw` | Sync (`.ck-spin` animation during loading) |
| `chevron-right` / `chevron-left` | Row affordance, back navigation |
| `settings` | Settings navigation |
| `zap` | Focus / intensity indicator |

No emoji. No hand-drawn SVGs. No Unicode characters as icons (only typographic marks: ·, →, −, ×).

If an icon is needed for a new feature, choose from the existing Lucide registry before adding new paths.
