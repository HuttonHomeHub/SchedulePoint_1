# ADR-0102 — The light corporate theme, and the scope that never reached the painter

- **Status:** Accepted (M0–M3 landed 2026-08-21; M4 is this record and the gate pass)
- **Date:** 2026-08-21
- **Supersedes:** nothing. **Amends:** ADR-0097 (values, not structure), ADR-0099 (the palette it
  chose), ADR-0077 §2 (the `auth` scope's surviving reason).
- **Spec:** [`docs/specs/light-corporate-theme/`](../specs/light-corporate-theme/)

## Context

The product owner loaded `web-v0.96.0`, said the dark Graphite palette was "awful in all respects"
and "very hard on the eyes over a long period", and asked for a light corporate theme. Asked whether
it should sit beside dark or replace it, they chose **replace, chrome and canvas**, keeping
ADR-0097's single-theme architecture exactly: no picker, no second theme block, `THEME_SELECTORS`
stays a one-element list.

Three things made this more than taste. `docs/specs/graphite/design.md:98-116` is literally headed
**"The palette is OPEN"** and records the product owner as unsettled on it, so this closes an open
question rather than reversing a settled one. ADR-0101 had measured a mechanism — page ink at
14.61:1 on a near-black ground, the halation profile — and softened it as a labelled stopgap. And
the six pre-authentication screens were **already** light corporate: `--brand` and `--auth` hold the
old Flask app's sampled `#14213D` navy and `#fca311` amber, kept theme-invariant by ADR-0077. The
front door had been wearing the corporate identity all along and the application was the part that
disagreed with it.

## Decisions

### D1 — The theme is recovered, not designed

The `.corporate` block ADR-0097 deleted is intact at `44f1c59^:apps/web/src/styles/globals.css`,
lines **508–730** — 223 lines, 117 declarations — with its reasoning attached. Bounded **by content
rather than by the quoted line range**, which the plan's own risk note asked for and which earned
its keep on the first command: the brief's `508,1020` opens correctly at `.corporate {` and overruns
by 290 lines. The overrun was invisible to a name count, because everything it adds is a rebind of a
name the block already declares. A wrong range that produces the right number is the most durable
kind of wrong.

Measured rather than assumed: **not one of the 117 names has since disappeared** from `:root`, so
there is no stale vocabulary to discard. The classification of all 271 declarations is in
[`m0-recovered.md`](../specs/light-corporate-theme/m0-recovered.md); the load-bearing figure is that
**61 do not move** (35 non-colour, 26 theme-invariant) and **117 have a measured light value to
verify rather than invent**.

**This falsifies ADR-0097's own costing in the helpful direction.** That ADR prices a theme's return
at "~110 declarations" plus "a week of design judgement" and says the caveat is not softened. The
declaration count is right; the judgement half was substantially already spent and recoverable, for
everything except the diagram — which is the one surface ADR-0099 re-derived after the deletion, and
therefore the one place with nothing to recover.

### D2 — The M1/M2 boundary does not hold at the token level

The plan separated chrome-and-documents (M1) from the diagram (M2) as two derivations, which is
right, and assumed they could be applied separately, which is not. Re-valuing the page's ink dark
broke **twelve** matrix assertions, **every one in the canvas scope and none in the page**: 23 of the
`--plot-*` family's 31 members are `var(--page-*)` aliases, so the diagram's ink follows the page's
the instant the page moves. The two milestones are separable in what they **derive** and not in what
they **break**, so CQ-2's ground and the criticality ladder landed in M1.

### D3 — The criticality ladder is solved, and the binding constraint is the label

Three fills, each ≥3:1 on the diagram ground, each ≥1.5:1 from the others, each carrying a legible
inside label. Searched rather than chosen — chain at 1.55:1 from a 3.15:1 base, then solve each hue
for the lightness that lands on its target:

```
on-schedule    oklch(0.624 0.115 249)   ground 3.15:1   dark label  4.86:1
near-critical  oklch(0.528 0.13  62)    ground 4.89:1   white label 5.52:1
critical       oklch(0.439 0.175 27)    ground 7.57:1   white label 8.55:1
pairwise 1.55 / 1.55 / 2.40
```

**The ground is not what binds — the label is.** White on the on-schedule blue is 3.56:1, a real
1.4.3 failure, which is exactly what the recovered reasoning meant by recording 1.70:1 as the ceiling
on criticality separation _"subject to a white inside-label at 4.5:1"_. Relaxing that for the one
fill that cannot carry it buys the whole ladder, and costs nothing: the recovered chrome already puts
navy ink on its amber primary, so a light fill with dark ink is this design's own pattern.

Every fill inverts to darker-than-ground and **its label inverts with it, as one edit** — one
`*-foreground` went white → dark while two went dark → white. That pairing flips as a unit or the
picture breaks in a way that reads as a bug rather than a colour.

### D4 — There is no contrast ceiling, and that is an answer rather than a deferral

`docs/TECH_DEBT.md` #157 asked for one: every colour gate here asserts a floor, so values could only
ever be pushed apart, and the page ink had drifted to 14.61:1. Computed with the gate's own
arithmetic, a ratio ceiling must sit **below 14.61** to have caught the defect and **above 12.64**
not to reject the recovered light palette's own card body text — an ordinary near-`#333`-on-white
value. The entire admissible window is **under two points**, tuned to two data points; and inside it
the rule enforces the wrong quantity, because what made 14.61:1 uncomfortable is **halation**, a
property of light ink on a dark ground rather than of the separation, which a ratio cannot see.

A second candidate — a ground-luminance band, "off-white, never paper-white" — is **withdrawn before
writing**: it fails on day one against the recovered `--card` at L = 1.000, which is paper-white by
construction and correct. A gate that fails on the values it protects gets deleted rather than fixed
(ADR-0058). #157 closes as **answered**; its surviving requirement, should a dark theme return, is a
polarity-aware comfort check rather than a ratio ceiling, recorded in
[`m0-ceiling.md`](../specs/light-corporate-theme/m0-ceiling.md).

### D5 — A `--color-*` alias is frozen at `:root`, and the canvas painter had never used its own scope

`resolveTsldPalette` made 88 token reads naming the `@theme inline` aliases. An alias is declared at
`:root` as `--color-primary: var(--primary)`, and a custom property's `var()` is substituted **on the
element that declares it** — so the already-substituted value is what inherits, and a surface-scope
rebind can never reach it. Verified in Chromium on a four-line page rather than reasoned from the
spec:

```
:root { --plot-primary: rgb(1,2,3); --primary: rgb(9,9,9); --color-primary: var(--primary); }
[data-surface="canvas"] { --primary: var(--plot-primary); }
→ --primary at the scope        rgb(1,2,3)   (follows the rebind)
→ --color-primary at the scope  rgb(9,9,9)   (frozen at :root)
```

So **ADR-0097 Landing E's guard was necessary and not sufficient**: making `root` a required
parameter changed which element was asked and not one value that came back. All 88 reads resolved the
page's family — the exact failure that decision's docblock says it fixed.

**Tailwind utilities were never affected, and that is why it survived.** `inline` is precisely what
compiles `bg-primary` to `var(--primary)` instead of the frozen alias, so every DOM surface has
always been correct and only the canvas was wrong. It was invisible while the page and plot families
held near-identical greys; the light theme made `--page-primary` navy while `--plot-primary` is a mid
blue, and every non-critical bar painted navy.

**The contrast matrix could not report it either.** `token-contrast.test.ts` resolves a scope by
reading the CSS text and following the rebind itself, so it asserts the mapping the browser does not
perform for alias readers: right about what the values should be, silent about what the painter got.
`token-alias-reads.structural.test.ts` is the missing half, verified red against the pre-fix tree.

Two more instances were found the same way, both on the **guest share view** — the only screen a
person outside the organisation sees. `GuestPlanView` mounted `TsldPanel` without
`CanvasSurfaceProvider`, so every resolver took the documented fallback to `document.documentElement`;
`canvas-surface.tsx`'s own docblock calls that fallback "the honest weak point of this design" and
predicts the cause in as many words — _"a future host mounts the canvas outside the provider"_. That
host already existed. And the legend, which renders above the canvas `Surface`, painted the page's
family beside bars painting the diagram's: a near-black "On schedule" swatch next to blue bars.

### D6 — The `auth` scope survives, re-measured

ADR-0097 kept it on "12 of 18 tokens differ", measured against a **near-black** page where almost
anything on a white card differs. The light theme removes that advantage entirely, so the honest
expectation was collapse. Re-measured: **17 of 31 differ, 14 perceptibly**, and seven of the eight
sampled pairs clear the ~0.02 OKLCH threshold — led by `--auth-ring` at ΔL 0.298, the amber ADR-0077
M7 derived up from the old app's failing 2.02:1. The card ground is the one that does **not**, at
0.018, and that is right rather than a near miss: a white card on an off-white page is a small step by
design with the border carrying the edge. The scope survives on its **values**; its original reason
(ADR-0077 §2 — a signed-out visitor never chose a theme) has not applied since ADR-0097.

### D7 — The categorical ramp is derived now, the feature later

CQ-3. Five swatches cycle on the sixth phase, so two unrelated groups share a fill on exactly the
plans big enough to need grouping. Twelve, against three measured constraints: ≥3:1 on both the
ground and the month band (worst 3.10), a legible inside label (worst 4.93), and ≥25° of hue from
each of the three reserved semantics (worst 31°) so a WBS fill is never mistaken for a criticality
state. That last constraint shapes the odd hue order — the ramp walks around three holes in the
wheel — and is why `--chart-1`'s old amber is gone. One ink for twelve is impossible, so the ramp
alternates two lightness bands and the ink alternates with it, which also makes adjacent members
differ on two channels rather than one. The colour-by-WBS **mode** and its assignment surface stay
`graphite/design.md` §5a's own epic.

### D8 — No feature flag

ADR-0088 D1: a `VITE_` constant is inlined at build time, `docker-publish.yml` passes none and
`.dockerignore` strips `**/.env`, so no published image has ever been able to turn one off. The
rollback is a commit boundary — the ADR-0097 / ADR-0098 / ADR-0099 precedent for exactly this work.

## What only photographs found

Two defects shipped past a green matrix, and both are structural rather than oversights.

**The weekend hatch.** ADR-0101 softened the dark value to a 1.10:1 step over its wash. Carried onto
a 0.965 wash, that same near-black ink is a **9:1** step — black diagonals over every weekend,
dominating a picture whose bars they sit behind. The hatch is _reported rather than asserted_ by
design, and a floor cannot express "too loud" in any case.

**The minimap frame.** Its gate is `max(stroke, halo) >= 3` — polarity-agnostic by design, and
therefore green with a **white stroke on a near-white ground**. The dark halo carried every
assertion while the line a reader actually sees vanished into the ground on three sides. The two
halves swap; **nothing about the gate changes**, which is the part worth keeping: a correct gate,
passing for a correct reason, cannot see this.

The instrument that found both was widened first: the shot list went **12 → 25**, adding the four
missing public screens, the audit log, project detail, intercepted error and loading states, both
Gantt arrow states, the minimap, the guest view, and — the one that mattered — the **exported PNG
itself**. Its absence is what let `docs/TECH_DEBT.md` #158 ship: twelve screens photographed and
never once what the product _produces_. That row stays **open**, because the light theme hides its
symptom and not its cause.

## Consequences

- One theme, light, corporate. The application and its front door are one identity.
- The canvas surface scope is real for the first time since it shipped, and a gate keeps it so.
- 25 shots × 3 widths is the epic's evidence and the next epic's baseline.
- `docs/TECH_DEBT.md` #157 closes as answered; #159 closes; **#158 stays open by design**.
- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
  is untouched by construction — in its honest form: there is nothing here to hold parity for.

## Claims corrected in the making

Recorded because ADR-0076 says a decision-bearing claim carries its evidence, and several of mine did
not survive being checked:

- The brief said the product had **never chosen a typeface**. It has — Space Grotesk, self-hosted,
  gated four ways. ADR-0097 _found_ none had been chosen and then chose one; the brief inherited the
  first half.
- The brief said `auth` was **fixed-dark**. It is fixed-**white**; `--brand` is the fixed navy. That
  inverts the fork from "does it clash" to "does it collapse".
- I proposed a contrast **ceiling** from a correct measurement. The comparison disqualifies the
  instrument (D4). The number was right and the inference was not.
- The plan said **13** page-family members had no recovered ancestor. It is **3**.
- The composition arithmetic said **53** `var()` aliases and summed to 270. It is **54**, and the one
  the counting command could not see is `--plot-background: var(--canvas)` — the single declaration
  CQ-2 is about. The instrument was narrower than the question and returned a plausible number.
- I recorded the legend's mismatch as "visually marginal" from token values. The photograph
  disagreed.
- The `clients-error` shot photographed a **spinner** and reported success; the guard added to fix
  that passed on text in a different pane, committing the failure it was written to prevent.
