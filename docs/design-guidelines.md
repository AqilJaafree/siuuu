# SIUUU — Design Guidelines

**Style:** Neobrutalism
**Stack:** Next.js (App Router) PWA · Tailwind CSS · shadcn/ui
**Companion:** [`superpowers/specs/2026-07-17-siuuu-design.md`](superpowers/specs/2026-07-17-siuuu-design.md)

This document is the source of truth for colour, type, and component form. It is
written to be handed directly to an implementer.

---

## 1. Why neobrutalism, specifically

Not because it looks cool. Because the product is about **truth versus
performance**, and the aesthetic has to argue that.

Neobrutalism refuses to hide its construction. No blur, no glass, no soft
gradient smoothing over the seams. Everything is a hard edge and a stated fact.
That is the same claim SIUUU makes about clips: *here is the raw thing, here is
exactly what backs it, check it yourself.*

The design language and the product thesis are the same argument. Every soft
shadow you add weakens both.

**The single rule everything else follows from:** if an element makes a claim,
it must show its evidence. A VERIFIED badge that isn't tappable to a Proof Card
is decoration, and decoration is a lie here.

---

## 2. Tokens

### Colour

Neobrutalism runs on high-chroma flats against black and paper. No tints, no
tones, no 50-step ramps.

```css
:root {
  /* Structure — the whole system rests on these two */
  --ink:        #000000;   /* every border, every shadow, all body text */
  --paper:      #FDFBF7;   /* page background. warm, not white */

  /* Verification states — semantic, never decorative */
  --verified:   #00E054;   /* VERIFIED. acid green. earned. */
  --overturned: #FF4D00;   /* OVERTURNED. orange. loud but not failure. */
  --rejected:   #E5E5E5;   /* REJECTED. grey. dead. deliberately boring. */
  --pending:    #FFD600;   /* NEEDS_REVIEW / PENDING. yellow. in motion. */

  /* Product */
  --drama:      #FF006E;   /* Drama Score. magenta. the market talking. */
  --sponsor:    #6D3BFF;   /* sponsor / money surfaces. violet. */
  --live:       #FF0000;   /* live match only. never anything else. */

  /* Surfaces */
  --card:       #FFFFFF;
  --sunk:       #F0EDE6;   /* inset wells, code blocks, raw JSON */
}
```

**Dark mode** flips `--paper` → `#0A0A0A`, `--card` → `#141414`, `--ink` →
`#FDFBF7`. The chroma colours **do not change** — they are already at full
saturation and they must read identically in both themes, because a VERIFIED
badge means the same thing at 2am. Borders and shadows become `--ink` (now
light) against the dark card. Test both.

#### Colour discipline

- `--verified` green appears **only** on genuinely verified things. Never as an
  accent, never on a button, never because a section needed some colour. The
  moment green means "nice" instead of "true", the product's core signal is dead.
- `--live` red appears **only** on in-running matches.
- `--drama` magenta belongs to the Drama Score and its rankings. Nothing else.
- Everything else is ink on paper. **Colour is information here, not styling.**

#### Contrast

`--verified` and `--pending` are bright — they **require** `--ink` text on top,
never white. Check every combination against WCAG AA (4.5:1 body, 3:1 large).
Neobrutalism's flat high-chroma palette makes this easy; don't squander it.

### Type

```css
--font-display: 'Archivo Black', 'Arial Black', sans-serif;  /* headings, scores, numbers */
--font-body:    'Inter', system-ui, sans-serif;              /* everything readable */
--font-mono:    'JetBrains Mono', ui-monospace, monospace;   /* proof data. non-negotiable. */
```

Load via `next/font`. Self-host. No FOUT.

| Role | Spec |
|---|---|
| Display / hero | `--font-display`, `clamp(2.5rem, 6vw, 5rem)`, `tracking-tight`, **UPPERCASE** |
| Section head | `--font-display`, `1.5rem`, uppercase |
| Card title | `--font-body` 700, `1.125rem` |
| Body | `--font-body` 400, `1rem`, `leading-relaxed` |
| Label / badge | `--font-body` 700, `0.75rem`, uppercase, `tracking-wide` |
| **Match clock, score, Seq, hashes, event ids** | `--font-mono`, always |

**The mono rule is load-bearing.** Every piece of TXLine evidence — `Clock.Seconds`,
`Seq`, event `Id`, `contentHash`, the Solana signature — renders in mono. Mono
signals *machine fact, not editorial*. When a viewer sees `47:12` in mono next to
`Seq 534`, the typography is telling them this came from a feed, not a caption.
Prose is Inter. Facts are mono. Never mix them up.

### Structure

```css
--border:        3px solid var(--ink);   /* default. everything. */
--border-heavy:  5px solid var(--ink);   /* hero, primary CTA, Proof Card */
--radius:        0;                      /* yes, zero */
--shadow:        4px 4px 0 var(--ink);
--shadow-lg:     8px 8px 0 var(--ink);
--shadow-press:  2px 2px 0 var(--ink);
```

**Hard offset shadows only.** No blur radius, ever. `4px 4px 0` — the third value
stays `0`. A blurred shadow anywhere in this app is a bug.

**`--radius: 0` is the default.** The one sanctioned exception: pill-shaped status
badges (`border-radius: 999px`), because a pill reads as a *stamp* and stamps are
what verification badges are. Nothing else rounds.

### Spacing

Tailwind's 4px scale. Chunky: prefer `p-6` over `p-4`, `gap-6` over `gap-3`.
Neobrutalism needs room — thick borders eat visual space and cramped cards turn
to mud.

---

## 3. Components

### Card

```
border: 3px solid ink · radius 0 · shadow 4px 4px 0 ink · bg --card · p-6
```

Hover (pointer only): translate `-2px, -2px`, shadow → `6px 6px 0`. The card
lifts off the page. `transition: 120ms ease-out`. On touch, no hover state at
all — don't fake it.

### Button

| Variant | Spec |
|---|---|
| Primary | bg `--ink`, text `--paper`, border-heavy, `--shadow` |
| Secondary | bg `--card`, text `--ink`, border, `--shadow` |
| Danger | bg `--overturned`, text `--ink`, border, `--shadow` |
| Sponsor | bg `--sponsor`, text `--paper`, border, `--shadow` |

**Press:** translate `+2px, +2px`, shadow → `--shadow-press`. The button
physically depresses into the page. This is the signature interaction of the
whole style — get it right and everything feels intentional. `90ms`.

Disabled: shadow removed entirely, `opacity: 0.4`, `cursor: not-allowed`. A
button with no shadow is visibly *not pressable* — the affordance disappears
rather than greying out. That's the style working for you.

### Status badge

Pill. `border: 2px solid ink`. `--font-body` 700, uppercase, `0.75rem`, `px-3 py-1`.
Ink text on the state colour.

| Status | Fill | Reads as |
|---|---|---|
| `VERIFIED` | `--verified` | earned |
| `OVERTURNED` | `--overturned` | a story, not a failure |
| `NEEDS_REVIEW` | `--pending` | in motion |
| `UNVERIFIABLE` | `--sunk` | not the clipper's fault |
| `REJECTED` | `--rejected` | dead, boring, over |

`REJECTED` being flat grey is deliberate. Rejection should feel like nothing
happened, not like an alarm. Save the loud colours for things worth looking at.

**Every badge is tappable and opens the Proof Card.** No exceptions. A claim
without reachable evidence violates the core rule.

### Proof Card — the most important surface in the app

This is where the product either earns trust or doesn't. Give it
`--border-heavy` and `--shadow-lg`. It should feel like a physical document.

Contents, in order:

1. **Status badge**, large, top.
2. **Fixture + clock window** — mono. `18209181 · 24:32–25:02`.
3. **Matched events** — a mono table. One row per event: `Id`, `Action`, `Clock`,
   `Seq`, `Confirmed`. This is raw feed data and it should **look** raw. Put it in
   a `--sunk` well. Do not prettify it. Do not humanise the action names — `var_end`
   stays `var_end`. The rawness *is* the credibility.
4. **Drama Score** — big display number, `--drama`, with the market evidence
   underneath in mono: suspension duration, price move (`2.088 → 2.691`, `+29%`).
   Show the arithmetic. The score means nothing without it.
5. **OCR confidence** — a plain bar. Honest when it's low.
6. **Anchor** — `contentHash` and Solana devnet signature, mono, truncated middle,
   copy button, link to explorer.

**Show the seams.** Every instinct will say "clean this up, hide the JSON, make
the event names friendly." Resist all of it. A Proof Card that looks designed
looks *authored*, and authored means someone could have written anything. The
mono tables and raw action names say: *this is what the feed said, we didn't
touch it.*

If a clip is `OVERTURNED`, the card shows **both** timelines — the original
confirmed event and the later `action_discarded` that killed it, with clock values
for each. The overturn is usually the better story than the goal was.

### Clip tile (feed)

Card + 16:9 thumbnail. Status badge overlaid top-left. Drama Score top-right as a
mono number on `--drama`. Sponsor watermark visible in-frame (it's burned into the
video — it renders because it's *in* the pixels, which is the point).

Tile is `--border`, `--shadow`. In a grid, tiles do **not** overlap or stagger —
neobrutalism is chunky, not chaotic. Align to the grid, hard.

### Live indicator

`--live` dot, 8px, hard square (radius 0), next to the fixture name in mono.
Pulse via opacity `1 → 0.3 → 1`, 1.5s. No glow, no scale, no blur.

### Sponsor campaign surfaces

`--sponsor` violet. Budget and bounty figures in **mono** — they're money, money
is a fact. Targeting filters (fixture, event types, minDrama) as chunky toggle
chips: bordered, `--shadow`, filled `--ink` when active.

The campaign builder should feel like filling in a form on paper. That's the right
metaphor for committing money to an escrow — deliberate, legible, no magic.

---

## 4. Motion

Fast, mechanical, physical. Things **snap**.

| Interaction | Spec |
|---|---|
| Button press | translate `+2,+2`, shadow → press, `90ms ease-out` |
| Card hover | translate `-2,-2`, shadow → `6px`, `120ms ease-out` |
| Badge state change | no transition — **hard cut**. Truth doesn't fade in. |
| Modal / sheet | slide from edge, `160ms`, no fade, no backdrop blur (use `--ink` at 40% flat) |
| Page enter | stagger children `40ms`, translate-y `8px` → `0`, `200ms` |
| Verification progress | stepped, discrete. Each pipeline step lands with a hard state change. **No indeterminate spinners.** |

**The verification progress rule matters.** The pipeline has six real steps
(OCR → Resolve → Match → Drama → Proof → Publish). Show them as six discrete
states that each land with a snap. A spinner says "something is happening,
trust us" — which is the opposite of this product. Each step landing visibly is
the product demonstrating itself.

Nothing eases-in-out. Nothing bounces. Nothing takes longer than 200ms.

**`prefers-reduced-motion: reduce`** → drop all translate and stagger; keep the
state changes as instant cuts. The design already reads correctly with zero
motion, which is a good sign about the design.

---

## 5. Layout

- **Max width 1200px.** Content-led, hard-aligned to the grid.
- **Mobile-first.** This is a PWA and clipping is a phone activity. Design 390px
  first, scale up.
- **Thick borders need breathing room** — `gap-6` minimum between bordered
  elements. Two 3px borders 8px apart reads as visual mud.
- **No overlap, no rotation, no stagger.** Some neobrutalism tilts things a few
  degrees for personality. Not here. This app makes evidentiary claims; a tilted
  Proof Card undermines it. Chunky and *aligned*.
- **Grid:** feed is 1 col @ 390px, 2 @ 768px, 3 @ 1200px.

---

## 6. Accessibility

The style is an accessibility asset — use it.

- **Focus:** `outline: 3px solid var(--drama); outline-offset: 3px`. Visible,
  on-brand, never removed.
- **Contrast:** AA minimum on everything. Ink-on-chroma is the default and it
  passes comfortably.
- **Never colour alone.** Every status carries a text label inside the badge. A
  colourblind viewer reads `VERIFIED`, not green.
- **Touch targets:** 44px minimum. Chunky buttons make this free.
- **Mono data gets `aria-label`** with a spoken form — `Seq 534` not `S-e-q 534`;
  clock `24:32` announced as "24 minutes 32 seconds".
- **Live regions** for verification step transitions.

---

## 7. Anti-slop

This aesthetic has a house style on the internet and it is not ours. Avoid:

- **Rainbow chaos.** Neobrutalism online means eight clashing colours. Here colour
  is *semantic*. Ink on paper, plus a state colour where it means something. If a
  screen has more than two chroma colours on it, something is being decorative
  that shouldn't be.
- **Tilted cards, sticker collages, wobbly borders, Comic Sans irony.** This is a
  verification product. Playful undermines it.
- **Memphis squiggles, star bursts, blobs.** No.
- **Drop shadows with blur.** Any blur is a bug.
- **Gradients.** Flat only.
- **Emoji as UI.** Especially not ⚽ or 🔥.
- **Glassmorphism anywhere.** Opposite worldview — glass hides construction; this
  style shows it.

The reference is a **stadium scoreboard**, not a Gumroad landing page. Utilitarian,
legible at distance, high contrast, built to state facts to a crowd. Chunky
because it must be readable, not because chunky is a trend.

---

## 8. Voice

Terse. Factual. Never hyped.

The product's whole claim is that it doesn't exaggerate — so the copy can't
either. The data is dramatic on its own; if the writing has to sell the drama,
the drama isn't there.

| Don't | Do |
|---|---|
| "🔥 INSANE MOMENT VERIFIED! 🔥" | `VERIFIED · 24:32 · goal → action_discarded` |
| "This clip has been successfully validated against our verification system" | `Backed by 3 TXLine events. Anchored on Solana.` |
| "Uh oh! Something went wrong 😅" | `No backing event at 24:32. TXLine has: throw_in, Seq 412.` |
| "Trending now!" | `Drama 94 · market suspended 41s · over 2.088 → 2.691` |

**Errors state what's true and what's missing.** Never apologise, never
anthropomorphise, never hedge. `UNVERIFIABLE — no coverage in this window` is a
complete, honest sentence and the user knows exactly where they stand.

Uppercase for status and headings. Sentence case for everything a human reads at
length.

**App name is always `SIUUU`.** All caps, four Us. Never `Siuuu`.
