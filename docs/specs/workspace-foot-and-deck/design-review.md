# Design review — the workspace foot and the command deck

**Author:** ui-architect, as an independent second opinion. **Date:** 2026-08-27.
**Against:** `web-v0.108.2`, `docs/specs/workspace-foot-and-deck/m0-measurement.md`.

This was written concurrently with, and without sight of, the spec and plan. Where it disagrees
with M0 it says so and names the command that would settle it. Where it says **don't**, it means
don't.

---

## 0. Verdicts, up front

| #      | The ask                                | Verdict                                                                                                                                                                                       |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§0** | The foot row wraps on selection        | **Fix first — but not with the pair M0 proposes.** One of the two is right, the other is a one-off that breaks two written rules and buys a fit with 8.2 px of margin.                        |
| **Q1** | Give the foot row the deck's treatment | **Yes — `chrome` scope, no new scope, no new tokens.** But the height cost is a design choice between two shapes and the deciding instrument is a photograph, not a token argument.           |
| **Q2** | Toolbar left, facts right              | **Neither, as posed.** Three regions, not two: the panel's own count leads, the object bar takes the middle, the plan's schedule facts trail. Lowest-value change here; do not ship it alone. |
| **Q3** | Facts on two lines at the same height  | **Yes, and it IS free** — M0's "no" is an artefact of one Tailwind class (`gap-4` sets the _row_ gap too). But it should be a response to pressure, not a default.                            |
| **Q4** | Foot bar always visible, greyed        | **Don't.** It makes §0's cost permanent, and it is an ADR-0082 omit-case. The complaint underneath it is Q1's, and Q1 answers it.                                                             |
| **Q5** | Promote commands out of the dropdowns  | **Almost nothing.** The deck can afford exactly **one** promotion at 1440 and there is exactly one worth making. `Summary ▾` is a defect — but not the one M0 names.                          |

Two things outrank all six and are in §2.

---

## 1. What I think M0 got wrong or under-measured

M0 is a good pass and I am treating it as ground truth. These five are places where a design
decision would rest on a figure that has not been established, or has been established of the
wrong thing. Each names its probe.

### 1a. The largest entry in the facts table is a phantom — `You're editing this plan.` pays **zero px**

§3 lists five leaves and the biggest is `You're editing this plan.` at **125.9 px**. In the
ordinary editing state that element is **`sr-only`** and contributes nothing to the row's width.

ADR-0114 **D4** made the pen sentence stop painting; `lock-view.ts:59` declares
`messageVisible?: boolean` and `CompactPenStatus.tsx:179` reads
`className={cn(view.messageVisible ? undefined : 'sr-only', …)}`. `messageVisible: true` is set in
exactly two places — the `lost` branch (`lock-view.ts:90`) and the `editing`-with-an-incoming-request
branch. `HELD_BY_ME` with no request, which is the state M0 drove, is not one of them. `sr-only` is
`position:absolute; width:1px; overflow:hidden; clip`, so a `getBoundingClientRect` on the inner
`<span className="max-w-[22ch] truncate sm:max-w-none">` returns the text's laid-out width while the
row pays for a 1 px absolutely-positioned box.

**M0's own arithmetic is the evidence.** Its five leaves sum to **507.2 px** against a stated block
width of **481.4 px** — a block that also carries `px-3` (24 px) and three 16 px gaps. Drop the
phantom and it reconciles: 381.3 ink + 48 gaps + 24 padding = 453.3, leaving ~28 px for the
`ScheduleStateRegion`. With the phantom included there is no arrangement of that row that adds up.

This matters because §3's table is the menu a designer picks from, and its top item is the one that
frees nothing. A milestone that "removes the pen sentence to buy the row a line" would ship, measure
zero, and be the seventh consecutive width expectation on this surface contradicted by its own
measurement.

**Probe.** In `m0-whatif.spec.ts`, report per leaf `getComputedStyle(el).position` and
`el.getBoundingClientRect().width`, and sum only the leaves with `position !== 'absolute'`. Cross-check
against the block's own `clientWidth`. Expect four painted leaves totalling **381.3 px**.

### 1b. The dock's container is not a property of the viewport — the Project Explorer moves it by up to 386 px

Every §0 figure is a dock width at **one** Explorer width, and M0 does not say which.
`use-explorer-prefs.ts:23-25` declares `EXPLORER_MIN_WIDTH = 200`, `EXPLORER_MAX_WIDTH = 420`,
`EXPLORER_DEFAULT_WIDTH = 276`, and `explorer-column.tsx:25` declares `SPINE_WIDTH = 34` for the folded
state. The width is a persisted per-reader preference.

M0's readings are internally consistent with the **default 276**: at 1646,
`1646 − 276 − 24 (body px-3) − 32 (row px-4) − 16 (two gaps) − 481.4 (facts) − 40 (toggle) = 776.6`,
against M0's measured 775.6.

So the dock's container ranges from **~514 px** (Explorer at 420) to **~1018 px** (Explorer folded to 34) at 1646 — a **386 px** range against a **261.8 px** shortfall. **A planner who folds the Explorer
has no defect today, and a planner who widens it will still have one after any fix in the 261.8 px
budget.** Neither state has been measured.

That does not make §0 a non-defect — the default is what matters, and the default wraps. It does mean
**every px budget in this epic is only true at one Explorer width, and the spec has to say which**.

**Probe.** Re-run `m0-whatif.spec.ts` at 1646 across the cross product
`{folded 34, min 200, default 276, max 420} × {no selection, one activity, one summary}`, reporting
dock width, bar content width, dock line count and canvas height. Set the width by writing
`schedulepoint-explorer` in `localStorage` before load rather than by dragging.

### 1c. The state measured is the row's narrowest, and ADR-0114 already said so

M0's ten items are: Early mode, non-summary selection, no conflict flag, fresh schedule, pen held.
ADR-0114's own Consequences record the qualification and this epic inherits it:

- a **summary** selection swaps `Duplicate` (99.3) for `Duplicate band` and adds `Dissolve` — roughly **+130 px**;
- a **stale** schedule adds a sentence and a `Recalculate` button to the facts, which narrows the dock;
- a **flagged** activity adds `Review the constraint…` / `Review resources…` to the bar.

Any remedy whose margin is smaller than ~130 px is a fit that fails on the next selection. M0's
proposed pair leaves **8.2 px** (270 − 261.8). See §3.

### 1d. §1's evidence cannot distinguish "page scope" from "canvas scope"

§1's table concludes the foot row's surface scope is `(page) — none` from a computed foreground of
`oklch(0.321 0 0)` and a transparent background. That reading proves nothing:
`globals.css:763` declares `--plot-foreground: var(--page-foreground)` and `globals.css:687` declares
`--page-foreground: oklch(0.321 0 0)`, so the two scopes are byte-identical for that token, and a
transparent background says nothing about either.

**The conclusion is nonetheless correct**, established structurally rather than by colour:
`plan-workspace-toolbar.tsx:1544` wraps `{surface}` (which contains `TsldPanel`'s
`<Surface tone="canvas">`, `TsldPanel.tsx:2517/2730`) in the stage card, and
`ActivityPanelCollapsedBar` at `:1551` is that card's **sibling**. The foot row is outside the canvas
scope and inside no other.

Worth correcting because the epic will be quoted on it, and a claim established by a coincidence is
the ADR-0076 Class 3 shape. **The probe that settles a scope question is
`element.closest('[data-surface]')?.dataset.surface`, not a colour.**

### 1e. `selection-actions.tsx:952-954` states the pre-ADR-0114-D7 numbers as current

> `The cost is height — the row wraps to 77 px at 1920 and 117 px at 1646 with a selection`

ADR-0114 D7's own table says the row is **41 px at 1920 and 77 px at 1646** after the `Progress`
rename, which is what M0 measured today. The comment is one milestone stale, in the file whoever
implements this epic will open first, in a file whose neighbours explicitly exist to record what
shipped wrong. Fix it in the first commit that touches the file.

---

## 2. The two things nobody has asked about, which outrank the five

### 2a. The state this whole epic is about has never been photographed

`apps/web/scripts/shoot.mjs` shoots the plan workspace five ways — `plan-workspace`,
`plan-workspace-readonly`, `plan-workspace-editor`, `plan-workspace-minimap`,
`plan-workspace-lenses` — and **not one of them shows a selected activity with the foot row
visible**. `plan-workspace-editor` (`shoot.mjs:355-366`) selects an activity and then opens the
editor, whose modal `<dialog>` sits in the top layer over the row.

So the wrapped foot row — the state a planner is in every time they touch a bar, the one costing the
diagram 36 px at 1646 and 76 px at 1440 — is invisible to the one instrument this repository built
after ADR-0099 established that four consecutive width epics went wrong for want of a screenshot.
This is `plan-workspace-editor`'s own docblock happening again one level along: _"a shot list that
stops at the route and never opens what the route opens is the same blind spot with a smaller
radius."_ Here the shot list opens what the route opens and the thing it opens covers the subject.

**This is the first task of the epic, before any design.** Add `plan-workspace-selected` (select via
the listbox, take no further action) and `plan-workspace-selected-summary`. Every question below —
Q1's treatment, Q2's order, Q3's two lines — is decided better by looking at those two pictures than
by any of the arithmetic in this document.

### 2b. `Data date` is rendered three times on one screen, twice inside one popover

Not a width problem; a duplication of the kind ADR-0093 and ADR-0110 D1 both exist to remove.

| where                                                          | renders                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `plan-facts.tsx:147-170` (foot row)                            | Activities · **Data date** · Finish · _n_ critical                     |
| `plan-summary-panel.tsx:32-43` (`Summary ▾`, the `<dl>`)       | Status · **Data date** · Mode                                          |
| `ScheduleSummaryStrip.tsx:108-112` (`Summary ▾`, below a rule) | **Data date** · Project finish · Activities · Critical · Near-critical |

Four facts appear twice (Activities, Data date, Finish/Project finish, Critical) and **Data date
appears three times, two of them 12 px apart separated by a `border-t`**. Nothing is wrong in any
of the three files; the wrongness is only in the relationship, which is why three human reads found
three correct components. `selection-duplication.structural.test.ts` structurally cannot see it —
that gate compares two _registries_, and `PlanFacts` is in neither.

This is the real content of Q5's `Summary ▾` question, and it is a better finding than "a dropdown
with one command in it". See §8.

---

## 3. §0 — the wrap. Is it the right thing to fix first, and is the pair right?

**Fix first: yes.** It is a live cost on the product owner's own screen, it is the only item of the
six that is not a preference, and every other change on this row is arranged around what the row
holds.

**The pair: half right.** Taking them in turn.

### `clear-visual-placement` — withdraw it, and it is an **omit**, not a withdrawal of a shaded control

M0 asks whether withdrawing a shaded control violates ADR-0082. It does not, and the reason is
sharper than "it does not apply in this mode".

`clearVisualPlacementGate` (`conflict-remedy.ts:112-113`) refuses first on
`input.schedulingMode !== 'VISUAL'`. `schedulingMode` is a **plan-level** column (ADR-0033), not a
view state — an Early-mode plan has no hand placements at all, because `visualStart` is only fed
through the engine's second forward pass in Visual mode. So for such a plan the control is shaded on
**every selection, for every reader, for the life of the plan**, with a reason that never changes.

ADR-0082 §3's table gives three omit rows and this matches two of them:

- _"Feature flag off — **Omit**"_: `schedulingMode` is the per-plan equivalent. The capability is
  structurally absent, not shut.
- _"Nothing to show at all (`readable === false`) — **Omit** — shading implies a value is there"_: a
  shaded `Clear visual start` implies the activity has a visual start to clear.

The shade rows are the pen and the role — things that flip under a reader who did nothing, which is
what a reason sentence is for.

**The bar has already made this exact call once, deliberately.** `selection-actions.tsx:143-153`:

> _"Every one is unreachable here … The commands are simply enabled. That is ADR-0082's discriminating
> rule landing where it belongs: **omit** when the action does not apply to the object, and with no
> selection there is no object."_

So the mechanism is idiomatic (`isVisible`, as `dissolve` and `duplicate-band` already use it), the
precedent is in the same file, and no primitive changes.

**Two things must be checked with it, and neither is in M0:**

1. The `visualConflict` remedy routes to this item by id (`CONFLICT_REMEDIES.visualConflict`,
   `{ kind: 'barAction', itemId: 'clear-visual-placement' }`). `visualConflict` can only be raised in
   Visual mode, so the remedy is unaffected — but `conflict-remedy.structural.test.ts` asserts every
   `barAction.itemId` resolves to a **registered** item, and an `isVisible` predicate does not
   deregister. Confirm the gate still passes and state why in the test.
2. **The gate is wrong in the other direction too, and this is free to fix while you are here.** In
   Visual mode the item is enabled for _any_ selection — it never asks whether the activity actually
   has a `visualStart`. So the bar today offers a live button that does nothing on most activities.
   That is the same "shading implies a value is there" defect, inverted. If the context can carry
   `hasVisualPlacement`, `isVisible` should read it.

**Saving: 146.0 + 8 = 154 px**, in Early mode, which is the default and the state M0 measured.

### `zoom-to-selection` icon-only — **don't**

It breaks two written rules and creates exactly the one-off I am here to flag.

- **The bar's own rule.** `selection-actions.tsx:439-443`: _"Every item pins `showLabel: 'always'` —
  this is a compact floating bar of five actions where the name **is** the affordance, so a label is
  not something to trade away for width."_ Making one item icon-only makes that sentence false and
  gives the next reader no rule for the next item.
- **The deck's rule, which is the only written test in the codebase for "may this go icon-only".**
  `Deck.tsx:72-83`: `ICON_ONLY` is _"a small, closed set"_ of `zoom-in`, `zoom-out`, `fit`, `undo`,
  `redo`, `print`, and its test is _"would a planner who has never seen this product guess wrong?"_ —
  magnifiers, plus/minus and the two undo arrows. A crosshair meaning "frame the viewport on the
  selected activity" fails that test outright.
- **ADR-0114 D7 already refused to shorten this label**, on WCAG 2.4.6 grounds, recording that the
  short form `Zoom to` shipped once and a journey caught it. Going icon-only keeps the accessible
  name and is not the same failure — but reaching for the same control twice in two days for width is
  a sign the control is in the wrong place, not that it is too wide.
- **And it does not buy a durable fit.** 154 + 116 = 270 against 261.8 leaves **8.2 px**. Per §1c a
  summary selection adds ~130 px and a stale schedule narrows the dock. The epic would ship a
  one-line row that becomes a two-line row on the next click.

### What to do instead: move the two `find` commands to the deck

`zoom-to-selection` and `isolate-logic` are the bar's `find` group, and **they are not object
actions**. ADR-0093 D1's discriminator is _"an action whose subject is the selected object"_. The
subject of `Zoom to selection` is the **viewport**; the selection is its argument. The bar's own
`SelectionCanvasContext` docblock says as much — _"The object actions are about the activity; these
are about the view of it"_ — and files them in a separate group for exactly that reason.

They are on the bar because ADR-0090 M2-T1 moved them off Row 1, and its stated reason was that they
were _"the single largest contribution to its pinned floor"_. **ADR-0109 D1 deleted that floor**,
along with the width ladder, the band floors, the hysteresis and the `⋯`. The deck wraps now. The
premise of the 2026-08-12 decision no longer exists, which is a proper reason to reverse it rather
than a preference.

Moving them also **repays a cost that decision recorded**:
`selection-actions.tsx:152-153` — _"a planner with nothing selected no longer sees these commands
shaded with the precondition that would teach them."_ On the deck they shade with
"Select an activity first" (ADR-0082 shade row: a state the reader can change), and the capability
becomes discoverable again.

**Saving: 152.2 + 79.0 + 16 = 247.2 px.**

### The arithmetic, at the default Explorer width (276 px)

Dock container: **1049.6** at 1920, **775.6** at 1646, **569.6** at 1440. Bar content today
**1037.4**.

| candidate                                                  |   content | 1920   | 1646            | 1440           |
| ---------------------------------------------------------- | --------: | ------ | --------------- | -------------- |
| today                                                      |    1037.4 | 1 line | **2 lines**     | **3 lines**    |
| M0's pair (omit CVP + icon-only zoom)                      |     767.4 | ✓      | ✓ **by 8.2 px** | ✗              |
| **A: omit CVP only**                                       |     883.4 | ✓      | ✗               | ✗              |
| **B: omit CVP + move the two `find` commands** ← recommend | **636.4** | ✓      | ✓ **by 139 px** | ✗ (over by 67) |
| C: B + fold the five editor doors (ADR-0114 D8)            |     293.4 | ✓      | ✓ by 482        | ✓ by 276       |

**Recommendation: B.** It fits both of the product owner's screens, it survives a summary selection
at 1646 (636 + ~130 = 766 < 775.6, thin but positive), each of its two moves has an independent
principled justification rather than a width one, and it leaves the bar meaning one thing.

**Its honest costs, stated:**

- 1440 still wraps to two lines. 1440 is not a screen anyone has named; it is M0's third data point.
- The two promoted commands cost the deck ~158 px. At 1920 (1175.6 px of line-2 slack) and 1646
  (375.5) that is **0 px of height**. At 1440 (169.5) the second one starts a third deck line — so at
  1440 B trades a foot line for a deck line, roughly a wash. Say so rather than claiming a gain.
- The canvas gain is **+36 px at 1646 and 0 px at 1920**. That is modest and should be presented as
  modest; B's real prize is that the object bar becomes only object actions.

### The bigger answer, which is C, and why I am not recommending it today

**M0 is right that the honest problem is that the bar carries ten items.** Five of them —
`Logic`, `Notes`, `Progress`, `Resources`, `Edit` — are **five buttons into five tabs of one dialog**
(`activity-editor-intent.ts`: `edit → general`, `progress → progress`, `logic → logic`,
`resources → resources`). ADR-0062's entire subject was converging those surfaces into one editor;
the bar never converged with it. Folding them is worth ~343 px and is the only candidate that gives
one line at every width in every common state.

That is ADR-0114 **D8**, which the product owner declined on 2026-08-26 on the ground that it
_"changes what the bar is for"_. I am not re-litigating a decision one day old. I am recording the
number that has changed since: **D8 was declined when the row's cost was understood as height at
1920 and 1646. §0 is the first measurement of what it costs the diagram — 36 px at 1646 and 76 px
at 1440, on every selection.** If B's 139 px margin proves too thin, D8 is where to go, and its
saving should be re-derived rather than carried (the label set has changed since it was costed).

One correction to D8's shape if it is ever taken: **the trigger must not be labelled `Edit ▾`.**
`notes` and `progress` are role-gated and deliberately **not** pen-gated (ADR-0046, ADR-0060) —
a Contributor who cannot edit _can_ report progress and add notes, and burying their only permitted
action behind a verb they are refused is the false-statement defect ADR-0082 and ADR-0060 both record
shipping. The trigger names the subject, not the verb.

### And the cheapest option of all, named rather than hidden

Per §1b, folding the Project Explorer to its 34 px spine gives the dock **+242 px** and closes §0
today with no code. Reducing `EXPLORER_DEFAULT_WIDTH` would do the same for new readers. I am **not**
recommending either — the Explorer is the navigator a planner needs and its width is their choice —
but the epic should know that the number it is closing is smaller than the number a reader can move
with one drag, and should say so.

---

## 4. Q1 — "should the bottom toolbar be the same colour as the others?"

**The product owner is right, and M0 is right that it is stronger than colour.** The three bands of
the plan workspace are not three shades of one treatment:

| band         | treatment                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| chrome band  | `<Surface tone="chrome">` + `rounded-lg border border-b-[3px] border-b-primary shadow-md` (`chrome-band.tsx:78-81`)                      |
| stage        | `rounded-lg border shadow-md overflow-hidden` on the page family (`plan-workspace-toolbar.tsx:1544`)                                     |
| **foot row** | `border-border flex min-h-9 shrink-0 items-center gap-2 border-t px-4` — no fill, no radius, no shadow (`activity-bottom-panel.tsx:206`) |

Two of the three are cards floating on the workspace's gradient inset (`px-3 pb-3`, `:1530`). The
third is a hairline **directly beneath the stage card's own bottom border** — two 1 px rules with
nothing between them. That is the "doesn't tie in" complaint, exactly.

### Scope: `chrome`. Not a new scope. Not, ever, a new scope.

- **A new scope is refused by ADR-0077 §1's bar**, which ADR-0055's own `Surface` docblock restates
  (`surface.tsx:38-40`): the load-bearing condition is that _"the region's fill must be chosen for a
  reason the page's fill structurally cannot serve — otherwise it is a component with props, not a
  scope."_ The foot row's fill has no such reason. It is the same reason the band's is: it is chrome.
- **A partial rebind is refused** by ADR-0055 §1 and by `token-architecture.test.ts:29-59`
  (`FAMILY_TOKENS`, 18 members) and `computeReboundNames()` (`:169-182`), which derive completeness as
  a closure rather than a count. A five-token `--foot-*` stub is the original three-token header bug
  with a new name.
- **`chrome` costs zero tokens and zero gate work.** The family is already complete
  (`globals.css:1033`), already in `FAMILIES` (`token-architecture.test.ts:61`), already swept by
  `token-contrast.test.ts`. Nothing is added; one more element gets `data-surface="chrome"`.

**It is also nearly free at the components, for ADR-0077 M7's reason.** Everything the row paints is
already expressed in rebound names, so it repaints with no component change:

- the object bar's card is `toolbarCardVariants`' `bg-foreground/5` (`toolbar-styles.ts:98`) — inside
  chrome that becomes near-white at 5 % on navy, which is the wash it is meant to be;
- the facts are `text-muted-foreground` (`plan-facts.tsx:72`) and `text-destructive-text`
  (`:166`) — both rebound;
- the docked strips are `NoticeStrip` tones — `accent` (`CanvasModeBand.tsx:113`),
  `info`/`warning` (`EditConflictBanner.tsx:39`), `destructive` (`BulkSelectionBar.tsx:183`) — all
  rebound, all already contrast-gated for `chrome`.

### One hazard, which is real and has to be checked

**The dock's strips arrive by portal, so React context and the CSS cascade disagree about where they
are.** `CanvasDock` portals from `TsldPanel`, which is inside `<Surface tone="canvas">`; the
destination is the foot row. `SurfaceToneContext` follows the React tree and would report `canvas`;
`[data-surface]` follows the DOM and would report `chrome`. Consequences:

- CSS is **right** — the strips paint on chrome, which is what you want.
- `Surface`'s dev-only same-tone nesting guard (`surface.tsx:107-114`) reads context, so it can neither
  catch a `chrome`-in-`chrome` nesting here nor avoid throwing on a legitimate `canvas` one. Nothing
  in the dock renders a `<Surface>` today, so it is latent — but it is one component away, and it is
  the ADR-0097 "latent split pair" shape. Put a sentence in `canvas-dock.tsx` next to the portal.
- `resolveTsldPalette` is unaffected: it reads the registered `<Surface tone="canvas">` node
  (`canvas-surface.tsx`), not an ancestor walk.

### The height cost — the real question, and it is a choice between two shapes

M0 leaves this open. The row is 41 px (a 1 px `border-t` plus a `size-10` = **40 px** icon Button,
`button.tsx:35`, which is the floor). Two candidate shapes:

**(A) Make it the stage card's footer.** One card containing the diagram with the foot row below it,
the existing `border-t` becoming an internal divider. **Cost: 0 px.** It ties the row to the _stage_
— which is defensible: the row's subjects are the plan's activities and the selected one.

**(B) Give it its own chrome card**, matching the band's device (radius, shadow, and the 3 px
`--primary` rule mirrored to the top edge so the two cards bracket the diagram). **Cost: ~9 px** —
one extra border plus a gap separating it from the stage, since two adjacent cards need one.
`ChromeBandRow` carries no padding of its own, so no `py` is added.

**(B) is what the product owner asked for**; (A) is cheaper and may be what they actually want. This
is not settleable by argument — it is exactly the question ADR-0099 established that four width
epics got wrong for want of a screenshot. **Build both, shoot both at 1646 with a selection (§2a),
and put the two pictures and the 9 px in front of them.** My own preference is (B): a status band at
the foot is the workstation idiom the Graphite model named ("a status bar for facts"), and the amber
rule bracketing the diagram top and bottom is the old Flask app's own device, which is where this
palette came from.

**Do not do (C), a full-bleed navy row**: the workspace body's `px-3 pb-3` inset means it cannot
reach the window edge without unpicking the card grammar for one row.

**Check with the gate, not by eye:** the moment the row is `chrome`, `token-contrast.test.ts` starts
computing pairs it has never computed, because these components have only ever been validated against
the page family. Expect it to be informative. `alpha-composite.test.ts` matters here too —
`bg-foreground/5` is an alpha over the scope's `--background`.

---

## 5. Q2 — "toolbar on the left, activity summary on the right?"

M0 is right that swapping moves nothing, and right that ADR-0114 D2's stated reason is false as
implemented. It then stops at _"the order is therefore a free choice"_. **It is not free — one order
is strictly more stable than the other — but the two-region framing is what makes it look like a
coin toss.**

### The geometry, taken one step further than M0 took it

With `[facts shrink-0 basis-auto][dock flex-1 basis-0][toggle 40]`:

- the facts' **left** edge is constant (the row's `px-4`);
- the object bar's left edge is at `facts width + gap`, so **it moves whenever the facts change width**.

Swapped:

- the object bar's left edge is constant;
- the facts' **right** edge is constant (pinned by the toggle); their left edge moves.

The facts' width is not stable. It changes when the critical-count fact appears or disappears
(**104 px**, `plan-facts.tsx:165-170`, conditional on `criticalCount > 0`), when the schedule goes
stale and `ScheduleStateRegion` renders a sentence and a `Recalculate` button, and when the pen
sentence paints in its two states (**126 px**).

**So today, running a recalculation that turns 0 critical activities into 1 shifts every object
action right by 112 px — at precisely the moment a planner is watching that row.** That is the class
of defect ADR-0094 names when it refuses to put the conflict count on the Next-conflict label:
"moving controls under the planner's cursor between two presses of the same button."

### But the straight swap has its own cost, and ADR-0110 D1 is why

`Activities 5` is not just a fact. ADR-0110 D1 made it name the panel **and** give its size,
deleting the panel's duplicate heading. A heading belongs at the leading edge of the thing it names.
Sent to the trailing edge it stops reading as a heading and becomes another number.

### Recommendation: three regions, not two

```
[ Activities 5 ] [ ——— object actions ——— ] [ Data date · Finish · n critical ] [ toggle ]
```

- `Activities N` leads: it labels the panel below/above it, and its width is constant to within a
  digit — so the object bar's left edge is stable to ~7 px.
- The object bar takes the middle at a fixed left edge.
- The schedule facts trail, where their **right** edge is pinned and their varying left edge is
  invisible (a trailing status cluster is read as a cluster).
- It gives the foot the same grammar as the header, which ADR-0113 settled as three sections on
  `justify-between`.

**The discriminator is honest and worth writing down**: `Activities N` is a fact about the **panel**;
Data date, Finish and the critical count are facts about the **plan's schedule**. They were one block
by accident of history, not by subject.

**Cost.** `PlanSlotName` (`plan-slot-host.tsx:41`) already exists for exactly this and takes a third
name for the price of a string — the file argues that case itself. `PlanFacts` splits into two
renders sharing one `FactList`-style source so they cannot drift.

**Confidence: low, and this is the lowest-value item in the epic.** Do not ship it alone, and do not
ship it before §2a's photographs. If B (§3) lands, the object bar shrinks by 40 % and the whole
question gets smaller.

**Probe.** Measure the facts block width across `{fresh, stale, pending} × {critical 0, critical n} ×
{pen editing, pen lost}` at 1646. If the spread is under ~50 px the instability argument collapses
and the answer is "leave it".

---

## 6. Q3 — "could the activities be two lines, keeping the same height?"

**Yes, and M0's "no" is an artefact of one Tailwind class.** M0 diagnoses it correctly and then draws
the wrong conclusion from its own diagnosis:

> _"Measured, a wrapped facts row is 64 px, because the row is `gap-4` — 24 + 16 row-gap + 24"_

`gap-4` sets `gap`, which is **both** `row-gap` and `column-gap`. `plan-facts.tsx:72` declares
`flex min-h-6 shrink-0 items-center gap-4 px-3 text-xs`. Change it to `gap-x-4 gap-y-0` and two lines
of `text-xs` (16 px line-height) are **32 px**, which is under the row's 40 px floor
(`button.tsx:35`, `icon: 'size-10'`).

**Two-line facts are free at every width.** M0's verdict — "a loss at 1920, neutral at 1646 and a
gain only at 1440" — describes `gap-4`, not the idea. The document says as much in its own last line
("any design that wants them must first answer the 16 px row-gap") and then reports the verdict as if
the gap were fixed.

Verify before relying on it: with `gap-y-0`, is the second line's ink still legible, and does the
16 px line-height hold once a leaf carries the `CircleAlert` icon (`size-3`, `inline-flex
items-center`)?

### But do not make it the default

Two lines of 12 px grey text is worse to read than one line, and at 1920 the facts have no width
pressure at all. What the product owner is reaching for is the second-order effect M0's own §3 table
shows at 1440: wrapping the facts narrows the block, the freed width goes to the dock, and the foot
goes 117 → 77 with the canvas gaining 40 px.

So the right shape is **wrap under pressure, one line otherwise** — which is what
`plan-facts.tsx:85-92` already concluded when ADR-0110 D4 withdrew the container query:

> _"the thing that decides whether they need to collapse is whether the ROW is tight — which depends
> on what is docked beside them, and is known at the row, not here."_

That is right, and the mechanism is not a query, a breakpoint or a constant: it is `flex-wrap` plus
`gap-y-0` on the facts and letting the row's flex distribution decide. **It reverses ADR-0114 D2's
"the strips are the thing that should wrap, because a strip is transient and the facts are always
there"** — which should be stated as a reversal, with the reason: D2's rule was written when the
facts _could not_ wrap, so it was an assumption rather than a choice between two wraps, and the
1440 number that would have decided it did not exist.

**This is the one item here I would not take on my own arithmetic.** The distribution is not obvious:
the dock is `flex-1 basis-0%`, so its shrink contribution is proportional to a **zero** base — the
facts would absorb the entire deficit, which may be right or may collapse them. Getting it right
probably means `basis-auto` on the dock and `min-w-0` in place of `shrink-0` on the facts wrapper,
and it interacts with `PlanFactsOutlet`'s `shrink-0` (`plan-slot-host.tsx:125`), whose docblock
explains why it is there.

**Probe.** A four-cell what-if at 1646 and 1440, selection present: `{gap-4, gap-x-4 gap-y-0} ×
{facts shrink-0, facts min-w-0 + dock basis-auto}`, reporting facts width, facts line count, dock
width, dock line count, foot height and canvas height. Assert the 1920 no-selection case is
unchanged — the one thing this must not do is wrap the facts on a screen with 1049 px of dock.

---

## 7. Q4 — "should the bottom toolbar always be visible, with buttons greyed out?"

**Don't.** Three reasons, in order of weight.

1. **It makes §0's cost permanent.** M0 prices it: 77 px at 1646 and 117 px at 1440 whether or not
   anything is selected. Today the dock renders zero items and zero height. The epic would be paying
   the defect it opened to fix, all the time.
2. **With nothing selected there is no subject, which is ADR-0082's first omit row.** Ten controls
   shaded against an object that does not exist, and ADR-0082's own clause — _"a menu whose every
   item would be shaded renders no trigger"_ — settles the surface-level case: a surface whose every
   item would be shaded should not render. `selection-actions.tsx:143-153` has already applied that
   reasoning to this exact bar.
3. **The reasons would be false.** `scheduleRefusal(PEN_ACTION)` produces
   _"Start editing to change this activity"_, which is about the pen. With nothing selected the
   refusal is "there is nothing selected". Getting ten reason sentences right for a subjectless state
   is real work in the service of a state nobody should be in — and ADR-0060 and ADR-0082 both record
   an invented pen sentence shipping false.

**But the request is not wrong, it is aimed at the wrong thing.** What makes the row look unfinished
at rest is that it has no surface (Q1), not that it has no buttons. Fix Q1 and at rest the row is a
status band with the plan's facts in it, which is what a status band looks like. **Q4 is answered by
Q1** — say that to the product owner rather than "no".

There is one legitimate residue: with nothing selected, nothing teaches a first-time planner that
selecting a bar yields ten actions. If that is worth solving, the cheap answer is **one resting hint
in the dock** ("Select an activity to edit it"), which costs 0 px because the dock is already there
and already hosts the empty-plan notice (ADR-0092 D6a). I would **not** do it: a permanent statement
is noise after day one, and ADR-0114 D5 has just spent a milestone establishing that the dock shows
at most one _transient_ strip. Raise it, price it at zero, recommend against.

---

## 8. Q5 — "get some commands out of the dropdowns, especially at the bigger scale"

### The premise is true and the conclusion does not follow

M0 establishes the slack (1175.6 px on deck line 2 at 1920) and then finds almost nothing worth
promoting. I agree, and I can put a number on the constraint it does not price.

**The deck can afford exactly one promotion, and the binding width is 1440, not 1920.** Line 2 slack
is 169.5 px at 1440, so an item wider than **~161 px** starts a third deck line — costing the canvas
at the width that has least of it. From M0's measured label table, one promotion fits and two do not.

So the question is not "what could we promote" but "**what single command is worth 1440's deck
line**". Of the 13 real commands: nine are one export family whose members ("Diagram — current view
(PDF)") are meaningless standalone; three are Analysis dialogs a planner opens rarely; one is
`Edit plan…`.

### The 24-checkbox `View ▾` should not be emptied, and it is not the finding either

ADR-0091's thesis — a mode is not a command — applies exactly. 35 of the 48 items behind the triggers
are lens toggles, zoom presets and tool-type radios; promoting a checkbox onto a command deck makes a
lens look like a command, which is the vocabulary confusion that ADR cost an epic to fix.

And the panel is already well formed rather than a dumping ground: `ViewTogglesPanel`
(`tsld-toolbar-items.tsx:1665-1690`) renders one `<fieldset>` + `<legend>` per non-empty group over
`VIEW_TOGGLE_GROUP_ORDER`, with native `radiogroup`s for the two exclusive sets and a `max-h-[60vh]
overflow-y-auto` cap. Two of its members are already promoted out (`Legend`, `Resource view`,
ADR-0092 D5) and the promotion is **derived** from the same `LensToggle` record
(`promotedLensItems()`, `:337`), with `lensTogglesIn` (`:322`) holding the on-the-row-or-in-the-panel
invariant. That is a good mechanism, and it means "promote one more" is a one-line change if the
product owner ever names one.

**So: no, `View ▾` is not the real finding, and no, it does not need a different shape.** The one
question I would raise about it is a product question, not a measurement: it mixes the **frequent and
spatial** (five zoom presets, relocated there by ADR-0091 D3) with the **set-and-forget** (nineteen
structure and lens toggles), so changing zoom means opening a 24-row scrolling panel. There is no way
to settle that from the code — this product has no telemetry — so it is a question to ask, not a
change to make. Note that `zoom-in`, `zoom-out` and `fit` are already on the deck as `ICON_ONLY`
buttons, so only the _presets_ are in the panel.

### `Summary ▾` is a defect — but not "a dropdown containing exactly one command"

M0 says: _"`Summary ▾` is a dropdown containing exactly one command. It costs a click and offers no
choice."_ **That is the probe's answer to "how many commands", reported as a description of the
panel, and it is materially wrong.** `PlanSummaryPanel` (`plan-summary-panel.tsx:30-59`) renders a
`<dl>` of Status / Data date / Mode, then `ScheduleSummaryStrip`, then an `Edit plan…` shortcut for
writers. It is a **facts panel** with one command appended, not a command trigger.

The real defect is §2b: it duplicates four facts the foot row already carries, and `Data date`
appears in it **twice**, adjacent, separated by a `border-t`.

**What I would do:**

1. **Delete `PlanSummaryPanel`'s own `Data date` row.** `ScheduleSummaryStrip` renders it eight
   lines below (`:108`). This is unambiguous, costs nothing, and needs no decision.
2. **Promote `Edit plan…` to the deck's `plan` group as a plain button.** It is the one command worth
   1440's budget, it is ~90 px (fits with 79 px to spare), and it is a plan-level command sitting
   inside a facts panel — which is precisely the "the command surface has no vocabulary for a fact"
   confusion inverted. Net deck width ≈ 0, because the `Summary ▾` trigger it replaces is about the
   same width. **This is the only promotion I would make and it is roughly free.**
   Note ADR-0082's Consequences record `plan-actions-menu.tsx` hiding `Edit plan…` on `!canWrite`
   with no reason sentence, deliberately left alone as `docs/TECH_DEBT.md` #114 — a promoted deck
   button inherits that, so either shade it with a real reason or keep the omit and say why.
3. **Rename what is left for what it is.** `Summary ▾` is a diagnostics panel — near-critical,
   constraint conflicts, externally driven, missing a driver, levelling counts — none of which is in
   the foot row and all of which is worth keeping. It is not a command trigger and should not be
   grouped with them.
4. **Do not touch `ScheduleSummaryStrip` itself**: it is shared with the guest share view
   (`GuestPlanView.tsx`), so trimming it there has a blast radius outside this epic.

### One structural note

`selection-duplication.structural.test.ts` compares the two **registries**. §2b's duplication is
between a registry item's popover body and a non-registry component, so that gate is structurally
blind to it — exactly as `conflict-remedy.ts:12-15` records for the withdrawn third strip. **If this
epic fixes §2b, it should say in the fix's docblock that no gate can hold it**, rather than leaving
the next reader to assume one does.

---

## 9. Probes this epic should run before it designs anything

In order.

1. **`shoot.mjs` gains `plan-workspace-selected` and `plan-workspace-selected-summary`** (§2a). The
   subject of the epic has never been photographed. Nothing below is worth doing first.
2. **Facts-leaf re-measure excluding `position: absolute`** (§1a). Expect 381.3 px across four
   painted leaves, not 481.4 across five.
3. **Explorer-width sweep** at 1646 × `{34, 200, 276, 420}` × `{none, activity, summary}` (§1b). This
   decides whether §0 has a fixed budget at all.
4. **State sweep for the bar's content width**: `{Early, Visual} × {activity, summary} ×
{fresh, stale} × {unflagged, flagged}` (§1c). ADR-0114 recorded that 1604 px is the row's
   _narrowest_ state; nobody has measured its widest.
5. **Facts-wrap what-if**: `{gap-4, gap-x-4 gap-y-0} × {shrink-0, min-w-0 + dock basis-auto}` (§6).
6. **`token-contrast.test.ts` and `alpha-composite.test.ts` with the foot row in `chrome`** (§4),
   before any values are chosen.

---

## 10. Checklist for the implementer

- [ ] Photograph the selected state **first** (§2a). Add both shots to `shoot.mjs` permanently.
- [ ] Ship the §0 remedy **alone and first**, as ADR-0114 D1 shipped, ahead of every arrangement
      decision.
- [ ] `clear-visual-placement` becomes `isVisible`-gated on Visual mode, with the ADR-0082 §3 omit
      row cited at the registration and the "shading implies a value is there" reasoning written out.
      Check `conflict-remedy.structural.test.ts` still holds and say why in the test.
- [ ] **Do not** make any object-bar item icon-only. If width is still short, take `Deck.tsx:72-83`'s
      written test to the whole set at once, or take D8.
- [ ] Moving `zoom-to-selection` / `isolate-logic` to the deck: they shade with
      "Select an activity first" (ADR-0082 shade row), which repays the discoverability cost
      `selection-actions.tsx:152-153` records losing. Re-measure the deck's line count at 1440 before
      and after — this is the one place the move can cost canvas.
- [ ] Any change to `Deck` or `Toolbar`'s roving focus, arm/disarm or Escape precedence runs
      **accessibility-reviewer + component-reviewer before it ships**, per §19.13 / ADR-0111. Two
      instances in two days (`docs/TECH_DEBT.md` #189, #192), the second inside the fix for the first.
- [ ] The foot row's `chrome` scope: add one sentence in `canvas-dock.tsx` about the portal making
      `SurfaceToneContext` and `[data-surface]` disagree (§4).
- [ ] Fix `selection-actions.tsx:952-954`, which states pre-ADR-0114-D7 heights as current (§1e).
- [ ] The dock's cost to the canvas is a **bound**, not an equality, since ADR-0114 D1. State the new
      bound in `dock.spec.ts` in numbers, at a named Explorer width — a bound with no number is a gate
      that cannot fail.
- [ ] Nothing here needs a `VITE_` flag. ADR-0088 D1: a `VITE_` constant is inlined at build time and
      buys the operator no rollback. The rollback is a commit boundary, and §0's fix should be its own
      commit.
- [ ] The CPM engine is not imported and no migration runs; the ADR-0034 parity gate is untouched by
      construction. `database-architect` is not engaged because there is no schema to design.

---

## 11. Where I would tell the product owner no

- **Q4 (always visible, greyed): no.** It costs the diagram 36 px at 1646 and 76 px at 1440 in every
  state, permanently, and shades ten controls against a subject that does not exist. Q1 fixes what it
  is actually reaching for.
- **Q5 (get commands out of the dropdowns): almost entirely no.** There is one worth promoting
  (`Edit plan…`) and the deck's budget at 1440 is one. 35 of the 48 items behind the triggers are
  modes, not commands, and ADR-0091 cost an epic to establish that the difference matters.
- **Q2 (swap the two regions): not as posed.** The answer is three regions, and it is the
  lowest-value change here.
- **And one to myself:** M0's proposed pair fits at 1646 by **8.2 px**, in the row's narrowest state,
  at one Explorer width, on a surface whose last six width expectations were each contradicted by
  their own measurement. A fix that thin is not a fix; it is the seventh instance waiting to be
  written up.
