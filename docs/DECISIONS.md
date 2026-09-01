# Decision log

A lightweight, chronological log of decisions that shape the project but don't
warrant a full [ADR](adr/). Significant, hard-to-reverse architectural choices
get an ADR instead (and may be linked from here).

> Format: newest first. Each entry records **what** was decided, **why**, and
> any **consequences**. Decisions are not edited once recorded — add a new entry
> to change course.

---

## 2026-09-01 — The context drawer is deleted, and ADR-0097 D2 is closed as not wanted

`docs/TECH_DEBT.md` #156. No ADR: nothing is designed here. ADR-0101 already decided that an editor
is a dialog and not a drawer; this is that decision followed to the end of the mechanism it left
behind, on the product owner's call between the two exits #156 itself named.

**What went.** `components/layout/drawer/` entirely — `drawer-subject.tsx` (the registration
context, its `show`/`focusRailButton` controls and `ContextDrawerEmpty`), `context-drawer.tsx`,
`use-context-drawer-prefs.ts` and their suites — plus `drawer-entry-point.test.tsx`, the `drawer`
member of `CHROME_SLOT_NAMES` with its slot in `ChromeSlotHost` and `test-chrome-host.tsx`, the
shell's trailing grid column, its `onShellKeyDown` Escape rung and the `shellWidth` ResizeObserver
that existed only to clamp the drawer's width. The shell grid is two columns; the band's §4a
zero-width argument is unchanged, because an `auto` column with no child was already zero wide —
which is precisely how it sat unused without anyone noticing.

**The row's own premise had gone stale, and the correction made the work larger.** #156 said "the
drawer itself is very much alive: it holds the Project Explorer". ADR-0109 D2 docked the Explorer
into its own leading-edge column on 2026-08-25, so by the time the row was acted on the drawer held
nothing at all — making `ContextDrawer`, its persisted preference and the chrome slot dead too,
none of which the row or the question put to the product owner described. Cause 3 from the
2026-08-30 entry above, four days later, in the row that entry's own sweep left standing: a
milestone that moves something does not go back and edit the rows that describe where it used to
be. Taking the smaller scope would have left new dead code in the commit that deleted dead code.

**Three tests were deleted rather than kept green.** They asserted that Escape wrote no collapse to
`schedulepoint-context-drawer` — a key nothing writes now, so they would have passed against
anything. One case is **kept and retargeted**: the shell root must still not swallow Escape or fold
the Explorer, whose fold state is a persisted preference of its own. That is a live risk with no
mechanism behind it, which is exactly when an assertion beats a paragraph.

**Every citation of a deleted file was repaired, not left dangling** — `panel-surface.structural.test.ts`'s
pinned positive list (which would have thrown, and was the first thing the deletion had to answer
to), four docblocks that cited `context-drawer.tsx` or `drawer-subject.tsx` as a precedent, and two
that pointed a reader at `drawer-entry-point.test.tsx`. Historical specs and ADRs are left alone:
they record what was true when they were written. `docs/FRONTEND_ARCHITECTURE.md` **states the
absence** rather than dropping the sentence — a reader who remembers the drawer needs to be told it
is gone, not left to infer it from silence.

---

## 2026-08-30 — A register row is a claim frozen at the moment it was written

`docs/TECH_DEBT.md` #219. No ADR: this records a finding and a method, and the one thing it points
at that would need building is a shared gate, which needs its own spec (ADR-0105).

**The trigger was recommending work that was already done.** Asked what was worth doing for polish
and correctness, three candidates were drawn from the register and put to the product owner. One of
them — `#109`, `bulkDelete` under the plan-wide lock — had been fixed three weeks earlier. It was
recommended without opening the code, in the same message that warned the reader the register
drifts. ADR-0076 Class 3, against this repository's own register.

**So the sweep was a measurement, not a tidy-up.** Seven rows were checked against the code by hand:
six were fixed and never closed, one was reported fixed by an automated pass and is half fixed.
Three distinct causes, none of them forgetfulness — the fix landed inside an epic named for
something else (`#109`); the subject was deleted rather than fixed (`#134`, `#147`, both describing
a width ladder ADR-0109 D1 removed); or the premise lapsed under a later decision (`#146`, which
exists because Graphite M3 moved a control ADR-0109 D2 moved back).

**Cause 3 has no available cue, and that is the transferable part.** Nobody was wrong at any point
in `#146`'s life. A milestone that fixes something does not go back and edit the rows that
complained about it, so a row goes stale silently and by default. `docs/RECONCILE.md`'s rule —
verify the claim, do not trust the document — has been applied to prose and to specs' problem
statements; this is the same rule for the register, which is the artefact that decides what gets
picked up next.

**The residue is stated as a known-unknown rather than classified.** Only 35 of ~105 rows make a
status claim a parser can find. Three classifiers were written and returned three different
answers — and the second matched the word "closed" inside `#169`'s own sentence explaining that a
neighbouring row would _read as_ closed when half closed. Scanning prose for a verdict is the
fourth instance of that mistake here, made while auditing the register for exactly this class of
error. So ~70 rows are recorded as unverified rather than having an agent classify them and the
answers written in as fact.

**One calibration worth keeping.** An automated sweep reported `#169` FIXED and it is half fixed:
the empty strip is gone because ADR-0109 D2 put a fold control in that row, and the duplicated gate
the row also names is untouched, verbatim, at two lines of one file. Six sibling closures in the
same batch verified and held. **A report about the register is a document like any other** — the
cheap step is opening the file the row cites, and it is what produced all seven results.

**Also found: a grep for known-deleted names cannot find a citation of a name nobody remembers
deleting.** `#193`'s 2026-08-25 pass searched for `ToolbarOverflow`, `toolbar-ladder.ts` and
`computeLadder` and corrected four docblocks. Two more citations of the same class were sitting
beside them — `companionsOf` (justifying a live invariant in two places, in `defineToolbar` and in
its own test) and `isWidthConstrained` (cited with a `Toolbar.tsx:81-84` that resolves to neither
that symbol nor anything like it). Both went with the ladder. The instrument that would find them is
the opposite direction — resolve every backticked identifier in a comment against the tree — which
is `#177`/`#183`'s shape turned on this repository's own symbols instead of a dependency's.

---

## 2026-08-30 — Paper follows the reader, and the document owns the identity

`docs/TECH_DEBT.md` #217. No ADR: this settles two questions about an existing deliverable and adds
no surface.

**A printed programme prints the columns the reader chose.** The print surface mapped over all of
`GANTT_COLUMNS` while the screen hides Predecessors by default, so paper ignored the choice. That
was invisible while the column printed an em dash on every row; the moment it carried real names it
would have grown every existing plan's document a wide column overnight — the change that column's
own docblock says nobody asked for. This is ADR-0103/#167's rule ("the export is MY picture, not a
fixed one") applied one artefact along, and the alternative — a fixed column set — is a document
that disagrees with the screen it was printed from.

**Sort order is deliberately NOT included in that.** The surface takes the default WBS order
whatever the grid is sorted by, and its docblock gives the reason: a programme two people print
from the same plan should be the same document. Columns are "which facts do you want on the page";
sort is reproducibility. Following the screen on one and not the other is a distinction worth
stating, because "make paper match the screen" would have taken both.

**The document owns the plan's identity; the picture owns the picture.** The printed diagram named
the plan twice, six lines apart, in two date formats — the DOM heading and the band painted into
the embedded PNG. `PrintSurface.tsx`'s docblock shows the duplication was deliberate when it
shipped, and it survived because nothing photographed that document until 2026-08-29. The heading
wins because it is real, selectable text that a browser's print outline can see; the band keeps the
legend, which means nothing outside the picture, and the "scaled to fit" note, which is a fact
about that raster alone. `renderExportImage`'s new `bandContent` is defaulted, so the standalone
PNG and PDF — which leave the product and must name themselves — are unchanged.

**Two new inputs are required rather than optional, and that is the finding.** `barDateSource`'s
docblock in the same file records this exact failure once already: props threaded onto the surface
while the input type stayed silent, so the only production caller could not pass them. The
Predecessors defect is that shape a second time. Optional is what both have in common, so
`dependencies` and `hiddenColumns` are required — the ADR-0070 `hoursPerDay` pattern, adopted for
the same reason. It cost ~15 test call sites, which now each state what the reader chose.

## 2026-08-29 — Carrying the typeface to the layers that opt out of the cascade

`docs/specs/typeface-outward-artefacts/`. No ADR: this applies an existing decision (IBM Plex Sans,
chosen 2026-08-24) to layers it never reached, and the gate is ADR-0058's standing instruction
rather than a new position.

**The mechanism, and why not the obvious alternatives.**

- **Print: one declaration on `.tsld-print-container`, not `body` inheritance and not per-sheet.**
  The finding worth keeping is the one a future reader would otherwise re-derive: `body`'s own
  `font-family: var(--font-sans)` resolves **on body**, so a later `[data-surface="print"]` rebind
  of that token — the obvious way to give paper its own face — is **silently ignored**. That is
  ADR-0102's alias trap in a new costume, and it is why the family is declared at the element
  `print-document.ts` already stamps the scope on. The two feature stylesheets that used to name
  `'Inter'` are deleted rather than corrected; a DOM surface should declare nothing.
- **Canvas: one `FONT_STACK` string, not a token read at paint time.** `measure.ts` keys its width
  memo by text alone and says so — sound only while the font is constant. A per-paint token read
  would make that unsound silently. It lives in `geometry.ts` because
  `geometry-is-a-leaf.structural.test.ts` pins that file's imports with an exact `toEqual`.

**A deviation from the plan, taken on the product owner's instruction.** The plan's T7 said the
authoring document should name **no face inline** — a document that does not restate a value cannot
disagree with it. Asked directly, the product owner chose "fix it **and** gate it". So
`DESIGN_SYSTEM.md` names the face and `typeface-reach.structural.test.ts` parses its claim and
asserts it against `--font-sans`. Both designs are drift-proof; this one keeps the document useful
to read at the cost of a gate, and the gate is what makes the naming safe. Recorded because the
shipped shape differs from the approved plan and the reason is not in the plan.

**The favicon is a named exception**, also the product owner's call: one glyph at 16 px in browser
chrome, and the one outward artefact a gate scoped to `apps/web/src` structurally cannot reach
(`docs/TECH_DEBT.md` #216).

**And the harness that photographs paper was not photographing paper.** `shoot.mjs` revealed the
print container with `display: block` in page script and never emulated print media, so `@media
print` never applied — it had been showing the SCREEN's treatment of a print document, and would
have shown the RIGHT face throughout the whole time this defect existed. Fixed, and the shot list
gained the two print documents it had never had: the printed diagram and the printed programme, the
two artefacts a planner actually hands over. Both reported a content defect in their first picture
(`docs/TECH_DEBT.md` #217). The emulation reset is unconditional at the top of the shot loop rather
than paired with each reveal, because `emulateMedia` is a **context** setting that survives
navigation and this harness shares one page across the list — so the one-line fix leaked paper media
into four later shots before the two new ones made it visible.

---

## 2026-08-29 — Fix-slice M-E/M-F: the small decisions the ADR does not carry

Three calls from the fix-slice epic (`docs/specs/fix-slice-2026-08/`) worth a line each; the
epic's primitive decision is ADR-0117 and the CAL-05 campaign is
`specs/fix-slice-2026-08/m-e0-measurement.md`.

**No changeset for the fixture amendment, on a structural ground.** `@repo/engine-conformance`
sits in `.changeset/config.json`'s `ignore` list, so a changeset for it is not merely unneeded
but impossible — and nothing releasable changes in M-E (the fixture is test infrastructure; the
engine, the API and every image are untouched). Recorded because the plan said "changeset patch
@repo/engine-conformance (confirm which packages version)" and the confirmation answered _none_.

**The orphan `.xer` mirror was hand-amended rather than left or deleted.** The generator does not
emit it and nothing in the repository reads it, but it encodes CAL-05's window (name + daily
serials 46300–46311), so leaving it would create exactly the stale-mirror drift the epic's own
consistency gate exists to stop — one file over, in the one artefact no gate covers. Amended in
step (serials 46296–46325); deletion was not taken because the file is part of the vendored
benchmark's provenance (ADR-0034).

**The export marker row is reserved unconditionally.** With both marks off the strip is empty
paper rather than absent, so the export's geometry never depends on which `View ▾` toggles a
planner had on — a conditional row would make the WBS band's offset (and every downstream
sampling constant) a function of scene state, which is how the journey's old restated `110`
constant went wrong the first time.

## 2026-08-28 — Reconciliation pass: one register, two numbering styles, and a seam fixed once

Run at the correctness programme's boundary (ADR-0116 + the polish pass + the four-phase
programme, released `web-v0.112.0`/`api-v0.55.1`/`web-v0.113.0`), on the product owner's "what
next" with the fix slice deliberately sequenced after it — the programme had itself found ~6 stale
register rows while working, so a fix slice chosen off the un-trued register would have been
aimed by stale claims. Full findings in [`RECONCILE.md`](RECONCILE.md)'s table; three worth
carrying:

**The debt register held two numbering styles and they collided.** Modern rows are `## NNN.`;
three rows filed in the em-dash style (`## #NNN —`) reused **182/183/184**, numbers the dot style
had already spent — so `#182` resolved to two different debts depending on which grep you ran, and
one in-register cross-reference already pointed at the wrong one. The em-dash trio is renumbered
**#207/#208/#209** with tombstone notes in both directions and every external citation updated
(two specs, ADR-0110, one journey docblock). The collision class is exactly the ADR-0079/ADR-0071
number-collision failure, one document over.

**The #205(b) fix was one correct pattern applied to a seam and not its neighbours** — the step-7
api review's blocking finding. `WorkingTimeHorizonExceededError` was mapped to the typed 422 at
recalculate and the critical-path test, and **three more public read routes reached the same walk
and still answered raw 500s**: float-paths (via `computeFloatPaths` → `computeSchedule`),
earned-value and resource-histogram (both via ADR-0071 per-assignment lag phasing). All three now
map through the one `rejectIfWorkingTimeHorizonExceeded` mapper, and the enumeration stopped being
remembered: `horizon-seams.structural.spec.ts` scans the service for walk-entry calls and fails on
any method missing the mapper — verified red naming exactly the three offenders before the fix.
OpenAPI on all four routes, a `docs/API.md` section, and the existing e2e case extended to prove
float-paths live.

**The component review's blocking finding is filed rather than folded, and the reason is
ADR-0105.** The `Surface tone="panel"` + trailing-border pairing is a verbatim literal in four
places and drifted once inside the very commit under review; the fix is a `PanelSurface`
primitive, which changes a shared primitive's public surface — an ADR-0105 trigger — so it is
`docs/TECH_DEBT.md` **#210** with the reviewer's full enumeration, not a mid-pass commit. The
review's cheap nits were folded: the `getSceneLenses` optional-call tolerance now states in its
comment that it serves only cast-based test doubles today, `PaintSceneOptions` carries the
extend-this-not-the-signature rule, and the `#173` font-load bust gained the two tests it never
had (`MeasureCache.clear()`, and the `document.fonts.ready` wiring — the latter verified red by
disabling the bust). Steps 1–3, 5 and 6 verified clean; step 4 also fixed `menu.tsx`'s `busy`
docblock, which cited `ToolbarOverflow` for parity — a component ADR-0109 D1 deleted.

**And running the pass's own gate closed `#119a`'s three-session mystery.** The mandatory
`e2e-local.sh api` run failed — captured in full this time, per that row's standing instruction —
and the log names the cause: a leftover `resource_assignments` row in the shared `app_test`
failing `activities.e2e-spec.ts`'s `beforeEach` for all 45 tests at once, because **twenty** specs
swept `activities` without sweeping assignments first (the #119 defect one table along, in files
whose own comments record the class). The fails-once-passes-on-re-run signature finally has a
mechanism: the files run in sequence and a later suite that does sweep assignments deletes the
poison, so every re-run was clean and every re-run destroyed the evidence. All twenty specs fixed.

## 2026-08-25 — Reconciliation pass: the cadence itself had stopped

Run at the product owner's request after the `workspace-chrome-fit` epic, with two subjects they
added by name. Full findings in [`RECONCILE.md`](RECONCILE.md)'s table; the three worth carrying:

**The pass cadence had stopped and nothing noticed.** Eleven ADRs (0100–0110) landed between
2026-08-20 and 2026-08-25 with **zero** passes recorded, against a rule that says "at each epic
boundary" and a prior cadence of one every 1–4 days. Each epic looked complete on its own, which is
exactly why the gap was invisible: there is no single document a reader could have opened and found
wrong. The `RECONCILE.md` banner said "Last full pass: 2026-08-20" and was **true**.

**A document the previous pass had just fixed was wrong again four days later.**
`TOOLBAR_ROADMAP.md`'s first substantive paragraph was corrected on 2026-08-20 from a stale `row`
union; ADR-0109 then deleted the **tool rail** it named and the **`⋯` overflow** it described, so by
2026-08-25 it documented two mechanisms that no longer exist in the tree. The lesson is not "check
harder" — a pass had checked, and the epic after it broke the correction. It argues for what the
paragraph now says: if it goes wrong a third time, delete it and let `Deck.tsx`'s own docblock be
the single description.

**The product owner's testing hypothesis was falsified, and the real number was somewhere else.**
They asked whether we over-test locally, suspecting the many `check:*` gates. Measured: those ten
cost **10.4 s between them — 2.2%** of the gate. `pnpm test` is **345.6 s** and `lint` **112.7 s**,
96% of an ~8-minute run for a one-line web change, and **both are expensive by configuration rather
than necessity** (no `eslint --cache`; all 552 web test files on every run). Recorded as `#191` with
the CI comparison that decides it — CI's equivalent job is 11 m 22 s, so the local gate buys a round
trip rather than latency — and deliberately **not acted on**, because `prepush.sh` is a shared gate
and editing it fires an ADR-0105 trigger.

**Also fixed here:** `CLAUDE.md` §19.12's wake-up wording, which said "arm a wake-up **before the
turn can end**" — advice that permits arming last, and arming last is how a session lost two hours
on 2026-08-25. ADR-0076 Class 3: correct advice that cannot work. The rule now says _first action of
the turn_, and records that the mechanism which actually held is the instruction living **inside the
fired message**, not in this repository — with the honest caveat that it is not a gate and cannot be,
since nothing in CI can observe whether a session re-armed.

**And the fix produced a second instance of the same defect within the hour, which is why it is
recorded rather than quietly corrected.** The re-armed message carried a terminal condition
requiring the work to be "merged and released — tag and publish job confirmed". This change has **no
changeset**, so merging it opens no Version Packages PR and cuts no release: the exit test could
never pass, and a loop whose exit test cannot pass does not stop, it re-arms forever while looking
diligent. ADR-0076 Class 3 committed inside the fix for ADR-0076 Class 3. §19.12 now says to check a
terminal condition is _reachable_ before arming it.

### 2026-08-20 — Reconciliation pass at the ADR-0099 epic boundary

**What it found**, in the order the runbook walks:

**The count gate was passing over two stale numbers in a file it already reads.**
`docs/ARCHITECTURE.md` said "28 models … 48 migrations are committed" against 29 and 57 — not an
ungated copy but a **gated file whose sentence no pattern matched** (`across (\d+) migrations` and
`\+ (\d+) migrations` do not see "48 migrations are committed"). Seventy-five lines above the stale
figures, that file claims the gate "has never covered this file", which stopped being true in the
commit that wrote it. `docs/DATABASE.md` carried the same two numbers behind a "(counted
2026-08-09…)" note — the advice this gate exists to replace. Patterns widened to a bare noun plus one
optional adjective, which was not speculative: the first widening still missed "48 **committed**
migrations" in the run that proved the point. Third distinct way this gate has been wrong about the
same six numbers.

**Five register rows were annotated CLOSED in their titles**, which the register forbids in bold on
line 10 — and the previous pass deleted two of that shape and left five. #113 said CLOSED in its
title and **open** in its status line. Two more were falsified by the epic (#126's "the segments
carry no icon field at all"; #129's "the 56 px header row is the last recoverable band"). All seven
verified against the code, deleted, ledgered.

**#133 was re-measured rather than re-worded**, because every figure it held described the two-row
surface M5 deleted and two of its three named remedies have since been removed from the product. On
the merged strip at 1646 a coarse pointer costs **two commands off the row, one of them
`next-conflict`** — which carries the highest rank on the strip, so the padding costs more than any
ranking can defend. The geometry is gated; the budget is not.

**`DESIGN_SYSTEM.md` still described the palette ADR-0099 replaced, one day later** — "Navy chrome
around a light working canvas", `#14213D`, `#f8f9fa`, four ratios computed against those grounds,
against live tokens that are dark graphite on dark graphite. That is the governing document for
colour. Rewritten as the **rule**, pointing at `token-contrast.test.ts` instead of holding figures,
because restating numbers it does not own is how it came to be wrong about all of them.
`TOOLBAR_ROADMAP.md`'s first substantive sentence named a `row` union the codebase does not have;
`.claude/agents/ui-architect.md` asserted a top bar deleted three weeks earlier; `ROADMAP.md` said
the docked editor "is deferred to its own epic" one paragraph after describing the epic that shipped
it; and `BACKLOG.md`'s **top line** described that editor as unbuilt on the day it shipped.

**Step 7 blocked, and the sharpest finding was a claim of mine.** Three specialists over the 1,075
lines written after the M10 gate pass — code no reviewer had seen. The drawer's new Escape rung
answered presses belonging to nested confirmations, so dismissing "Delete note" closed the editor
under it; and the new programmatic entry point opened silently, where the modal it replaced was
announced by the platform. Both fixed with tests verified red. Then: `plan-status-bar.test.tsx`
asserted the bar had "no coverage at all, direct or indirect" — disproved in one command, because
`plan-workspace-toolbar.test.tsx` mounts `TestChromeHost` and reads the bar's own label. An
unverified claim **about missing verification**, inside the milestone whose subject is exactly that,
and repeated into `CLAUDE.md` and ADR-0099. Corrected in all three.

**The lesson, which is not a new one:** every gate that failed here failed by **wording** or by
**scope**, never by arithmetic. A gate is only ever pointed at the copies somebody remembered.

---

### 2026-08-20 — Four milestones lost their headline task to re-reading the problem

**Decision.** A plan's **problem statement** is re-verified at the start of each milestone, the same
way its citations are (`CLAUDE.md` §19). Recorded here because Graphite made the case four times in
a row rather than once.

M7 was to re-host the canvas dock into the status bar; ADR-0092 had already put the dock where it
belongs and the re-host would have **reversed** that decision. M8's §A15 asked which of two Gantt
layouts to build; ADR-0095 had shipped the grid beside the chart, so the answer was neither. M9 was
empty on the same test. And M6 was the mirror image — a task recorded as done that had not been
done at all.

**Why the process could not catch it.** Everything here re-verifies a **solution's** claims. Nothing
was re-verifying a problem's, because a milestone that fixes something does not go back and edit the
spec that complained about it. A stale problem statement makes no false claim a reader can check; it
simply describes a world that has moved on, and the plan still reads as work owed.

**Consequence.** Each of those milestones still shipped something, and something smaller and
different from what its plan named — a status bar of facts, a grid splitter, a screenshot that found
a defect twelve days older than the epic. Writing the withdrawal down was the milestone's product in
two of the four cases, which is the part that feels like nothing and is not.

---

### 2026-08-20 — Two guesses about React's effect ordering, and a probe that settled it

**Decision.** The activity editor's chrome swap suppresses the modal by a **derived** condition
(_no modal while a drawer could hold this instead_), not by a latch cleared in an effect.

**What was measured, after reasoning failed twice.** Opening the editor asks the shell to show the
drawer; the shell can only agree one commit later, and in that gap `modalShell` rendered `open`. The
first guess was that this was harmless. The second was that a `useLayoutEffect` would beat it —
wrong, because React flushes a commit's **passive** effects before the re-render a layout effect
schedules, so `Dialog`'s `showModal()` still ran, focus still went into the top layer, and the next
commit still unmounted it. A probe in `progress-entry.spec.ts` recorded the actual sequence — the
button still connected, `document.activeElement` the body, `in BUTTON[Close dialog]` → `out` →
`dialog removed` — which named the top-layer restore in one run.

**Consequence.** The derived form covers a second case the latch did not: a planner who has
deliberately pointed the drawer at the Explorer no longer gets a modal popped over their choice. It
also carries no state, so the `setState`-in-an-effect lint rule has nothing to object to — the latch
was committed red and caught on the next run.

---

### 2026-08-18 — A flag's class was wrong, and the gate that checks it cannot see the shape

**Decision.** `VITE_NAV_TREE` retires (ADR-0098 M0), and its register entry records that it had been
filed **class B** — a one-line guard — while `authed-layout.tsx:15` was
`if (NAV_TREE_ENABLED) return <AppShell />;`: an early return selecting between two whole layouts,
which is the **class A** shape by ADR-0088's own definition.

**Why it matters more than one flag.** ADR-0088 replaced a retirement _calendar_ with a
_classification_, and class A — "the flag selects which of two different JSX roots a component
returns" — is the class that ratchets: `classACap` is set at the measured count and lowered after
each retirement, so an alternative surface beyond the cap fails CI while the conversation is still
cheap. That mechanism was reading a number it could not compute. `detect-alternative-surfaces.mjs`
matches ternaries returning JSX and is blind to early returns — this file's own `$classA-note` says
so — so the measured count was 2 where the true count was 3.

**What was NOT done, deliberately.** `classACap` was not raised. Retiring in the same commit keeps
the detected count at 0 and leaves the cap untouched; raising a ratchet for a flag that is leaving
would be the wrong direction, and the register says a raise needs an ADR.

**The residue.** The detector's blind spot is unfixed and is now written down where the next curator
will meet it. Two flags were found by a person reading code, not by the gate — which is the same
observation ADR-0088 made about `check-flags.mjs` matching `'true'` and `'false'` identically, one
mechanism along.

---

### 2026-08-18 — Reconciliation pass at the ADR-0095 epic boundary

**What was decided.** Run the pass ([`RECONCILE.md`](RECONCILE.md), ADR-0058) at the boundary of the
Gantt-editing epic, whose M5 completion released as `web-v0.92.0` the same day. The previous pass was
2026-08-17, so the three-month floor was nowhere near — this ran on the epic-boundary trigger, and the
argument for running it anyway is that three findings existed before it started. Documentation, plus
four product fixes the specialist gate found. All seven automated gates were green throughout, so every
finding below comes from the manual half.

**1. The application grew a scheduler, and four documents still said it had not.** ADR-0087 shipped
`common/operational/retention-sweep.service.ts` on 2026-08-10 — one hourly `setInterval`, `.unref()`'d,
no Redis — beside `heartbeat.service.ts`'s own timer, and its D2 **narrows** ADR-0009 rather than
superseding it. `ARCHITECTURE.md` §10's ADR-0009 row still read _"No queue, no Redis. All work is
synchronous."_ The same hole was in its sibling `.claude/agents/backend-performance-reviewer.md`, whose
async invariant is a correct negation that had never heard of the sweep — found by RECONCILE §1's own
standing instruction to check siblings when patching a claim, which is the second consecutive pass that
instruction has paid for. Both wrong readings are expensive and in opposite directions: one invites
building a scheduler that already exists, the other invites putting a durable, retryable job on one that
has neither property.

**2. Three register rows outlived their work, and two broke the register's own rule.** #136 and #137
were annotated `CLOSED 2026-08-18` — the one thing the file's opening paragraph forbids in bold, because
a row that says it is done is a row a reader still has to read — and #135 was fixed on 2026-08-17 and
never closed at all. All three are deleted and entered in the Closed-numbers ledger, which exists so the
ADRs citing them do not dangle. Row 1's suite count was re-derived: **33**, against the 30 recorded ten
days earlier. The rule-breaking half is the notable part: the annotations were written by the same hand
that had read the rule that forbids them, one day earlier.

**3. Two claims in `CLAUDE.md` were false, one of them load-bearing.** Its ADR-0095 entry still named the
columns chooser, Indent/Outdent, Insert and view memory as unbuilt — three days after they shipped and
one day after they released. And §17 asserted _"There is no hard-delete or data-erasure path"_, while
`interchange.service.ts:1134-1139` really does hard-delete on a failed import. The substance was right
(it cannot be aimed at existing data) and the absolute phrasing was wrong in a way that matters:
**ADR-0073 C3.4 decided where to write `interchange.imported` precisely because that delete exists**, so
a reader taking the sentence literally cannot follow that argument. `BACKLOG.md`'s top item described a
delivered epic as unstarted, contradicting its own convention that a backlog listing finished work is
worse than none.

**4. Step 7 earned its keep for the fifth pass running, and the fourth finding was mine.** Three
reviewers were pointed at PR #327 — the M5-completion diff, which had shipped with no gate pass, which
is the ADR-0081 gap one epic after that decision was written. All three blocked.

- **Indent, Outdent and Insert had no keyboard path at all** — WCAG 2.1.1, Level A. The row-menu
  trigger is `tabIndex={-1}`, correctly, and that was paid for by a comment saying keyboard users reach
  the same actions through the row's selection. **That was true when M5-T3 shipped** and was made false
  by T4/T5, which added three items that exist only in this menu because the docked bar cannot honour
  them. Not a wrong decision — a correct justification that decayed, with nothing watching it.
- **The reparent write announced nothing**, on success or on failure, though `WbsBulkAssignBar` and
  `ActivityMembersPanel` both announce the identical ADR-0063 M4b batch.
- **`collapsedWithheld` was computed, documented as "reported" in two places, and read by nobody** —
  eight lines below the link cap's own comment reading _"Either the count is visible or there is no
  cap."_ Its unit test passed throughout, because it drives the pure function the UI never called.
- **A false coverage claim of my own**: `TsldPanel.a11y.test.tsx` justified asserting only the shortcut
  _request_ by citing two covering tests — one file that did not exist and one e2e spec that mentions no
  shortcut. Both citations were written in the commit that made them false. ADR-0076 Class 3, inside a
  diff whose commit message invoked the discipline.

All four are fixed with regression tests **verified red first**; the non-blocking remainder is register
row **#138**.

**5. One near-miss, recorded because the method matters.** #135 was almost reported as an unwired fix
because the grep for its host used `features/plan-workspace/` — a directory that does not exist (the
real path is `components/layout/workspace/`). The absence of a match is not evidence when the path is
wrong, and a pass whose whole method is grep-then-read has to treat an empty result as a question.

**Consequences.** `ARCHITECTURE.md` §10 and the backend-performance agent now describe the scheduler
honestly and name ADR-0009's reopening trigger. The Gantt's structure gestures are keyboard-operable and
announced. Both caps in `GanttPanel` now say what they withheld. `PlanShortcutsHelp` has the test that
was claimed for it. Nothing in the release pipeline changed.

---

### 2026-08-17 — Reconciliation pass at the ADR-0088 D3 flag-retirement boundary

**What was decided.** Run the pass ([`RECONCILE.md`](RECONCILE.md), ADR-0058) at the boundary of the
flag-retirement epic. Three epics had shipped since the 2026-08-13 pass (ADR-0093, ADR-0094, this
one). Documentation only; no product behaviour changed.

**1. The mail claim's third copy — and it is the expensive reading.** `docs/ARCHITECTURE.md` §10 still
said the mail port "exists with a **logging** implementation only; no transport is configured, so
invitation emails are logged rather than sent". `SmtpMailService` has shipped for weeks and the
deployed host sends. `CLAUDE.md` §17 was corrected on 2026-08-04 and `docs/BACKLOG.md` on 2026-08-05
— **this file was never opened**, which is [`RECONCILE.md`](RECONCILE.md) §1's own sibling
instruction failing for the third time. BACKLOG's correction records exactly what this wording costs:
it "is the reading that leads someone to build a second mail path". It was sitting in the
architecture document the entire time.

**2. ADR-0012 names CASL, which has never existed in this repository.** Its Decision puts
permission→capability logic in a policy layer "evaluated with **CASL**". CASL is in no `package.json`
and no source file. Same species as ADR-0006's shadcn/ui + Radix clause, which got a status-line
correction on 2026-08-04 while its sibling went unchecked. The reason no gate caught it is
**structural**: `ARCHITECTURE.md` §10 lists ADRs that are _wholly_ unbuilt, and ADR-0012 is mostly
built — every module depends on its guard — so a partly-built ADR's dead clause has nowhere to be
seen. §10 now states that limitation in its own text, and ADR-0012 carries the ADR-0006 treatment.

**3. Nine ADRs still called the product "Blank App"** — the pre-rename template name, ADR-0001 among
them, i.e. the ADR that defines the ADR process. Corrected in place: this changes no decision, only
the name of the product each decision is about. The two surviving mentions (`CHANGELOG.md` and this
log's 2026-07-09 entry) are the record of the rename itself and stay.

**4. Register row 31 described two RETIRED flags as live — and I created half of that the same day.**
It read "`VITE_CANVAS_TOOLBAR` ships dark during build", default-off, "only the default-on flip awaits
product sign-off", with "three layered flags" as its impact. Both flags are retired; neither is in
`env.ts`. Its only live content was three fast-follows. I deleted `VITE_CANVAS_WORKSPACE` that morning
and never asked the register what it said about it — the runbook's "also run a partial pass when you
resolve a register row" trigger, unfired by the person best placed to fire it. The pattern is worth
more than the incident: **the author of a change is the worst-placed person to notice what it
invalidates elsewhere**, which is the argument for the pass existing rather than for trying harder.
Row 31's item (d) — an empty plan **hides** commands rather than shading them with a reason — is also
now the minority answer in its own codebase, since ADR-0082 (menus) and ADR-0083 (fields) both settled
the opposite way; it is a spec↔code reconciliation now, not a matter of taste.

**5. Row 16's blocker is discharged, and nothing said so.** It forbids enabling
`AUTH_REQUIRE_EMAIL_VERIFICATION` until a web bundle carrying ADR-0074 M2 is live. That shipped in
`web-v0.75.0`; the host auto-pulls every release (ADR-0047) and the current tag is `web-v0.90.1` —
sixteen releases past. What remains is one operator action, not engineering work. A row whose blocker
has quietly been met reads exactly like one still blocked, and so stays a priority below whatever is
being built — the failure ADR-0085 named when it insisted an unconditioned `M` carries a written
trigger.

**6. The sixth shadcn/ui claim, and a rule followed rather than overridden.** The 2026-07-08 stack
entry in this file still credits shadcn/ui; the 2026-08-04 pass corrected five documents and left it.
It was annotated in place and then **the annotation was reverted**, because this file's own header
says decisions are not edited once recorded — a new entry is the sanctioned way to correct course, and
this is that entry. Recorded explicitly so the next reader does not "fix" it by annotating: the entry
is accurate about what was decided on 2026-07-08, and ADR-0006's status line is where the outcome
lives. The tension is real — a reader of that entry alone still meets a library we do not use — and it
is resolved in favour of the log's integrity, deliberately rather than by omission.

**Clean.** Every count correct, so step 1 found nothing — the 2026-08-13 deletions held.
`package.json` descriptions accurate. The agent invariants naming absent libraries (BullMQ, Radix,
shadcn/ui) are all correct **negations**. The three `REFERENCE_FEATURE` exemplars exist. The four
wholly-unbuilt ADRs are still unbuilt, with no dependency installed for any of them.

**Method note.** Step 7 ran against this session's **own** unreviewed diff — the 27 converted
Playwright specs and the CI/config changes — rather than against something already reviewed.

---

### 2026-08-13 — Reconciliation pass at the ADR-0092 epic boundary

**What was decided.** Run the pass ([`RECONCILE.md`](RECONCILE.md), ADR-0058) at the boundary of the
workspace-chrome epic. Documentation and tooling only; no product behaviour changed.

**Three findings, and the third is why this pass produced a gate rather than a list of edits.**

**1. The runbook disagreed with the gate it defers to.** §1 tells the reader to run
`find apps/web/src -type f | wc -l`, which answers **937**. `check:counts` derives ts/tsx only and
answers **932** — on the one figure the runbook explicitly says the gate owns. A reader following the
step meets a number the gate would reject, and has no way to tell which is wrong. The command now
matches the derivation.

**2. The sibling nobody looked at.** `apps/api/README.md` carried four stale counts — 20 modules
against 22, 27 models against 29, 47 migrations against 54, 32 e2e specs against 40 — each stated
twice, in the banner and again in the structure block. `apps/web/README.md` had the _identical_
defect and was fixed on 2026-08-09 by deleting its copies and pointing at the gated source. The API
README was never opened. That is verbatim what §1 warns about in its own words — _when you patch a
gate, ask whether the same hole is in its siblings_ — and the warning was written by the pass that
left this one. Three further ungated restatements went the same way: `BACKEND_ARCHITECTURE.md`,
`TESTING.md`, and `.claude/agents/feature-analyst.md`, which is worse than a document because it
asserts a module count into **every spec it writes**.

**3. The third repeat, and the gate it finally earned.** `ROADMAP.md` was silent on **ADR-0087
through ADR-0092**. The 2026-08-04 pass found it silent on 0067–0073. The 2026-08-09 pass found it
silent on 0074–0085 and recorded the reason in the register: _"the same failure as the two rows
below, two epics later, which is why that check is a numbered step and not a habit."_ It **was** a
numbered step. It failed anyway, because a numbered step is still a human remembering.

So it is now `pnpm check:adr-coverage`. Three decisions inside it are worth keeping:

- **It is aimed at `ROADMAP.md`, not at `CLAUDE.md`'s register**, which was complete on all three
  occasions. The two answer different questions — _what did we decide?_ versus _where is the product
  going?_ — and only the second rots silently, because nothing downstream breaks when a shipped
  capability is missing from it. A gate aimed at the healthy copy would have been green all three
  times.
- **The exemption register is set at the measured floor of 39**, not at an aspirational number. That
  is ADR-0058's own lesson about the coverage ratchets (API 74% / web 87%, not 80%): a gate that
  fails on day one gets deleted rather than fixed. Sixteen of the 39 are explicitly marked **debt,
  not decision** — shipped capabilities the roadmap never picked up — so the register reads as a
  queue rather than as an endorsement.
- **It fails both ways.** An exemption for an ADR that _is_ cited is also an error, because a stale
  exemption is a licence for the next ADR to claim it by copying its neighbour.

Verified red first, against ADR-0092 itself.

**Also:** the CI comment beside `check:claims` said "34 citations" against a register of 49 — the
gate's own defect class, one layer out. The number was removed rather than corrected, since nothing
gates a comment.

**What was clean**, and checked rather than assumed: the four accepted-but-unbuilt ADRs (0009 queues,
0010 caching, 0011 object storage, 0013 metrics/tracing) are still unbuilt — no `bullmq`, `ioredis`,
`redis`, `@aws-sdk/client-s3` or `@opentelemetry/api` in any manifest; the three
`REFERENCE_FEATURE.md` exemplars all exist; both agent files that name absent libraries do so as
**correct negations** ("there is no queue", "there is no Radix"); and `STAFF_EMAILS` is documented in
`.env.example` as well as `docker-compose.yml`.

**Step 7** — the specialist agents over recent work — was satisfied by the epic's own M6 gate pass
earlier the same day: ux, accessibility, component and performance over the whole ADR-0092 diff,
which found four defects and is recorded in that ADR.

---

### 2026-08-09 — Reconciliation pass at the ADR-0086 epic boundary

**What was decided.** Run the pass ([`RECONCILE.md`](RECONCILE.md), ADR-0058) at the boundary of the
staff-console epic. Documentation and tooling only; no product behaviour changed here — the epic's
own M6 fold, which did change behaviour, is a separate commit.

**Two findings are worth carrying beyond their fix.**

**A gate can be wrong about the same numbers in more than one way, and each way looks like the gate
working.** `docs/ARCHITECTURE.md` said **20 feature modules** against 22 — found by reading it, which
is the method ADR-0058 exists to replace. It was ungated for two independent reasons: the file was
not in `check:counts`'s target list, and its wording ("feature modules") differed from the stage
banner's ("API modules"), so adding the file alone would not have caught it. Widening for both then
exposed a third hole in the same script — each pattern matched only the **first** occurrence in a
document, and `CLAUDE.md` states the module count twice, so its repository-layout tree could rot
behind a green check. Every one of these was a _fixed instance_ rather than a _fix_: the previous
pass, hours earlier, had patched a line-wrap bug in one of six patterns and left the other five. The
lesson recorded here is to ask **"is this class closed?"** rather than "is this instance fixed?"
whenever a gate is corrected. Both new cases were verified red before the fix landed.

**An instruction that cannot be followed is not a weaker instruction; it is a deferral wearing a
test's clothes.** `DEPLOYMENT.md` told the operator to keep the superseded mail cron "until you have
watched the new path alert on the real host at least once". A relay does not break to a schedule, so
that condition retires the cron either never or on a day nobody is watching — leaving the
replacement deployed and unproven indefinitely, which is a worse state than either alternative. The
fix is not softer wording but a **procedure that induces the failure**: confirm the heartbeat first
(it proves outbound POSTs leave the container at all, so a failure there is learnt without breaking
mail), point `MAIL_SMTP_URL` at a dead port, trigger one send, watch, confirm the durable row
landed, restore. `TECH_DEBT` #100's closing condition carried the same unfireable wording and was
amended to match. Where a document asks an operator to _observe_ something, check that the
observation can be **caused**.

Also folded: the same section still opened by recommending the superseded cron with its replacement
thirty lines below; `TECH_DEBT` #8's CSP flip advice rested on one person walking every route with a
console open, when this epic shipped the sink that collects violations from every visitor; and two
debt entries both numbered `102`, the newer renumbered to `117` across six files.

---

### 2026-08-09 — Reconciliation pass at the ADR-0083/0084 epic boundary

**What was decided.** Run the pass ([`RECONCILE.md`](RECONCILE.md), ADR-0058) at the boundary of the
shade-don't-hide epic, and fold every finding. Documentation and tooling; the product behaviour
changed only where a milestone had already changed it.

**What it found — one finding, in three costumes.** The gate was right and aimed at a quarter of its
subject.

`pnpm check:counts` has re-derived `CLAUDE.md`'s six stage-banner figures since ADR-0076, and it has
worked: the banner was correct. The same figures also sat in three ungated documents. The **front
door** — `README.md`, the first thing any reader meets — said **73 ADRs against 85** and 23
Playwright suites against 29, five days after a parenthesis reading "counted 2026-08-04".
`apps/web/README.md` was wrong about three of four. `docs/FRONTEND_ARCHITECTURE.md` restated a module
count it does not own.

Widening the gate to the front door then found it **passing for the wrong reason**. `README.md` wraps
as `23 flag-scoped\n> Playwright suites`, and exactly one of the six patterns carried the
`\s*>?\s*` that survives a line break — so somebody had met this problem, fixed the pattern in front
of them, and left the other five to be discovered by a wrong number surviving a green check. That is
the ADR-0077 M0 shape one gate along, and it is now impossible by construction: the patterns are
built from phrases by a helper that makes every space tolerant.

The two internal copies were **deleted** rather than gated. A document restating a number it does not
own has no reason to hold one, and correcting them would have had to pick silently between two
counting methods that disagree (`find … | wc -l` says 897 where `check:counts` says 893).

**What else.** `ROADMAP.md` was silent on **ADR-0074 through ADR-0085** — the identical failure the
2026-07-31 and 2026-08-04 rows record, two epics later, which is why it is a numbered step rather
than something to remember.

**And step 7 earned its keep again**, this time by looking at the flags. `env.ts` declares 58 `VITE_`
flags and calls `flagDefaultOff` **zero** times: every one is default-on, i.e. a rollback contract,
and no decision anywhere said when a contract ends. Fourteen recorded no enablement date in any
artefact — docblock, ADR or git. That became **ADR-0084** and `pnpm check:flags`, which caught its
own ADR's D4 stated backwards on its first run. Separately, `docs/BACKLOG.md`'s "Privacy operations
`M`" turned out not to be work but an unresolved collision with the audit log's `ENABLE ALWAYS`
triggers — **ADR-0085**.

**Consequences.** `check:counts` covers two documents and its patterns tolerate wrapping.
`check:flags` joins the CI doc-gates. `RECONCILE.md` gains the rule the pass produced: _when you
patch a gate, ask whether the same hole is in its siblings — and point a new gate at every copy of
the claim, not the one in front of you._

---

### 2026-08-04 — Reconciliation pass at the ADR-0073 epic boundary

**What was decided.** Run the pass ([`RECONCILE.md`](RECONCILE.md), ADR-0058) at the audit-log
epic's boundary, and fold every finding rather than filing them as debt. Documentation-only; no
application code changed.

**What it found.** More, and worse, than the two passes before it — and the pattern is that the
documents nobody opens rot fastest.

- **Every headline count was wrong**, in a banner that had said "recounted 2026-08-01" three days
  earlier. Modules 19→20, models 25→27, migrations 42→47 (and the same file's layout tree said 41,
  disagreeing with its own banner), ADRs 70→73, suites 19→23, seeded plans 36→37. One epic shipped
  in between. The lesson is written into the runbook: **a count is a measurement with a timestamp**,
  and the date is the claim, not the word "recounted".
- **`apps/web/README.md` was never opened by any previous pass.** It said "**Status: foundation
  only. No application features are implemented yet**" beside 748 source files and 27 feature
  modules; it credited **shadcn/ui**; and its structure block listed **`lib/telemetry`**. Those last
  two are, by name, the exact examples ADR-0058 cites as what the pass exists to catch — sitting
  undisturbed in the file the checklist did not name. The runbook's §1 file list now names it, along
  with three others it had also missed.
- **ADR-0006's shadcn/ui + Radix clause was never adopted**, and no ADR said so. A reader following
  the register would have copied in primitives the codebase deliberately hand-rolls on the APG. The
  decision body is left intact (`CLAUDE.md` §6 — never rewrite an ADR); the correction is carried on
  its **status line**, which is the existing amendment convention (ADR-0023/0024).
- **Three of `CLAUDE.md` §17's stated limitations were false.** There _is_ an append-only audit log
  (ADR-0072/0073, shipped the day before). There _are_ data-export paths — XER/MSPDI via
  `GET …/export/:format`, plus CSV/PNG/PDF and the printed programme. The mail port is _not_ a
  logging stub — `SmtpMailService` ships and is selected whenever `MAIL_SMTP_URL` is set. A section
  headed "Known limitations" listing capabilities the product has is worse than no section: it is
  the direct cause of building a thing twice.
- **Hosting was settled on 2026-08-01 and four documents still called it open** — `CLAUDE.md` §1 and
  §17, `README.md`, and `DEPLOYMENT.md`, whose banner also called itself "the process the foundation
  supports" while running every release to a live host. This is the mirror of the usual failure: a
  **settled decision reading as work owed**. Both directions cost the same.
- **`ROADMAP.md` was silent on ADR-0067 through ADR-0073** — seven ADRs, five flag flips, the whole
  audit epic. That is the 2026-07-31 pass's finding recurring one epic later, which is itself the
  finding: noticing a class of drift does not prevent the next instance. **`ARCHITECTURE.md` never
  mentioned the audit log** at all, though an append-only table defended by `ENABLE ALWAYS` triggers
  is a structural property of the system; it now has its own §7 subsection.
- **Four agents were wrong in the way the runbook warns is worst.** `ui-architect` prescribed
  shadcn/ui; `backend-performance-reviewer` told reviewers to demand work be offloaded to a BullMQ
  that does not exist; `database-architect` and `test-engineer` pointed at the reference template and
  two spec files ADR-0057 **deleted**. An agent asserting a stale invariant is worse than one
  asserting none, because it is confident.
- **Five debt rows described expired premises.** #8 "CSP not finalised" actually means the web app
  serves **no `Content-Security-Policy` header at all** — the highest-value unclaimed security
  control in the repo, understated by its own title for a year. #37 listed the canvas WBS summary bar
  as outstanding five days after ADR-0063 shipped it — **in a different shape**, so the remediation
  column was stale by being _answered differently_, not by being done. #12 described a private-repo
  risk this public repo does not carry, framed for a template it is not. #1 and #7 still described
  the foundation stage.
- **This runbook had drifted about its own drift control** — the banner said the last pass was
  2026-07-28, its own table said 2026-07-31.

**Consequences.** The counts, the four false claims and the register corrections are folded here.
Two items are handed on rather than fixed in a documentation pass: the **missing CSP** (#8, rewritten
to say what is actually absent and how to ship it report-only first) and **cross-browser coverage**
(#1, rewritten to name the two or three journeys worth running on another engine rather than all 24).

**Step 7 found two blocking defects, and they are the best argument the runbook has.** The audit
epic was not eligible for step 7 — six specialists had already reviewed it in C4.1 — so the pass
targeted **PR #225** (SMTP transport, the verification loop, compose credential wiring), which landed
standalone with no review pass and no entry in this log, and which introduced the application's first
outbound network transport. Security and devops, working independently, found the same first defect.

1. **The verification token was written to the log on the default path.** `LoggingMailService` logged
   the full `verifyUrl` at `info`, and it is selected whenever `MAIL_SMTP_URL` is unset — which its
   docblock called "i.e. development" and which is in fact the state of a **production** host whose
   operator has not configured SMTP, i.e. the running deployment (#16). Better Auth mints a token on
   every sign-up regardless of `AUTH_REQUIRE_EMAIL_VERIFICATION`, and Pino's redact list covers fixed
   `req.*` paths and would never have masked a hand-built field. So a live, single-use token that
   marks an address verified — the exact proof of mailbox ownership invitation-accept trusts
   (ADR-0016 §5) — went into a retained, shipped log stream. **Fixed:** the stub now takes
   `isProduction` and withholds the link there, naming the misconfiguration instead. The regression
   test was verified to fail against the old code first. Note the shape: the invitation path had
   _always_ withheld its `acceptUrl`. One correct pattern, applied to a control and not its
   neighbour — the ADR-0064/ADR-0067 finding, again.

2. **"A verification failure fails the sign-up" was false**, in three places that asserted it — the
   adapter's docblock, `better-auth.ts`'s port contract, and `docs/DEPLOYMENT.md`. Better Auth calls
   the port through `runInBackgroundOrAwait`, which catches and logs without rethrowing, in both
   branches, with no option this app can set to change it. **Corrected rather than redesigned:** the
   throw is right at that seam and is kept, the claims built on it are withdrawn, and the
   operator-signal gap is #94. Why it survived is the part worth recording — the only test drives the
   adapter _directly_, so it proves the throw and structurally cannot see the layer that swallows it.
   A guarantee tested one level below where it is claimed is not tested.

Restructuring the sign-up so a failure genuinely aborts is a design change and goes through
`docs/PROCESS.md`, not through this pass.

---

### 2026-08-03 — The deprecated day float field is removed, not carried

**What was decided.** `relativeFloat` (days) is deleted from the float-paths response, one release
after it shipped deprecated in `api-v0.38.0`. `relativeFloatMinutes` is the only float figure, and
there is deliberately no replacement day form.

**Why, given the entry below explicitly chose to retain it.** That decision rested on one clause —
"removing it would break any existing reader for no gain" — and the clause was checkable. There are
no readers: the web client has only ever read the minutes field, and the product owner confirmed no
external consumers. With the cost side empty, what was left is a field that returns a **plausible
wrong number**. On an eight-hour calendar, one working day of relative float came back as `0`. That
does not look like a fault; it looks like "this branch is on the driving path", which is a different
and confident claim. Deprecation protects the reader who looks at the docs; deletion is enforced by
the compiler.

**Why no day field replaces it.** A float path can span activities on different calendars, and after
ADR-0068 a day is a per-calendar quantity. The envelope therefore has no single factor to divide by
— picking one and being wrong for the others is precisely what the removed field did. Conversion
belongs to the caller, which knows the calendar it is presenting on.

**Consequences.** A breaking response-shape change against a published version, so a changeset says
so and the API e2e now asserts the **absence** of the property rather than merely not checking it —
a future "convenience" day field cannot come back without that failing first. Two web-side siblings
of the same defect were fixed alongside: the resource assignment row's derived-duration preview was
also dividing by a flat 1440 (telling an eight-hour planner a one-day derivation was "0.3 days"),
and the "render minutes without a day factor" arithmetic existed in three copies, now one.

**How it was caught.** Not by a gate — by asking, after the epic shipped, whether any flat-1440
arithmetic was left in the app. Two of the three fixes here were live defects nothing was testing,
and the third was a docblock that had gone on describing the old behaviour after the code changed
under it, one method along from the fix that changed it.

---

### 2026-08-02 — Float paths ship as a panel with one-path emphasis, in both views

**What was decided.** Audit finding **F4** — the engine computes multiple float paths and
`GET …/schedule/float-paths` exposes them, and nothing in `apps/web/src` referenced the endpoint —
resolves as a **surface**, not a written-off capability. `VITE_FLOAT_PATHS` is default-on. The spec
and plan are [`docs/specs/float-paths-surface/`](specs/float-paths-surface/); the product owner's
answers to its three critical questions are in that spec's §7 (CQ-1 panel + one-path emphasis, CQ-2
require a selection and offer a suggestion, CQ-3 render on the target's calendar and disclose it).

**Why a panel and not a lens.** The question a planner is asking is compression planning — "if I
shorten the critical path, what binds next, and by how much?" — and the answer is a **ranked list
with a number on each row**. A canvas lens can colour bars; it cannot say `+2d 4h`. Emphasis is the
panel's companion, not its substitute: selecting a row dims everything off that chain.

**In both views, deliberately.** ADR-0059 M6's rule is "shade what only the canvas can do, never
what both views can". A float path is an **analysis over the persisted schedule**, not a canvas
gesture — the Gantt can render it as well as the canvas can, so shading it there would have been
that rule read backwards. The emphasis set is derived **once** by the workspace and handed to both
(the ADR-0063 `wbs-band-source` rule), pinned by
`float-paths-view-agnostic.structural.test.ts` rather than left as a convention.

**Consequences worth knowing.** The endpoint runs a full `computeSchedule` per request — it is not a
persisted read-model like earned value or the histogram — so the hook's `enabled` is the whole cost
story (it fetches only while the panel is open) and the security gate's per-IP `@Throttle`
(20 / 60 s) was taken as the server-side backstop. `staleTime` is nonetheless **0**: a stale float
path is a wrong float path, not an old one, and a recalculate already sweeps `scheduleKeys.all`.
**The CPM engine is not imported** — no scene field, no paint branch, and a paint-spy test asserts
the painter is handed `undefined` when no path is selected — so the ADR-0034 parity gate is
structurally untouched.

**What building it revealed.** The unit defect recorded in the F4 M0 entry below (a flat 1440
divisor against per-calendar total float), and a **pre-existing** defect this epic did not
introduce: the Gantt never fed the workspace selection, so every surface deriving from it was blind
to a bar clicked in the chart. The five specialist gates then found twelve blocking defects in code
that had already passed a human read — the ADR-0064 §7 shape again — the largest being a missing
chain member styled unactivatable with `pointer-events-none`, which a keyboard `Enter` walks
straight past.

---

### 2026-07-28 — Printing the Gantt: a print document, not a print stylesheet

**What was decided.** `Print` mounts a purpose-built `GanttPrintSurface` into a detached container
on `document.body` rather than styling the live view for paper. Recorded in
[ADR-0059 §6](adr/0059-gantt-view-rendering-substrate-and-the-view-seam.md).

**Why, and what turned it up.** M4 was planned as "a print stylesheet that paginates rows and
repeats the ruler per page". Building it surfaced the reason that could not work: **the live panel
virtualizes**, so a print stylesheet would emit a programme cropped to whichever ~40 rows happened
to be scrolled into view — and the app shell's clipped panes (ADR-0029/0030) would crop it further.
A document that looks authoritative and silently omits work is worse than no print at all, and it
is the exact failure a view built for people who don't read logic diagrams exists to avoid.

The detached-container pattern was already in the codebase — the TSLD Browser-Print path used it —
so this was less an invention than noticing an existing convention and extracting it
(`lib/print-document.ts`, `styles/print-document.css`). Three things fell out for free once the
document was ours to shape: every row renders, the span fits the page (`fitPxPerDay`, the inverse
of `chartWidth` — paper cannot be panned), and a real `<thead>` makes the browser repeat the
headings **and the time ruler** on every page with no pagination code at all.

**What was deliberately not done.** The in-app **PDF** button is not wired to the Gantt. It embeds
a raster from `renderExportImage`; a DOM Gantt cannot be rasterised by it. That was verified by
reading `export/pdf.ts`, not assumed. Browser print-to-PDF covers the need today, so a native Gantt
PDF is its own spec rather than a task smuggled into this one.

**A first attempt that was wrong.** The first fix was a `usePrintExpansion` hook that un-virtualized
the live panel on `beforeprint`. It was written, then deleted: it would have fought the shell's
clipping ancestors with `!important` overrides, and left the print output dependent on the live
DOM's layout. The detached surface makes the whole class of problem not exist.

---

### 2026-07-28 — The Gantt's review pass, and the control that was lit but did nothing

**What was found.** Reviewing the Gantt epic before flipping `VITE_GANTT_VIEW` default-on turned up
one blocking defect, and it was not in the Gantt: `setZoomPreset` in the toolbar context delegated
**only** to the canvas control handle (`canvasControlRef.current?.zoomToPreset(level)`). That handle
is null while the Gantt is mounted. So in the Gantt the zoom presets were **enabled and silently
inert** — a user clicking "Quarter" and seeing nothing change has no way to tell a broken feature
from a slow one.

**Why it was there.** The Gantt consumes the zoom preset (ADR-0059 §2 — the time axis is shared,
not reimplemented), so the control genuinely should work in both views. But the preset is _state_
that lives in `useTsldCanvasUiState`, while the toolbar had only ever needed to _command the
canvas_, which then reported back. Adding a second consumer of that state exposed the asymmetry.

**The fix, and the line drawn.** `setZoomPreset` now sets the shared state first and commands the
canvas second. Stepping, fitting and go-to-date are canvas **viewport** commands with no Gantt
meaning — the Gantt's chart already spans the plan — so they shade with a reason (`canvasActive`)
rather than sitting enabled. Pinned by `features/gantt/toolbar-in-gantt.test.tsx`.

**Worth recording about the pass itself.** It ran **inline** rather than through the specialist
subagents the ADR-0053 M6 and ADR-0056 M7 passes used. Those passes' value was independent eyes;
this one had one pair, and the plan says so rather than implying otherwise.

---

### 2026-07-28 — The documentation rebaseline pass, and what it found

**What ran.** The first full reconciliation pass under
[`RECONCILE.md`](RECONCILE.md) / [ADR-0058](adr/0058-drift-control-and-the-reconciliation-pass.md),
over four sittings. Every document in `docs/`, `README.md`, `CLAUDE.md` and the twelve agent
definitions was checked claim-by-claim against the repository. Shipped as PR #180
(`api-v0.29.0` / `web-v0.54.0`).

**What was found wrong.** Recorded here because ADR-0058's argument is that the findings, not the
diff, are the evidence the pass is worth repeating:

- **A coverage bar asserted in four places that had never once been measurable.**
  `docs/TESTING.md`, `docs/FRONTEND_QUALITY.md`, `CLAUDE.md` §7 and the PR template all required
  ≥ 80% on changed code. `@vitest/coverage-v8` was not installed, so `--coverage` failed outright
  and CI never invoked it. The bar had been quoted, in good faith, in review after review.
- **`passWithNoTests: true` in both apps**, commented "no app tests exist yet (foundation stage)",
  beside 2,429 passing tests. A broken `include` glob would have turned the suite green having run
  nothing — the gate would have failed silently in the one direction that matters.
- **Five documents specified libraries that are not installed:** Radix (via shadcn/ui), CASL,
  OpenTelemetry, BullMQ/Redis, S3, and a `lib/telemetry.ts` facade that was never written.
  `DESIGN_SYSTEM.md` specified nine primitives — toasts, tabs, charts, pagination, skeletons among
  them — that do not exist.
- **`API.md` documented the error contract with a `BILL_NOT_FOUND` example** inherited from a
  predecessor product, and never stated the one fact a client author most needs: the wire `code` is
  a generic class, and the branchable discriminator lives in `details.reason`.
- **Every README badge, the clone command and the security-advisory link pointed at
  `HuttonHomeHub/blank-app`** — a repository that does not exist.
- **The specialist agents, pointed at nine unreviewed commits**, found four defects invisible to
  their author: a live unlinked `aria-describedby` on the cross-plan client picker, a
  `SelectField.renderControl` escape hatch that could not pass a `ref` and so could not do the only
  job it existed for, a latent copy of a just-fixed bug in `Sheet`, and an overstated claim in this
  file.

**What the pass itself got wrong.** Two things, both instructive.

First, **the brief said "all documentation" and the third slice covered only the documents that
carried blank-template language** — the other eight were checked for that phrasing and not verified
claim-by-claim. Caught by the reader, not by me, and it became its own batch.

Second, and worse: **the pass corrected five documents that claimed shadcn/ui and left the claim
standing in `apps/web/package.json`**, where it shipped in the release the pass itself cut. The
checklist said "for each library a doc names, confirm it" and the manifests are not docs, so nothing
sent anyone there. `RECONCILE.md` step 2 now sweeps every manifest `description` with a one-line
grep. The whole audit is seven strings; the cost of checking them is nil, which is exactly why it
was never done.

**The general lesson**, consistent with the four passes that preceded this one: the drift is never
in the parts anyone is looking at. It is in the sentence that reads correctly, in the file nobody
opens, asserting something that was true when written.

---

### 2026-07-27 — Tech-debt register reconciled against the code

**What happened.** Every row in `docs/TECH_DEBT.md` was checked against the repository rather than
against memory. Nine rows were deleted as fully resolved, four rewritten to describe only what is
left, one corrected outright, and the file gained a rule about how it is meant to be maintained.
49 rows → 40.

**The worst finding was not in the register.** `CLAUDE.md` — the operating manual, which the system
prompt tells every assistant overrides its defaults — opened with **"Current stage: foundation in
place, application features not yet built … Do not assume domain code exists."** At the time it said
that, the repository held 19 API modules, 25 Prisma models across 41 migrations, ~570 web source
files, 15 Playwright suites and 56 ADRs. §17 repeated it ("No application/domain code exists yet")
and added a second false claim: that the web app has no entry point so CI builds only the API. CI
has built both and run Playwright for months. An instruction to distrust the code, in the one file
guaranteed to be read first, is the most expensive possible place for a stale sentence.

**Why the register rotted.** Two mechanics, both visible in the diff. First, rows were annotated
`**RESOLVED**` instead of deleted — nine had accumulated, and several were resolved in the title
while the remediation column still described the work as outstanding, so the row disagreed with
itself. Second, partial completion was recorded by prefixing "(a) RESOLVED" rather than rewriting
the row, so a row's title stopped describing its contents. Both make the register longer and less
true at the same time, which is the failure mode that matters: a backlog nobody trusts is not read,
and a backlog that is not read rots faster.

**The rule now written into the file.** Delete resolved rows; the commit and this log are the
history. When part of an item lands, rewrite the row to be about the remainder and rename it to
match. Reconcile after each epic while the context is fresh, verifying against the codebase — most
rows name a file or a flag, so checking costs a grep.

**Sampled and confirmed still accurate**, so the register is not wholesale unreliable: the four
dependency-pin rows (ESLint 9, Prisma 6, TypeScript 5, CodeQL public-only) all match
`dependabot.yml` and the workflow gate; #15 (no `Location` header, no envelope decorator helper),
#18 (no buildx layer cache), #20 (keyset cursor resolved before the scope filter), #21 (no
required-field indicator, no route focus/title manager, no `EmptyState`, no `DateField`), #43, #49,
#53 and #56 were each verified open by inspection.

---

### 2026-07-27 — `SelectField` lands, and stops at the sites that are genuinely different

**Decision.** `components/ui/form.tsx` gains `SelectField`, the enumerated sibling of `TextField`.
Sixteen hand-assembled call sites move onto it. Five groups deliberately do not, each named in
TECH_DEBT #42 with its reason. The register row is rewritten from "not extracted" to the residue.

**What the survey found.** The row said the idiom was hand-assembled "~6×". It was **33×** across 15
files — and two local helpers (`PlanScheduleOptionSelect`, `BucketSizeSelect`) had already been
extracted independently, which is itself the symptom. More usefully, the copies had drifted: some
error paragraphs carried `role="alert"` and some didn't, one hint was rendered but never linked to
its control, and one screen put the same id on two mutually-exclusive paragraphs. Duplication is not
the cost of a repeated idiom — divergence is, and it only shows up when you line the copies up.

**Two API decisions.** `errorRole` is opt-in rather than always-on, because the two kinds of error
differ: a validation message revealed on submit is already announced by `FormErrorSummary`, while a
failed options query appears with no user action and needs a live region. Making both announce would
double up the common case. And unlike `TextField`, a hint and an error render **together** — several
call sites already did that, and the hint (what the control does) stays useful while the error (why
this value won't do) is showing.

**Why it stops where it does.** The unmigrated sites are not leftovers. The flag-forked pickers carry
their own busy/optimistic state, so moving them changes behaviour rather than lifting markup. The
optimistic-select family is _richer_ than `SelectField`, not a degenerate copy of it — the right move
is to rebuild that helper on the primitive, not flatten it. Two more are latent defects (a duplicated
id, a raw `<select>` whose hand-copied chrome has drifted from the primitive) that deserve their own
change rather than being smuggled into a refactor where nobody would review them.

---

### 2026-07-27 — The recycle bin merges in the database, not the service

**Decision.** `RecycleBinRepository` replaces three `findMany`s and a service-side merge-sort with one
`UNION ALL … ORDER BY (deleted_at DESC, id ASC) LIMIT`. TECH_DEBT #22's over-fetch half closed; its
other half — "the web shows only the first page" — was already fixed and the row was stale.

**Why now, given the row said "if it ever gets hot".** Because the one consumer pages the whole thing.
The recycle-bin screen uses `apiFetchAllPages`, following the cursor to the end, so reading
`3 × (limit + 1)` rows to return `limit` was not a cost paid once — it was paid per page, every time
the screen opened. That is a different calculation from the one the register recorded.

**Deliberately not done: indexes.** A partial `(organization_id, deleted_at DESC, id) WHERE deleted_at
IS NOT NULL` on all three tables would make this genuinely cheap, and it is the obvious next step —
but deleted rows are a small minority of each table and nobody has profiled this screen. Shipping
three indexes on reasoning alone, inside a refactor, is what CLAUDE.md §15 means by premature. It is
documented in the repository as the measure-first escalation.

> **Superseded 2026-08-18 (ADR-0096 D6).** The three indexes shipped, after the profiling this
> paragraph asked for: one screen open on the largest seeded organisation went **1,208 ms → 466 ms**
> at 8,773 deleted rows, and the expiry's idle scan **13–19 ms → 0.7–1.4 ms**. A fourth candidate
> index was **rejected** on the same measurement. Read the paragraph above as the reasoning that
> deferred them, not as the current state.

**Consequence.** The hand-written keyset is now ours to keep correct, so the e2e gained the case that
would break it: a cascade stamps a client, its project and its plan with **one** `deleted_at`, so
ordering falls entirely to the id tiebreaker and every page boundary lands mid-batch across three
different tables. It pages that one row at a time and checks the result matches the unpaged read.

---

### 2026-07-27 — A dialog closes only on its own close event

**Decision.** The `Dialog` primitive compares `event.target` to its own element before calling
`onClose`, for both `close` and `cancel`. TECH_DEBT #50 closed; the reopen-the-parent workaround
comes out of the share-links e2e, and a new `dialog.test.tsx` pins the nesting.

**Why it happened.** `close` does not bubble, so the nesting looked safe. But React listens at the
root in the **capture** phase, and capture reaches every ancestor on the way _down_ — bubbling or
not. The inner dialog's close was therefore delivered to the outer dialog's handler, and confirming
a share-link revoke or a baseline delete tore down the dialog that had launched the confirmation.

**Why in the primitive.** The alternative on the register was portalling `ConfirmDialog` outside the
parent's subtree. Comparing the target is smaller, needs no portal target or focus-restoration
rework, and fixes every nesting **inside `Dialog`** — including ones nobody has written yet — rather
than the two that had been noticed. `ConfirmDialog` is built on `Dialog`, so one guard covers both.

**Correction (same day).** That paragraph originally claimed the guard fixed "every nesting", full
stop. It did not: `Sheet` is a **second**, structurally identical native-`<dialog>` primitive, and it
did not get the guard. No consumer nests a dialog inside a `Sheet` today — the Project Explorer
drawer renders its dialogs as siblings of `{children}` — so the bug was latent rather than live, but
that avoidance is a convention, not a property of the primitive. Caught by the
accessibility-reviewer agent, which traced the claim instead of taking it. `Sheet` now carries the
same guard and a regression test **verified to fail without it**. The general lesson: "one guard
covers both" was true of the two components I was looking at, and the word "every" quietly extended
it to a third I had not.

**Consequence.** A dialog's `onClose` now means "this dialog closed", which is what every call site
already assumed. The regression test asserts the parent survives **and** that `onOuterClose` was
never called — the second half matters, because a parent that merely re-renders open would pass a
visual check while still firing its host's close side effects.

---

### 2026-07-27 — A list declares `order` only if it honours it

**Decision.** `order` comes off the shared `PaginationQueryDto` and moves onto `ListBaselinesQueryDto`,
the single list that actually reads it. Every other list keeps its fixed direction and stops
advertising a param it discards. `docs/API.md`'s pagination section and the three `@ApiOperation`
descriptions that apologised for the ignored param are updated to match. TECH_DEBT #19 closed.

**Why.** The param was in the base DTO, so it appeared in every list's OpenAPI while one endpoint
implemented it. A client sending `order=desc` got a `200` and the wrong page — the failure mode of a
documented no-op is that it looks exactly like success. The fixed directions themselves were never
the problem: a member roster reading oldest-first and a note thread reading newest-first are product
decisions, and both are right. Advertising the opposite is what was wrong.

The alternative — implementing `order` across all ~15 lists — was rejected as scope invented by the
bug rather than requested by anyone. A `(created_at, id)` keyset does reverse correctly when both
terms flip together (baselines proves it), so any list can opt in later by declaring `order` in its
own DTO. None currently needs to.

**Consequence.** Because the API rejects unknown query params (`forbidNonWhitelisted`), sending
`order` to a list that does not declare it is now a `422` instead of being ignored — accepted, and
the point: a wrong answer becomes a visible error. No SchedulePoint client sends it. The rule is
now enforceable by reading one DTO rather than by remembering a caveat.

---

### 2026-07-27 — `verify-template.sh` restores what was there, not what was committed

**Decision.** The template verifier no longer cleans up with `git checkout -- schema.prisma`. It
copies the schema to a temp file before appending the reference model, restores from that copy, and
verifies the restore with `cmp` — keeping the backup and naming its path if the restore ever fails.
It also refuses to start if `src/modules/reference` or `test/reference.e2e-spec.ts` already exists,
since cleanup deletes both unconditionally. TECH_DEBT #52 closed.

**Why.** `git checkout --` restores the _committed_ file, so running the verifier while a migration
was in progress silently discarded the uncommitted schema work — it did exactly that once during
ADR-0053 M1. CI never saw it because CI's tree is always committed, which is precisely what makes
this class of bug survive: the environment that would catch it is the one environment where it
cannot happen.

**Consequence.** The script is now safe on a dirty tree, which also makes it _useful_ on one —
checking that the template still compiles against an in-progress model is exactly when you want to
run it, and the old behaviour punished you for trying. Deliberately **not** taken: the alternative
of refusing to run while the schema is dirty. It would have prevented the data loss, but by
removing the capability rather than fixing it.

---

### 2026-07-27 — The Prisma datamodel stops describing indexes it cannot describe

**Decision.** `Activity` drops its `@@index([parentId])`. The database's index on that column has
always been the **partial** `idx_activities_parent_id … WHERE deleted_at IS NULL AND parent_id IS
NOT NULL`, created in raw SQL by the ADR-0038 migration. Prisma has no syntax for a partial index,
so the model-level declaration was never describing that object — it was declaring a **second,
full** index that no migration builds and no query needs. It is now documented in the model's
comment block only, which is what the later partial-index siblings (`resources.parent_id`,
`calendars.project_id`) already do. No runtime effect: the database is unchanged, and the index the
queries use was always the migrated one.

**Why now.** The drift was cosmetic in isolation but it cost us a gate. `prisma migrate diff
--exit-code` was non-zero on `main`, so the one command that can tell you "the datamodel and the
migrations have parted company" could not be trusted to mean anything. With the false positive gone
the check is wired into CI (`prisma:check-drift`, in the `e2e` job — it already has a freshly
migrated Postgres, so the check costs one command and no new service). TECH_DEBT #54 closed.

**Consequence.** Editing a model without writing the matching migration now fails CI instead of
surfacing as a surprise `prisma migrate dev` on the next contributor's machine. The check is blind
to everything Prisma cannot express — partial indexes and uniques, CHECK constraints, GiST EXCLUDE
constraints — which this repo uses heavily and by convention keeps in raw SQL. Those objects are
absent from **both** sides of the diff, so the gate neither validates nor trips on them; they stay
governed by review and the documenting model comments. The gate covers columns, types, tables,
relations and full indexes, which is where silent drift actually happens.

---

### 2026-07-27 — Toolbar labels are a policy, not a side-effect of priority

**Decision.** `ToolbarItem` gains `showLabel?: 'always' | 'auto' | 'never'` (default `'auto'`), and
the `Toolbar` primitive's render path reads **only** that — never `tier` (TECH_DEBT #61, now
closed). `tier` goes back to answering exactly one question: what demotes into `⋯` first.

`'auto'` is the behavioural half: the row labels its auto items only when it measurably has room,
recomputed from the container width on every resize. The measurement is deliberately taken **off
the layout tree** — a canvas `measureText`, memoised per font+string — because the obvious
implementation (render labels, measure, retract if they don't fit) is a feedback loop that a
`ResizeObserver` turns into a per-frame flip-flop. Costing labels against the container's width,
which does not change with what we render inside it, removes the cycle rather than damping it. A
32px promotion margin absorbs the estimate's error and stops labels toggling as a user drags a
window edge; where no 2D context exists the row stays icon-only, which is the pre-existing
behaviour. Promotion is all-or-nothing per row: a partially-labelled group reads as inconsistency
rather than as a response to width, and the M0 measurement found the rows sit decisively on one
side or the other (~0.1px of slack at 1280px, 760–1000px at 1680–1920px).

**Consequences.** Two registries now declare their intent explicitly: the TSLD bar's four primary
buttons (Early/Visual mode, Add, Recalculate) and every item in the floating selection-actions bar
pin `'always'`, since their names are the affordance. Everything else is `'auto'` and gains a label
on wide monitors that it never had before — the ~1000px of Row-2 slack at 1920px that M0 measured
and nothing consumed. `selection-actions.tsx`'s own comment used to gloss `tier: 1` as "(visible
labels)", which is the conflation stated out loud; it now says which property does which job.

**Decision.** M7 (tsld-toolbar-canvas-refinements, ADR-0056) ran the deferred specialist review
pass (ux/accessibility/component/performance) over the M2–M5 diff and folded its two blocking
findings before flipping the flag: (1) the M3 day/month gridline tokens measured ~1.1:1 contrast
against each other across all three themes — imperceptible, failing WCAG 1.4.1 — fixed by widening
the lightness/alpha separation (not introducing hue, so colour-blind reading is unaffected) rather
than a line-weight change, which would have inverted the day→month→year crispness/weight
hierarchy; (2) the M2 zoom ceiling (`MAX_PX_PER_DAY` 60 → 200) was reachable via wheel/pinch/button
zoom even with the flag off, contradicting the documented byte-for-byte parity contract — fixed by
threading the ceiling through every zoom-scale clamp (`clampPxPerDay`/`zoomAt`/`fitToContent`/
`stepZoom`/`zoomToPreset`) as a **required** parameter (mirroring the existing `presetOf`/
`isAtPreset` `width` pattern), with a new `LEGACY_MAX_PX_PER_DAY = 60` constant preserving the
pre-epic ceiling for the flag-off path. `VITE_CANVAS_TIME_AXIS` then flipped default-on and
ADR-0056 moved to Accepted.

**Consequences.** The flag-off rollback (`VITE_CANVAS_TIME_AXIS=false`) stays byte-for-byte the
pre-epic surface — confirmed by the full unit suite plus the existing counting-stub budget tests.
Two pre-existing test suites (`tsld-toolbar.test.tsx`'s flag-off registry, which now explicitly
pins `CANVAS_TIME_AXIS_ENABLED: false`; `TsldCanvas.test.tsx`/`TsldPanel.test.tsx`'s zoom-handle
round-trips) needed a realistic mocked container width, since jsdom's all-zero
`getBoundingClientRect` had let every range-anchored preset collapse to the same clamped scale — a
latent test-environment gap the default-on flip surfaced, not a product regression.

---

### 2026-07-27 — Header three-column grid: centred while it fits, filling when it does not

**Decision.** `HeaderContents` (feature-spec.md §4.9, tsld-toolbar-canvas-refinements M6, ADR-0056)
became a `grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]` grid instead of a flex row with
`flex-1`/`ml-auto`, so the org switcher + nav sit at the true midpoint between the brand and the
account chip rather than merely absorbing whatever space the edges leave. The contract: **centred
while it fits, filling when it does not** — `min-w-0` on every cell plus the nav's own
`overflow-x-auto` means a long org name or a crowded nav scrolls internally rather than pushing the
account chip off-screen or breaking the grid layout. The org switcher itself gained a
`max-w-[12rem]` + `truncate` cap (a new optional `className` prop) so an unusually long
organisation name shifts the centre point by a bounded amount rather than an unbounded one.

DOM order (drawer → brand → org switcher → nav → account) is unchanged from the previous flex
markup — no `order-*`, no absolute positioning — so the pinned tab order (`e2e-designed-chrome`'s
tab-order journey) holds by construction; both `AppHeader` (flag-off shell) and `AppHeaderRow`
(the `VITE_DESIGNED_CHROME` band row) render the identical inner grid, with only their own
height/measure-cap wrapper classes differing. Verified visually at 1280/1440/1920px, with and
without the drawer button, and with a deliberately long org name, in both flag states of
`VITE_DESIGNED_CHROME`.

**Consequences.** Unflagged, independent of `VITE_CANVAS_TIME_AXIS` and every other milestone in
the epic. No behavioural change — same links, same roles, same tab order — only the layout
mechanism moved from flex-grow/margin-auto to a grid.

---

### 2026-07-20 — TSLD canvas nav (Stage B review): Isolate split-button + visible conflict chip

**Decision.** Folding the Stage-B specialist-review findings for the canvas-nav slice (spec
`docs/specs/canvas-nav/`, `VITE_CANVAS_NAV`, still default-off pending M4) settled two interaction
choices worth recording:

- **Isolate is a toggle-with-mode split button, not a plain menu-button.** The main button carries
  `aria-pressed` and directly **starts/exits** isolation (off → the current/last mode; pressed → exit);
  a separate chevron opens the Full / Driving / Stop menu (ArrowDown/Up on the main button is the
  keyboard equivalent). This deviates deliberately from the sibling menu-buttons (Colour-by omits
  `aria-pressed`) so a pressed button exits rather than re-opening the menu — the comment on
  `IsolateControl` pins the intent so a later refactor doesn't "align" it away.
- **Next-conflict surfaces a VISIBLE `role="status"` chip** ("Conflict 2 of 5 · constraint conflict")
  beside the button, since 4 of the 5 flag types have no on-canvas badge; the polite full announcement is
  kept. The chip is a **presentational** registry item (never a roving stop, self-hides unless a conflict
  is being cycled), and Next-conflict has **no** Visual-mode gate — its flags occur in Early mode too.

**Why.** Addresses the ux/a11y review (dead-end pressed toggle; reason invisible to sighted planners)
without a new architectural boundary. **Consequences.** Frontend-only; the CPM engine + recalc parity
gate are untouched, and flag-off stays byte-for-byte today's toolbar/canvas/a11y tree.

### 2026-07-19 — TSLD canvas insight lenses: client render state, not an ADR

**Decision.** The three canvas insight lenses (Filter/Colour-by/Baseline overlay, spec
`docs/specs/canvas-lenses/`) are **client render state layered on the existing canvas** (ADR-0026)
and the toolbar registry (ADR-0031) — no new architectural boundary — so they get this log entry
rather than an ADR. Two sub-decisions recorded here:

- **Colour-by taxonomy (v1).** Three modes — **Criticality** (default; byte-for-byte today's fills),
  **Total-float bucket** (`critical ≤0 / low 1–5 / medium 6–20 / high >20`, null → neutral), and **WBS
  group** (deterministic first-appearance id→palette cycle). Driving-resource colouring is deferred
  (needs `VITE_RESOURCES`); the colour machinery is mode-generic so it drops in additively. Every mode
  keeps the critical outline + a text Legend (never colour-only, WCAG 1.4.1), and pairs each band with a
  contrast-safe label ink (≥4.5:1 both themes) via `TsldScene.barInk`.

- **Scene lens-layer contract.** The lenses extend `TsldScene` with **optional, default-absent**
  fields — `dimmedIds` / `barFill` / `barInk` / `baselineGhosts` — so the flag-off / no-lens-active paint
  is byte-for-byte identical (proven by the paint-parity test). Ghost geometry reuses the shipped
  `useBaselineVariance` rows (no new fetch) and is culled by `visibleIds` like the live-bar layer. Lens
  fills + the Legend re-resolve on a theme switch via a shared `useThemeVersion` hook.

**Why.** Reuses shipped data + the established toolbar/scene seams; keeps the CPM engine and its recalc
parity gate untouched. **Consequences.** Behind `VITE_CANVAS_LENSES` (on by default 2026-07-19);
`=false` restores the placeholders + today's paint. Driving-resource is a tracked fast-follow.

### 2026-07-19 — Auto-deploy via an opt-in, host-side Watchtower pull (ADR-0047)

**Decision.** Close the "shipped but not live" gap (TECH_DEBT #29) with an **opt-in**
[Watchtower](https://containrrr.dev/watchtower/) service shipped **dormant** in
`docker-compose.release.yml` behind a compose `autodeploy` profile. It polls GHCR and
pulls + recreates **only the label-enabled** `web`/`api` containers (never `db` or itself)
on a moved `:latest`, reusing the host's `docker login ghcr.io` credentials via a mounted
read-only Docker config; the API self-migrates on recreate (ADR-0018), so the pull is the
whole deploy. `WATCHTOWER_MONITOR_ONLY` offers notify-without-update (a manual gate).

**Why.** The production topology is a self-hosted Dockge stack behind NPM + Cloudflare
tracking `:latest`; the host isn't publicly reachable and the images are private. A
host-side poll needs no inbound exposure and no CI-held host credentials — unlike a GHCR
webhook-receiver (custom endpoint on a non-public host) or a CI-side SSH deploy (long-lived
host creds as CI secrets), both rejected. Dormant/opt-in keeps auto-deploy a deliberate,
per-host operator choice (auto-deploy to prod is outward-facing).

**Consequences.** A release reaches an opted-in host within one poll interval; the manual
`pull && up -d` and monitor-only both remain available. Watchtower needs the Docker socket
(root-equivalent) — accepted, and the reason it is label-scoped and dormant. Rollback is
unchanged (pin the previous version tag). Full runbook in `docs/DEPLOYMENT.md` → "Automatic
redeploy (Watchtower, opt-in)".

---

### 2026-07-19 — Notes: polymorphic single table, `plan_id` on every note, fail-closed parent CHECK (ADR-0046)

**Decision.** Threaded notes are a **single polymorphic `notes` table** (ADR-0046), not
per-entity tables: a `NoteEntityType` discriminator (`PLAN`/`ACTIVITY`; `CLIENT`/`PROJECT`
reserved) + nullable typed parent FKs (`plan_id`, `activity_id`) + a raw-SQL CHECK
`ck_notes_exactly_one_parent` written as `CASE entity_type … ELSE false` so a future enum value
inserted before its CHECK branch **fails closed** (never silently unenforced). A **denormalised
`plan_id` on every note** (an activity note carries its activity's `plan_id`) doubles as the
PLAN-note parent pointer (the `Activity` precedent) **and** the cascade key, so the
`HierarchyLifecycleService` plan-cascade is one join-free `updateMany WHERE plan_id IN (…)` with
no double-count; restore rides the parent's `delete_batch_id` with **no endpoint guard** (a note
has exactly one parent — the `activity_steps` precedent, unlike a dependency's two endpoints).

**Why.** The locked requirement is "drop client/project in later with no rework" — a polymorphic
table extends via a nullable column + one CHECK branch + one cascade sweep, where per-entity
tables would fork the module/table/component/cascade per type. Typed FKs (not a bare
`entity_id`) keep real referential integrity.

**Consequences.** `plan_id` does double duty (parent + scope) — documented, not to be "fixed"
into two columns; it goes nullable via a safe expand-only ALTER only when a parent-less
client/project note lands. Body is plain text 1–5000 (`ck_notes_body_length` backstop). The CPM
engine is untouched (notes are non-scheduling; migration is byte-parity). Author-ownership on
edit/delete, `updated_by` on edit, optimistic-`version` 409, and copy-scope-from-parent are
**service-layer** invariants the DB cannot enforce (M2). Full ADR: `docs/adr/0046-polymorphic-entity-notes.md`.

### 2026-07-17 — L1 resource-levelling schema: `leveling_priority` is nullable (NULL = unset), not defaulted

**Decision.** The client-settable levelling tie-break `activities.leveling_priority` (ADR-0041 §1,
lower = higher priority) is stored **`INT?` — NULLABLE with NO default**, where **NULL = unset** (the
planner has expressed no priority preference). The engine defines NULL ordering: **NULL sorts last /
neutral**, after every explicit integer (documented as ADR-0035 §28). The engine-owned leveled overlay
follows the established engine-column precedents: `leveled_start`/`leveled_finish` are `DATE?` mirroring
`early_start`/`early_finish`; `leveling_delay_minutes` is `INT?` (NULL = "not yet levelled") mirroring the
nullable engine ints `total_float`/`free_float`/`visual_drift_days`; `leveling_window_exceeded` and
`self_over_allocated` are `BOOLEAN NOT NULL DEFAULT false` mirroring `constraint_violated`/
`resource_driver_missing`. `resources.max_units_per_hour` is `DECIMAL(18,4)?` with **NULL = uncapped**
and a nullable-safe `>= 0` CHECK (N21). The two plan flags are `BOOLEAN NOT NULL DEFAULT false`.

**Why.** A `DEFAULT` on `leveling_priority` was deliberately rejected: since lower = higher, a `DEFAULT 0`
would silently make every existing activity **top priority**, and any other constant is an arbitrary
sentinel — either way conflating "no preference" with a real priority value. Nullable-no-default is the
optional-Planner-input precedent already set by `expected_finish`/`visual_start` (vs the always-present
`lane_index`/`schedule_as_late_as_possible` zero/false defaults), keeps the add metadata-only (no backfill),
and lets the engine own NULL ordering in one documented place. NULL `max_units_per_hour` = uncapped is the
parity-preserving default (an uncapped resource is never over-allocated, so the levelling pass has nothing
to resolve and the default recalc stays byte-identical); a `DEFAULT 0` would mean "zero capacity" and
silently over-allocate every existing resource. No plan-level count columns were added: the over-allocation
counts are computed in the schedule summary at read time, exactly like `constraintViolationCount`.

**Consequences.** L1 is fully additive and dark — nothing reads the new columns until the L2 engine pass
lands, and the migration replays clean (verified: `migrate deploy` + an empty schema diff apart from the
pre-existing `parent_id` partial-index declaration drift, and the N21 CHECK rejects a negative
`max_units_per_hour` while accepting NULL and 0). ADR-0035 gains a §28 (levelling semantics, incl. the
NULL-priority ordering) + N21, Accepted with the L3 conformance rung. `@repo/types`/DTOs (L1 later task)
must keep `leveling_priority` nullable and omit the engine-owned leveled columns from write DTOs.

### 2026-07-16 — M4-F8 duplicate-relationship policy: reject per-(pair, type), not per-pair

**Decision.** The "duplicate relationship is rejected" contract (ADR-0035 §13, N04) is scoped to an
**exact duplicate — the same ordered predecessor→successor pair _and_ the same relationship type**,
enforced by the write-path partial-unique index `uq_dependencies_pred_succ_type`. A **different-type**
relationship between the same pair (an FS **and** an SS) is **permitted**. A second FS on an existing
A→B FS is rejected `409 DUPLICATE_DEPENDENCY`; an SS on that pair is allowed (`201`).

**Why.** The fixture's N04 wording ("only one relationship per pair") was a simplification. P6 permits
one relationship of **each of the four types** between a pair, and the FS+SS **ladder**/overlap is a
standard construction technique (start B a bit after A starts, finish B a bit after A finishes) we
deliberately keep. N04's actual intent — never silently dedupe, always reject a _true_ duplicate — is
fully satisfied by per-(pair, type) uniqueness, so no destructive per-pair migration is warranted.

**Consequences.** ADR-0035 §13 gains an M4-F8 amendment paragraph; the CAPABILITY_MATRIX N04 and
section-1 topology rows flip to ✅. The behaviour already shipped with the dependency write-path — the
existing `test/dependencies.e2e-spec.ts` case (dup FS → 409, SS on the same pair → 201) is the
regression guard; the conformance N04 case points to it rather than duplicating the assertion.

### 2026-07-16 — M2 recalc modes: finish-side float + Actual-Dates = max(data date, actual start)

**Decision.** Two semantics for M2 progress ingestion (ADR-0035 §1):

1. **Total float is measured on the finish side** — `workingTimeBetween(earlyFinish, lateFinish)` on
   the activity's own calendar, replacing the previous start-side `lateStart − earlyStart`. For an
   **unprogressed** activity the two spans are equal (byte-identical goldens), but for a **progressed**
   activity the early-start-to-early-finish span is the _remaining_ work, so only the finish side
   reports float on the work that's left.
2. **Actual Dates mode** schedules an in-progress activity's remaining from **`max(data date, actual
start)`** (dropping all predecessor logic). Because N07 forbids an actual after the data date, the
   actual start is always ≤ the data date, so Actual Dates **coincides with Progress Override for the
   fixture's past-dated actuals** (S04 differs from S01 but equals S03 here). The two modes diverge
   only for a future actual start — an engine-level case the boundary rejects.

**Why.** Finish-side float is the P6 meaning for progressed work and is provably parity-preserving for
the planned case. Scheduling remaining from the actual start (rather than into the past) is the only
physically-sensible "actuals never move" reading; there is **no external oracle** (ADR-0034), so this is
SchedulePoint's documented golden and may be revised if a specific P6 behaviour is later required.

**Consequences.** S02/S03/S04 are runnable conformance differentials; S03 ≠ S02 is the definitive
retained-vs-override discriminator. Suspend/resume (ADR-0035 §4) is the one M2 clause still open.

### 2026-07-16 — M5 per-activity calendars: float on the activity's own calendar; activity → plan → 24/7 resolution

**Decision.** With per-activity calendars (ADR-0037), two semantics are locked:

1. **Total float** is measured on the **activity's own** calendar
   (`activityCalendar.workingTimeBetween(earlyStart, lateStart)`), not the plan calendar — matching
   P6 / ADR-0035. It is identical to today when an activity inherits the plan calendar, and changes
   the meaning of the day-denominated `total_float` column only for **mixed-calendar** plans.
2. **Calendar resolution order** is `activity.calendarId → plan.calendarId → null (all-days-work)`.
   A null activity calendar inherits the plan default; a null plan calendar is 24/7.

**Why.** Float in the activity's own working time is what a planner on that crew's calendar expects
("3 days of slack" = 3 of _their_ working days). Inheritance keeps the common case zero-config and the
all-inherit path byte-identical (the golden-suite parity gate). Both are the least-surprising choices
and match the P6 model the conformance fixture benchmarks against.

**Consequences.** The engine moved to an absolute-instant axis (ADR-0037) so the two calendars can
coexist. S05 (successor-calendar lag) became a runnable conformance differential; the per-relationship
lag-calendar capability row is now ✅. Resource calendars / LOE / WBS-summary remain separate M5-epic
rungs. Window-only calendars (turnaround/crane-hire) are honoured per-activity only once in-window
placement lands (an M5-epic edge case) — the conformance adapter keeps those on the plan calendar and
notes it, never silently mis-scheduling.

### 2026-07-15 — M3 lag-calendar scope: only the 24-Hour half is a differential (setting-sensitive → M5)

**Decision.** M3 (per-relationship lag calendars, ADR-0036 §6) realises **only the 24-Hour
(elapsed) lag calendar** as a runnable conformance differential. The fixture's
`lag_calendar_setting_sensitive` case (scenario S05, Predecessor-vs-Successor) is **re-scoped to
M5**, correcting the M3 acceptance in the implementation plan.

**Why.** S05 needs the predecessor and successor to schedule on **different** calendars for the
lag-calendar setting to change any date — i.e. per-**activity** calendars, which ADR-0024
deferred to M5. In M3 all activities schedule on the single plan calendar, so `PREDECESSOR`,
`SUCCESSOR` and `PROJECT_DEFAULT` all resolve to the same calendar; only `TWENTY_FOUR_HOUR`
(elapsed time) is behaviourally distinct. Claiming S05 in M3 would be a false differential (its
output can't differ from S01). The product owner approved landing all four enum options now
(Pred/Succ forward-wired, honest microcopy) with only 24-Hour asserted.

**Consequences.** The capability-matrix "Per-relationship lag calendar" row is **🟡** (24-Hour ✓,
setting-sensitive → M5); scenario **S06** is a runnable differential (`resultsDiffer(S06, S01)`),
**S05** stays `todo` → M5. The lag DTO/enum surface is complete now, so M5 adds no new API
surface — it only makes Pred/Succ resolve to distinct per-activity calendars. Engine detail: the
lag `applyLag` anchor→instant conversion is START/FINISH-aware (ADR-0023) so the forward/backward
walks invert across a non-working gap (no spurious negative float); undefined lag calendar stays
the literal `anchor + lag` fast path, so the golden suite is byte-identical.

### 2026-07-13 — On-canvas TSLD activity labels (extension within ADR-0026 D1)

**Decision.** The TSLD canvas now draws each activity's label (`{code} {name} · {n}d`) directly
on the diagram (spec `docs/specs/tsld-activity-labels.md`), realising the on-canvas text ADR-0026
D1 named-and-budgeted ("text is the dominant cost, and is budgeted") and deferred. It is an
**extension within ADR-0026 — no new ADR** (ui-architect confirmed: it changes no
coordinate/viewport/state/interaction/a11y decision, adds no dependency or data model, and the
DOM-overlay alternative is the very option ADR-0026 rejected). Key choices:

- **Canvas `fillText`, not a DOM overlay.** Activity labels have independent x's, move on both
  axes, and are far more numerous than the ruler's pooled labels (whose one-`translateX`/frame
  trick doesn't generalise) — canvas text folds into the single O(visible) base-layer repaint.
- **One shared identity builder.** `activityLabel(a)` (`code name`) in `render/a11y.ts` feeds
  `describeActivity`, `chainNeighbour`, **and** the bar label (`activityBarLabel` = identity +
  ` · Nd`), so the visible label and the accessible name never disagree on _which_ activity a bar
  is (WCAG 2.5.3). Duration is supplementary visual detail; the identity stays the shared prefix.
- **Adaptive placement, culled + LOD-gated.** Inside a wide-enough bar (truncated + ellipsised to
  fit — no clip needed), beside a short bar/milestone when the same-lane neighbour leaves room,
  else suppressed; hidden below `LABEL_MIN_PX_PER_DAY`. The visible set is bucketed by lane and
  x-sorted **once per frame** (O(v log v)) for the beside-neighbour x — never a per-label scan.
- **Contrast by paired tokens.** Inside text uses each fill's `*-foreground` token
  (`--color-primary/destructive/warning-foreground`); beside text uses `--color-foreground`. A
  new `render/measure.ts` memoises `measureText` widths (font-stable, keyed by text) so a label
  measures at most once ever.

**Consequences.** A sixth **"Labels"** view toggle (default on) joins the five existing ones; the
render model gains a pre-built `label: string` at the `to-render-model.ts` seam (stays enum-free).
The four label text tokens are recorded in `docs/DESIGN_SYSTEM.md`. Perf re-verified honestly on
the ADR-0026 real-Chromium spike **after correcting its label path** (the harness had drawn a bare
`fillText` on 2–6-char labels — it never exercised truncation, the width cache, or lane placement;
it now measures realistic `{code} {name} · {n}d` labels through the same code the painter runs):
**p95 9.4ms draw at 2,000 activities** (median 6ms), versus a **3.6ms** labels-off baseline in the
same harness — comfortably inside the ADR-0026 60fps CPU draw budget (≤16ms) with ~40% headroom.
(The earlier "3.9ms" figure was the labels-off draw mislabelled as with-labels; it is corrected
here.) The painter also computes each visible activity's screen rect **once per frame** (shared by
the bar/label/selection layers) to keep that headroom. No backend, schema, or auth change.
Single-locale LTR text is a documented v1 limitation (the shared builder is the future bidi/locale
seam).

### 2026-07-12 — Navigator in-tree CRUD: `Menu` primitive + shell-layer coordinator seam (ADR-0029 Phase 2)

**Decision.** In-tree create/rename/delete for the Project Explorer (ADR-0029's
named Phase 2, spec `docs/specs/navigator-in-tree-crud.md`) is built as an
**extension within ADR-0029 — no new ADR** — introducing two reusable pieces:
(1) a hand-rolled **`Menu`/`MenuItem`** design-system primitive
(`apps/web/src/components/ui/menu.tsx`) implementing the WAI-ARIA APG "Menu Button"
pattern on semantic HTML (portal-rendered, roving focus, Esc/click-away/Tab
dismissal, focus-return to the trigger) — **no new npm dependency**, mirroring the
`Dialog` focus conventions; and (2) a **`NavigatorCrud` coordinator** in the
composition layer (`apps/web/src/components/layout/navigator/`) that owns the
create/rename/delete dialogs and mutations. The shared tree emits CRUD **intents**
through a feature-local `NavigatorCrudContext` seam, so `features/navigator` never
imports a sibling feature (the coordinator is the single place that imports
clients/projects/plans) — honouring "features → shared, never sideways".

**Why.** The read-only navigator (Phase 1) forced writers out to a management page
and back to shape the hierarchy — the exact context-loss the navigator exists to
remove. ADR-0029 pre-designed the RBAC seam and explicitly named context-menu CRUD,
and this adds **no endpoint, data-model, or cross-cutting-standard change** (it
reuses the existing endpoints, form dialogs, `ConfirmDialog` cascade copy, mutation
hooks, optimistic locking, and soft-delete/Recently-Deleted flow), so it does not
clear the ADR bar. The only genuinely new artifact is the `Menu` primitive, hence
this log entry + its addition to the component inventory.

**Consequences.** Expansion state was **lifted to the shell** (shared by both rails
and the coordinator) so a freshly-created child can be revealed via `expandPath`;
selection remains a pure projection of the URL (ADR-0029), so a new **plan**
navigates (deep-link reveal selects it) while new **folders** are revealed by
expansion, not force-selected. Ships behind `VITE_NAV_TREE_CRUD` (off by default)
and additionally gated by write RBAC. Playwright journeys + the default-on flip
land as a separate, clearly-scoped follow-up once every a11y/journey gate is green.

### 2026-07-10 — Activity dependencies: `dependency:*` permission set + link cascade behaviour

**Decision.** For the M4 dependencies slice (ADR-0021, spec
`docs/specs/activity-dependencies.md`): (1) authorise logic edits with a **new
`dependency:*` permission namespace** — `dependency:read` granted to every member
(alongside the other `*:read`), `dependency:create/update/delete` to **Planner +
Org Admin only** (the same "hierarchy write" rule; deliberately **not**
Contributor). (2) When an activity (or an ancestor plan/project/client) is
soft-deleted, its **incident/contained dependencies are soft-deleted in the same
`delete_batch_id`** and reactivated on restore — but restore is **endpoint-guarded**:
a link is only reactivated when **both** its endpoints are active, so a link whose
other end was separately deleted stays soft-deleted (a bounded, documented edge
case). A directly-deleted dependency gets its own fresh batch and has **no
standalone restore endpoint** in this slice.

**Why.** A distinct `dependency:*` set keeps authorisation and audit legible
("who may edit the network" is separate from "who may edit an activity") and is
future-guest-friendly, at the cost of four extra permission codes — cheap. Folding
links into the existing cascade batch keeps delete/restore symmetric with the rest
of the hierarchy (one batch id, one transaction) rather than inventing a second
mechanism; the endpoint-guard prevents a restore from resurrecting a link to an
activity that no longer exists.

**Consequences.** `HIERARCHY_READ`/`HIERARCHY_WRITE` in
`apps/api/src/common/auth/org-permissions.ts` carry the new codes (unit-tested:
Contributor gets `dependency:read` only). The shared `HierarchyLifecycleService`
gains a `dependency` leaf and link-aware cascade/restore (A3) — touching
already-shipped M3 code, so it ships with full M3 regression coverage. These two
choices are recorded here rather than as ADRs (the DAG invariant, which _is_
cross-cutting, is ADR-0021); promote them if a reviewer judges them broadly
load-bearing.

### 2026-07-10 — Activity progress: dedicated endpoint, derived status, paired-constraint invariant

**Decision.** An activity's **progress** (percent complete + actual start/finish)
is reported through a dedicated `PATCH .../activities/:id/progress` endpoint that
requires only `activity:update_progress` (Contributor upward), separate from the
Planner-only `activity:update` that changes logic/definition. `status`
(`NOT_STARTED/IN_PROGRESS/COMPLETE`) is **not** client-settable — it is derived
server-side: a finish date (or 100%) → COMPLETE, a start date (or any %) →
IN_PROGRESS, else NOT_STARTED. Actual dates may be cleared with `null`; an actual
finish requires an actual start and cannot precede it (422). The definition
endpoints never accept progress or CPM-output fields, and this endpoint never
accepts definition fields.

**Why.** The brief's role model gives a **Contributor** the ability to record
progress without editing the schedule's logic — this endpoint + permission is the
first concrete realisation of that split (the first capability separating
Contributor from Viewer). Deriving `status` from the measurable numbers makes a
contradictory state (e.g. `COMPLETE` at 20%) unrepresentable, so clients send one
signal (%/dates) rather than two that can disagree. Using the actual-start signal —
not only the percentage — lets an activity be _in progress at 0%_ (started, no
measurable work yet), which construction planning needs.

**Consequences.** `UpdateActivityProgressDto` carries only `percentComplete`,
`actualStart`, `actualFinish`, `version`. The constraint type/date pairing is
enforced on key-presence in the service **and** by a DB `CHECK`
(`ck_activities_constraint_pair`) as defence-in-depth. The web progress editor
(C2) gates on `activity:update_progress` and shows the derived status read-only.

### 2026-07-10 — Recycle bin: one org-scoped `/deleted` endpoint over a keyset-merged union

**Decision.** Surface the hierarchy's soft-deleted rows through a single
org-scoped endpoint, `GET /organizations/:orgSlug/deleted`, that returns
clients, projects and plans together as a discriminated `DeletedHierarchyItem`
list (`kind`, `id`, `name`, `deletedAt`, `canRestore`), newest-deleted first and
cursor-paginated. It lists **every** soft-deleted row (not just batch roots) and
marks `canRestore = false` when an ancestor is still deleted, so the UI can show
the whole removed subtree and steer the user to restore the parent first
(surfacing the top-down `PARENT_DELETED` invariant without a failed request).
Reading it needs `client:read` (any member, consistent with the active-list
reads); restore keeps its existing per-entity, writer-only endpoints
(`POST .../{id}/restore`). Pagination is keyset over the union: each table is
queried for its own top `limit + 1` by `(deletedAt desc, id asc)` and the
service merge-sorts and slices; the id tiebreaker gives a total order across the
three tables (uuids are globally unique) and keeps a single cascade batch — which
shares one `deletedAt` — deterministically ordered and safe to page.

> **Amended 2026-08-18 (ADR-0096).** Two things above are no longer the shape. Each item now also
> carries `deleteBatchId` and `blockedBy`, and `meta` carries `retentionDays`/`retentionActive`; see
> `docs/API.md`, which is where this endpoint is documented rather than here. And the steering has
> **inverted**: the response still lists every soft-deleted row, but the client groups them by
> `deleteBatchId` and shows one row per deletion, because "restore the parent first" describes work
> the product already does — a cascade restore is keyed on that batch. The only case that still
> needs the message is a blocker in a _different_ batch, which is why `blockedBy` carries its own
> batch id rather than only a name.

**Why.** The "recently deleted" screen is one unified, deletion-time-ordered view
with a per-row restore action; a combined endpoint serves it in one request and
centralises the parent-active (`canRestore`) computation server-side, rather than
making the client fan out to three per-entity `?deleted=true` lists and merge
three cursors. Reusing the existing per-entity restore endpoints avoids a second
way to restore. This resolves the deleted-list shape deferred in the hierarchy
plan (`docs/plans/hierarchy-crud.md`, Task E3 / risk row).

**Consequences.** The `order` query param is accepted but ignored (the list is
inherently newest-first) — the same repo-wide pattern already tracked as
[TECH_DEBT.md](TECH_DEBT.md) #19, now showing up in a new place rather than a
one-off exception. The endpoint over-fetches up to `3 × (limit + 1)` rows per
page — fine for the bounded recycle-bin set; if it ever grows hot, a raw
`UNION ALL` keyset query is the next step (TECH_DEBT.md #22). No new ADR: it
composes existing patterns (org scope resolver, `{ data, meta }` envelope,
soft-delete, RBAC) without changing a cross-cutting standard.

---

### 2026-07-09 — Hierarchy: denormalised org id + cascade soft-delete via a batch id

**Decision.** For the Client → Project → Plan hierarchy (and every descendant
table that follows it): (1) **denormalise `organization_id`** onto Project and
Plan — copied from the parent inside the create transaction, never from client
input — in addition to the parent FK; (2) implement delete as a **cascade soft
delete stamped with a shared `delete_batch_id`**, done in the service layer
inside one transaction (parent FKs stay `ON DELETE RESTRICT`), so restoring a
row restores exactly the batch it was deleted with. Restore is **top-down**:
a row can only be restored while its parent is active (`PARENT_DELETED`
otherwise). Both mechanics live in one shared `HierarchyLifecycleService`.

**Why.** Denormalised org id makes every scope/IDOR check and org-scoped query a
single indexed-column filter with no 2–3 table join (the invariant "a child's
org equals its parent's" is enforced in code). A batch id gives symmetric,
one-click cascade restore that matches the brief's soft-delete/restore-for-
planners intent and 90-day retention, without a DB cascade that would hard-delete.

**Consequences.** Recorded in [DATABASE.md](DATABASE.md) (schema, indexes) and
carried by ADR-0008/0012/0016 unchanged (no new ADR). If a second consumer
copies the cascade helper (e.g. the Activities slice), promote both conventions
to a short ADR then. The partial `delete_batch_id` indexes and the shared helper
are the enforcement points.

---

### 2026-07-09 — Web walking skeleton: code-based routing + a tsconfig-extends workaround

**Decision.** For the first web slice, define the TanStack Router route tree in
**code** (`createRoute`/`createRouter` in `apps/web/src/app/router.tsx`) rather
than the file-based route generator that `docs/FRONTEND_ARCHITECTURE.md` names as
the default. Separately, `apps/web/tsconfig.json` extends the shared preset via a
**direct relative path** (`../../packages/config/tsconfig/react.json`) instead of
the `@repo/config` package name.

**Why.** (1) The repo's `web` build is `tsc --noEmit && vite build`; the
file-based generator emits `routeTree.gen.ts` at dev/build time, which would need
to exist before the typecheck step — fragile in a clean CI checkout. Code-based
routing is first-class in TanStack Router, fully type-safe, and needs no codegen
step, keeping the build deterministic. (2) Vite's rolldown transform does not
resolve tsconfig `extends` through pnpm's `node_modules` symlink, so the preset's
own relative `extends` chain mis-resolved; a direct relative path resolves on real
paths for both `tsc` and the bundler.

**Consequences.** Routes are registered centrally; screen components live in
`routes/` and are wired in `app/router.tsx`. Migrating to file-based routing later
is mechanical (move each route object into a file) and can be revisited if the
route count grows. The tsconfig deviation is localised to `apps/web` and
documented inline.

---

### 2026-07-09 — Generalise the repository into a domain-neutral base ("Blank App")

**Decision.** Repurpose this repository from the Bills product into **Blank App**,
a reusable, domain-neutral starter to base future applications on. Renamed the
workspace (`bills` → `blank-app`) and the package scope (`@bills/*` → `@repo/*`),
generalised the resource-scoping model from "household" to "organisation", and
replaced product-specific docs (README, ROADMAP, BACKLOG, worked example) and
guidance with neutral equivalents. Domain assumptions (e.g. money-as-minor-units)
are now framed as **conditional** guidance rather than baked-in rules.

**Why.** The same production-grade foundation — tooling, CI/CD, containers,
architecture, standards, delivery process, agents, and the canonical feature
template — is valuable across many applications, not just one product. A clean
base avoids re-inventing it per project and keeps the quality bar consistent.

**Consequences.** No application/domain code exists; the schema has no models.
Starting a real app means replacing the product-facing docs and building the
first feature from the reference template (`docs/REFERENCE_FEATURE.md`). The
`@repo/*` scope is a convention teams may rename per fork.

---

### 2026-07-09 — Establish a formal delivery process for features

**Decision.** Introduce [`docs/PROCESS.md`](PROCESS.md): every new requirement
goes through business understanding → functional requirements → technical
analysis → solution design → implementation planning, is approved, and only then
implemented. Added feature-spec / implementation-plan templates, a worked
example, a Definition of Ready/Done (Feature Completion Criteria), and a
`feature-analyst` agent; wired the criteria into the PR template and CLAUDE.md.

**Why.** Prevent idea→code shortcuts; ensure every feature is understood,
designed, reviewed, and shipped to the same bar; make the method repeatable and
discoverable for humans and AI assistants.

**Consequences.** Slightly more up-front work per feature, repaid in fewer
reworks and clearer history. The process itself is versioned and evolves via
normal doc updates (and an ADR if it changes architecturally).

---

### 2026-07-08 — Adopt the requested stack for the foundation

**Decision.** Build the repository foundation around Turborepo + pnpm, React +
Vite (Tailwind v4 / shadcn/ui / Lucide), NestJS, PostgreSQL + Prisma, REST +
OpenAPI, Better Auth, Vitest/Supertest/Playwright, Docker + GHCR, GitHub
Actions, and SemVer via Conventional Commits + Changesets.

**Why.** A cohesive, TypeScript-end-to-end stack with strong typing, mature
tooling, and good local/CI ergonomics; matches the product's needs and the
team's direction.

**Consequences.** Established the monorepo layout, shared config/types packages,
and all tooling. Recorded the weightier choices as ADR-0002 (monorepo) and
ADR-0003 (auth).

---

### 2026-07-08 — Money stored as integer minor units

**Decision.** Represent monetary amounts as integers in minor units (e.g.
pence) with an explicit currency code; never floating point.

**Why.** Avoids binary floating-point rounding errors in sensitive data.

**Consequences.** DTOs, Prisma models, and UI formatting must follow this;
documented in [API.md](API.md) and [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

---

### 2026-07-08 — Defer hosting-platform choice

**Decision.** Keep deployment platform-neutral for now (container-first) and
decide the concrete host later.

**Why.** Insufficient information at the foundation stage; premature lock-in is
costly.

**Consequences.** Tracked in [TECH_DEBT.md](TECH_DEBT.md) and the
[roadmap](ROADMAP.md); `docker-publish` targets GHCR so any container platform
can consume the images.

---

### 2026-07-11 — TSLD editing gesture-routing policy (M2)

**Decision.** On-canvas editing uses **one explicit "Add activity" mode** plus
**hit-zone routing** for everything else inside the default Select mode: empty
canvas → pan (M1, unchanged), bar body → reposition, bar end grab-zone →
dependency-draw, click → select. Only create-by-drag genuinely competes with pan,
so only it gets a mode toggle.

**Why.** Smallest mode surface, zero regression to the M1 pan/zoom path, and
discoverable affordances — see `docs/archive/design/tsld-m2-editing.md` §1 and ADR-0026 D5.

**Consequences.** Hit classification is a pure `classifyHit` helper shared by paint
and pointer so they can't diverge; the gesture machine is a pure reducer. Revisit
if a fuller tool palette proves more discoverable.

### 2026-07-11 — Interim TSLD editing concurrency posture (M2)

**Decision.** Until a plan edit-lock exists, on-canvas editing ships **behind the
`VITE_TSLD_EDITING` flag (off by default)** and relies on **optimistic-locking
`version` 409s surfaced as a non-destructive conflict banner** — never a silent
overwrite.

**Why.** No edit-lock yet; the flag + version-409 banner is the safe interim path
(`docs/archive/design/tsld-m2-editing.md` §3; plan risk "Editing ships before the edit-lock").

**Consequences.** Editing is dark in the default build. The lock (or hardened
concurrency) is the prerequisite to enabling the flag; tracked on the TSLD roadmap.

### 2026-07-11 — Defer client-side link legality pre-check (M2 Slice 2.3)

**Decision.** On-canvas dependency-draw highlights **any** other activity as a drop
target during the rubber-band; it does **not** yet run a client-side cycle/duplicate
**pre-check** to ring only _legal_ targets (ADR-0026 D5's "live legality feedback").
Illegal drops are caught authoritatively by the API (cycle/duplicate → 409) and shown
in the non-destructive conflict banner.

**Why.** The graceful-degradation path (server rejects, banner explains) is correct and
already in place; a live client pre-check duplicates server reachability logic and adds
per-move cost. Deferred to keep Slice 2.3 focused; the ADR contract is otherwise met.

**Consequences.** A user can attempt an illegal link and learn it's illegal only on
drop. Tracked as a follow-up to add the client pre-check (reusing the canvas's existing
`RenderEdge[]`) so the ring reflects legality before release.

**Addendum (follow-up delivered).** The client pre-check now ships (`render/link-legality.ts`):
a pure `linkLegality(pred, succ, type, edges)` mirrors the server invariants (self / duplicate
per `(pred,succ,type)` / cycle via successor→predecessor reachability, ADR-0021). During a draw
the hovered target rings by legality — legal solid, illegal dashed in the critical colour (colour
AND dash, WCAG 1.4.1) — and an illegal drop is short-circuited locally (banner + live region, no
doomed POST). `RenderEdge` gained `type` for the duplicate check. The server stays authoritative;
the pre-check only pre-empts drops the loaded graph already proves illegal.

### 2026-07-11 — Driving-edge definition (TSLD M3)

**Decision.** A dependency edge is **driving** iff its forward timing bound equals its
successor's computed early start — i.e. it is (one of) the binding relationship(s) that
set the successor's start. Computed in the engine from the forward-pass maps as a pure
O(E) post-step (no change to the forward/backward passes), persisted per edge as the
engine-owned `dependencies.is_driving` (ADR-0022 batched write; never touches
`version`/`updated_at`), exposed as `DependencySummary.isDriving`.

**Why.** Matches the CPM/GPM "driver" the TSLD promises ("drivers at a glance") and is
derivable with no extra graph traversal. When a constraint clamps a successor's start
above every incoming bound, no edge matches → none drives (the constraint drives),
which is the correct read. Reading only the forward maps means the computed dates are
unchanged, so the golden CPM suite still holds (parity preserved).

**Consequences.** `is_driving` is recomputed on every recalculate and is false until the
first calculation (or for any edge carrying slack). No new ADR — this is a local,
reversible engine-output refinement within ADR-0022's contract; recorded here per the
plan's "short ADR/DECISIONS entry" for the engine change.

**Accessible representation.** The driving distinction is not colour-only on the canvas
(heavier-solid vs thin-dashed) and is carried in **text** in the keyboard-accessible logic
editor (a "Driving" column in the predecessors/successors table — the fuller conforming
alternative). Folding a per-activity driving summary into the canvas's parallel listbox
description (`describeActivity`, alongside the existing "critical" cue) is **deferred to M5**
(accessibility hardening) — a tracked deferral, not a silent gap (CLAUDE.md §13).

**Addendum (M3 close-out).** M3 and M4 shipped their engine/schema/DTO/canvas/endpoint/
packer during the CPM + M2-editing slices; a survey confirmed only one live-refresh gap
remained. `useRecalculate` now also invalidates `dependencyKeys.byPlan`, so the driving-arrow
styling re-pulls after a **reposition-in-time / create-activity** edit (which recalc but don't
otherwise touch the dependency cache — link mutations already invalidate it themselves). The
server always recomputed/persisted `is_driving` correctly; this was purely a client-cache
staleness fix. With it, TSLD **M3** (live critical path + driving arrows) and **M4** (layout
persistence + auto-pack) are complete.

### 2026-07-11 — Free-2D bar drag over dominant-axis lock (TSLD M4)

**Decision.** On the TSLD canvas a body drag moves a bar in **both axes at once** — dx → a
new start day (an **SNET** constraint, recalcs) and dy → a new `laneIndex` (layout only, no
recalc). On drop it commits as **one** optimistically-locked write reporting **only the axes
that changed**: a lane-only move is the minimal `{ laneIndex, version }` PATCH (no recalc); a
time move (± lane) is one `PATCH …/activities/:id` carrying the SNET constraint (and the lane),
followed by the existing recalc. This supersedes the earlier dominant-axis-lock proposal.

**Why.** The user chose direct 2D manipulation as the most literal "drag it where you want it"
model. The two-write concern that had motivated axis-lock **dissolves for a single activity**
(M4's scope — multi-select stays deferred): the single-activity endpoint already accepts the
SNET fields + `laneIndex` + `version` atomically, so there is no ordering/atomicity gap. Per-axis
rounding (`round(dy / LANE_HEIGHT)`, `round(dx → day columns)`) gives a half-cell dead-zone on
each axis, so a mostly-horizontal drag doesn't accidentally re-lane (and vice-versa) — the main
free-2D risk, mitigated without extra threshold machinery.

**Consequences.** No new ADR and no amendment to ADR-0026 (D5/D6 already decide lane persistence
without recalc). Reversible: re-introducing axis-lock would be a gesture-machine-only change. The
keyboard equivalent for the new lane axis (`Alt+↑/↓` in the parallel listbox) ships in the same
slice (WCAG 2.1.1); the in-canvas time nudge and full keymap remain M5 work. The **batch
positions** endpoint is reserved for auto-pack (4.3) and future multi-drag, **not** the single-bar
path.

### 2026-07-11 — Auto-pack lane batch: all-or-nothing concurrency posture (TSLD M4)

**Decision.** "Auto-arrange lanes" repacks the drawn activities into the fewest
non-overlapping-in-time lanes with a pure, deterministic greedy first-fit
(`render/auto-pack.ts`, sorted by `(startDay, endDay, id)`, inclusive-finish per ADR-0023)
and persists **only the minimal set of lane changes** through the batch positions endpoint,
which is **all-or-nothing with per-row optimistic locking**: a single stale `version` refuses
the whole write (409), surfaced via the non-destructive conflict banner with auto-arrange-
specific copy. The action is opt-in (toolbar button + confirm dialog; **no undo yet**), is
**not** optimistically previewed (a bulk reorder reconciles on refetch), and triggers **no
recalc** (lane is layout, ADR-0026 D6). Undated activities are excluded (no x-span to pack).

**Why / contrast with ADR-0022.** The _engine-owned_ CPM batched write bypasses optimistic
locking because the engine is authoritative over the columns it writes; this _user-authored_
layout batch **enforces** it because the planner's `version` is exactly what concurrency must
protect — two planners auto-arranging the same plan must not silently clobber each other.
All-or-nothing matches the mental model: the pack is one operation, and a partial pack could
leave overlapping bars.

**Consequences.** No new ADR (ADR-0026 D5/D6 already decide opt-in auto-pack + layout-without-
recalc). The packer is pure and exhaustively unit-tested and never persists. Undo, and a manual
multi-drag (the batch endpoint's other future consumer), remain follow-up work.

### 2026-07-11 — TSLD accessibility model & canonical keymap (M5)

**Decision.** The TSLD's parallel accessible surface is a single `sr-only` `role="listbox"` driven by
**`aria-activedescendant`** (not roving `tabindex`) over the `aria-hidden` canvas, with the **canvas
ring** as the visible focus and **focus-follows-viewport** panning the minimum distance to keep the
ring on-screen (WCAG 2.4.7 / 2.4.11). The canonical keymap, focused on that listbox and documented
in-app via a `?` shortcuts sheet: `↑/↓/Home/End` navigate; `[`/`]` jump driving-first to the
predecessor/successor (trace the driving path); `Space` announces logic-tie + driving detail
(Tier 2); `Enter` opens the logic editor (Tier 3); edit keys (behind `VITE_TSLD_EDITING`): `Alt+↑↓`
lane, `Alt+←→` SNET day nudge, `n` create. The per-keystroke announcement stays lean (name, dates,
lane, float, critical); driving/ties are on demand, never folded into every keystroke.

**Why.** With the listbox `sr-only` and the visible focus being the _canvas ring_ (not a DOM
outline), roving `tabindex`'s payoff (a native focus ring, simple `:focus` styling) is worthless,
while `aria-activedescendant` keeps **one tab stop** and **one source of truth** — `selectedId`
drives the active option _and_ the ring, so keyboard and visual focus cannot diverge. This refines
the _technique_ ADR-0026 D7 named loosely ("roving tabindex", positioned proxies); the _architecture_
D7 fixed (parallel DOM over an aria-hidden canvas, canvas ring, `useAnnounce`) is unchanged.

**Consequences.** No new ADR and no D7 reversal — a local, reversible ratification. Chain navigation
and the three-tier disclosure are pure reads (ship flag-off in 5.1); the edit keymap + the
coalesce-and-serialize nudge policy harden in 5.2. `accessibility-reviewer` leads the WCAG 2.2 AA
sign-off (plan §M5).

---

## Plan edit-lock — web "pen" layer (edit-lock M2, 2026-07-11)

**Context.** M1 shipped the server edit-lock (ADR-0028): the lease endpoints, the 423 `LockedError`
write-gate (inert behind `PLAN_EDIT_LOCK_ENFORCED`), and the peer hand-off model. M2 is its
front-end realisation — the `features/plan-lock/` "pen" that acquires/holds the lock and gates the
on-canvas schedule editing. Three front-end choices needed settling; all confirmed against the M1
staged-rollout discipline (design: `docs/archive/design/plan-edit-lock-web.md`).

**Decisions.**

- **The pen ships behind `VITE_PLAN_EDIT_LOCK` (default off)** — the mirror of the backend's
  `PLAN_EDIT_LOCK_ENFORCED`. Gating the already-shipped, flag-on activities table on `holdsPen` is a
  live behaviour change, so it must land inert. Rollout **ordering** (ADR-0028 §9): enable the FE
  flag first (users take the pen — harmless while the API still accepts non-holder writes), then flip
  enforcement. Off ⇒ `penManaged: false`: no polling, no heartbeat, no banner, `canEditSchedule ===
canWrite` — today's behaviour byte-for-byte.
- **Release-on-unload uses a keepalive `fetch` DELETE on `pagehide`**, not `navigator.sendBeacon`
  (which is POST-only, whereas release is a DELETE — using it would force a new POST-release alias
  into the M1 API). It fires only while holding; the 120 s TTL is the correctness backstop, so a
  missed beacon just costs the next Planner up to one TTL.
- **A 423 (`LOCKED`) is a lock-state event routed to `EditLockBanner`'s lost-control state**
  (invalidate the lock query → drop to read-only + distinct row-10 copy), kept separate from the 409
  `EditConflictBanner` ("changed elsewhere — refresh"). One surface per concern.

Capability flags (`canAcquire/canRequest/canTakeOver/canOverride`) are server-resolved — the client
renders per the flags and never re-derives lock policy. **No new ADR** (ADR-0028 governs the model,
the 423 vocabulary, the staged rollout, and polling); this note records the FE realisation.

**Addendum (M2 build).** The full ten-row banner (peer request / hand-off / take-over / admin
override) shipped **in M2**, not deferred to M3 as the design doc first scoped. The server
endpoints + hooks already exist and the capability flags are live for any Org Admin / post-grace
peer today, so a partial banner would have shown dead affordances; the component + a11y coverage
landed with the controls. What remains M3 is only the multi-actor Playwright hand-off journey
(TECH_DEBT #27). The row-6 grace countdown is an aria-hidden advisory; per-action announcements use
the banner's own `role="status"` live region as the single source (no duplicate `useAnnounce`).

## TSLD editing + edit-lock pen: web flags default ON (2026-07-12)

With every pre-enablement gate green — the flag-on Playwright harness (`test:e2e:edit`),
the a11y sign-off, and the manual cross-browser `Alt+←/→` history-suppression sweep
(Firefox/Safari/Edge, TECH_DEBT #25a) — the two **web** feature flags now **default ON**
in the shipped bundle (`apps/web/src/config/env.ts`): `VITE_TSLD_EDITING` (on-canvas
create/move/link/relane) and `VITE_PLAN_EDIT_LOCK` (the edit-lock "pen"). A new
`flagDefaultOn` reader treats them as enabled unless explicitly set to `false`/`0`
(rollback / opt-out).

The server-side write-gate `PLAN_EDIT_LOCK_ENFORCED` **stays default-off** — the single
deliberate ops switch, enabled only after a bundle with the pen on is live (ADR-0028 §9
ordering; enabling it ahead of the web bundle would 423 the shipped
activities-table / dependency / recalculate flows). This is the ADR-§9-faithful path:
default flips step 1 (pen) and step 3 (canvas) on; step 2 (enforcement) remains config.

Testing split: the existing `playwright.config.ts` suite is pinned **flags-off**
(`VITE_TSLD_EDITING=false VITE_PLAN_EDIT_LOCK=false`) as the read-only / role-only
baseline regression net; the flags-on editing surface keeps its own `playwright.edit.config.ts`
harness. Recorded as an addendum to **ADR-0028 §9** (no new ADR — the model is unchanged;
only the web defaults flipped).

## Informative TSLD canvas — the viewport/command/ruler seam (2026-07-12)

**Context.** The "Informative TSLD canvas" slice (spec
`docs/specs/tsld-informative-canvas.md`, plan `docs/plans/tsld-informative-canvas.md`,
Task B1) adds a multi-row time-scale ruler, zoom presets + zoom −/+, layer toggles, a
TODAY marker and non-working shading — all client-only, within **ADR-0026**. The one
non-obvious architecture point is the seam between a **ref-authoritative viewport**
(ADR-0026 D3: `viewRef` mutated directly on pan/wheel with **no per-frame `setState`**,
repainted by the existing rAF `frame()` loop off `dirtyRef`/`interactionDirtyRef`) and
three new things that must react to that viewport: a DOM ruler that stays pixel-synced to
the bars, a toolbar that **commands** zoom, and a toolbar that **reflects** the active
zoom preset. This entry records that seam. **No new ADR** — it refines, not changes,
ADR-0026 D3/D7 and its "ruler labels are DOM chrome" note.

**Decisions.**

- **View state (zoom preset + 5 layer toggles) is LOCAL component state in `TsldPanel`,
  not URL.** This supersedes the spec's Q2 default and drops plan Task A3 (the URL search
  schema). `mode`/`fitSignal` already live as `TsldPanel` `useState`; the preset and the
  five toggles join them and pass down as props (`viewToggles`, and the active preset for
  the segmented control). _Why:_ the product owner chose it — the view is a transient,
  per-session reading preference, not a shareable document coordinate; keeping it out of
  the router avoids search-param churn/re-render on every toggle and removes a Zod
  parse/round-trip surface for no user-visible gain at this stage. _Consequence:_ the
  configured view is **not** deep-linkable or reload-stable; if shareability is later
  wanted, promoting these to URL search params (ADR-0004) is a localised `TsldPanel` +
  route change. The **live pan/zoom viewport stays ref-authoritative** regardless (it was
  never a candidate for either state home).

- **The ruler is a DOM overlay rendered _inside_ `TsldCanvas`'s host (`containerRef`),
  updated imperatively from the existing rAF `frame()` loop off the same `viewRef` /
  `sizeRef` the painter reads — never from lagged React state.** It sits last in the host
  (a top band, `aria-hidden`, `pointer-events-none` so pan/zoom/click pass through to the
  canvas beneath). Two-tier update, both driven from `frame()`:
  - **Pan (frequent, per-frame): a single pixel-exact `translateX`.** Because `pan()` only
    adds to `originX` at constant `pxPerDay`, every tick's screen x shifts by the _same_
    origin delta; so `bandContainer.style.transform = translateX(originX − buildOriginX)`
    is exact, not approximate — one style write per frame, no re-tile, no allocation.
    (Vertical pan / `originY` never affects the ruler; only `originX`/`pxPerDay` do.)
  - **Zoom / resize / pan-past-buffer (infrequent): re-tile.** A `rulerBuildRef` snapshots
    `{ pxPerDay, originX, width, height }` at the last build. Each frame compares the live
    `viewRef`/`sizeRef` against it: if `pxPerDay` changed (granularity keyed off `pxPerDay`
    changes the day/month/year rows), or the surface resized, or `|originX − buildOriginX|`
    exceeded the pre-tiled off-screen buffer, it rebuilds the tick DOM from the pure
    `rulerTicks(view, size)` (over the visible day span + buffer only — O(visible), never
    O(plan)), resets the transform to 0, and re-snapshots. Ticks are reconciled against a
    reusable element **pool** (update `textContent`/`left`/`width`, hide surplus) so re-tile
    allocates nothing steady-state. _Why imperative, not a throttled `setState`:_ reading
    `viewRef`/`sizeRef` inside the same `frame()` iteration that calls `paintScene`
    guarantees the ruler and the bars are drawn from **one** viewport snapshot per frame —
    they can never desync, even on a fast fling — and it keeps ADR-0026 D3's zero-`setState`
    rule intact for the whole interactive surface (mirroring the canvas painter exactly). A
    declarative ruler with `setState`-on-re-tile was considered and rejected: it re-renders
    on every wheel tick and risks a one-frame bar/ruler skew if a commit lands a frame late.

- **The toolbar commands zoom through a small imperative handle on `TsldCanvas`** (React 19
  `ref` prop + `useImperativeHandle`), not lifted state or a viewport callback:
  `zoomToPreset(level)` and `stepZoom(factor)`. Each calls the pure, centre-anchored
  `zoomToPreset`/`stepZoom` (render-model), assigns the result to `viewRef.current`, and
  sets `dirtyRef`/`interactionDirtyRef` — the same mutate-ref-and-mark-dirty path pan/wheel
  already use. **Fit stays on the existing `fitSignal` prop** (it already re-fits on
  `dataDate` change too — no reason to churn it). _Why a handle:_ a zoom command is a
  one-shot side-effect on a ref-authoritative object; there is no React state to lift, and
  lifting the viewport into state to let the toolbar compute the new view is exactly the
  per-frame-`setState` path ADR-0026 D3 forbids. The handle keeps the mutation inside the
  canvas, off React's render path.

- **The toolbar's active-preset (`aria-pressed`) is fed back by a coarse
  `onZoomStopChange(level)` callback that fires only when `presetOf(pxPerDay)` crosses a
  band boundary — never per frame.** `presetOf` maps a continuous `pxPerDay` to the single
  owning zoom band (boundaries at the geometric midpoints between `ZOOM_STOPS`), so exactly
  one preset is always lit and it changes only on a crossing. A `lastStopRef` holds the
  last-reported band; the crossing check runs **only at the discrete sites that change
  `pxPerDay`** — the wheel handler, `zoomToPreset`, `stepZoom`, and the fit block — not in
  the general per-frame loop (pan never changes `pxPerDay`, so the frequent path never
  touches it). On a crossing it updates `lastStopRef` and calls `onZoomStopChange`, which
  flips one small piece of `TsldPanel` state. _Tradeoff:_ nearest-band-owns means the
  control shows the closest scale even mid-wheel (stable, minimal `setState`) rather than
  going un-pressed between stops (truthful but flickery); the stable reading was chosen and
  matches the spec's C1 "derive pressed state from `presetOf` with a tolerance" risk note.

- **The new per-frame paint inputs enter via `sceneRef`, not new per-frame plumbing.**
  `TsldScene` gains `view: TsldViewToggles` (`{ dayGrid, monthGrid, yearGrid, today,
nonWorking }`), an optional `isWorkingDay: (dayOffset: number) => boolean` predicate (or
  `null` when the plan has no calendar), and `todayOffset: number | null`. These join the
  existing `sceneRef`-rebuild `useEffect` (which already marks dirty on prop change), so
  they are read once per paint off the ref with zero added per-frame allocation. The
  predicate is built at the mapping seam in `TsldPanel` (from the already-loaded
  `CalendarSummary` mask, plus `useCalendar` exceptions in Phase 2) and **must be
  `useMemo`-stable** (keyed on `calendarId` + exceptions) — an inline closure would re-run
  the effect and repaint every render. The render-model core stays calendar-agnostic
  (ADR-0024); `paintScene` calls the predicate only inside its existing culled visible-day
  grid loop (O(visible columns), one batched wash pass **below** the gridlines) and draws
  the today line above bars/below selection. `todayOffset` is `daysBetween(dataDate,
localTodayIso)` computed once in `TsldPanel`.

**Exact seam shape `TsldCanvas` exposes:**

- Props (all optional; absent ⇒ today's read-only surface, byte-for-byte): `viewToggles:
TsldViewToggles`, `isWorkingDay?: ((dayOffset: number) => boolean) | null`, `todayOffset?:
number | null`, `onZoomStopChange?: (level: ZoomLevel) => void`.
- Imperative handle (via `ref`): `interface TsldCanvasHandle { zoomToPreset(level:
ZoomLevel): void; stepZoom(factor: number): void; }`.
- Unchanged: `fitSignal` still drives Fit; `viewRef` stays the sole viewport authority.

**Risk to editing gestures — checked, none.** The gesture machine reads the viewport only
through `machineCtx()` → `viewRef.current`, and all ghost geometry is derived from the live
`viewRef` each interaction frame (`liveGhostRect`/`dayCellRect` take `view`), never cached in
screen px. So a zoom command or ruler update — which only ever _mutate `viewRef.current` and
set dirty_, exactly as pan/wheel already do — cannot desync an in-flight gesture: the ghost
simply re-derives at the new scale on the next interaction frame. The viewport is never moved
out of its ref, so ADR-0026 D3 holds and the M2/M4/M5 gesture, hit-test and focus-follow paths
are untouched. **No new ADR** (ADR-0026 governs the rendering/viewport/a11y architecture; this
records the readability-layer seam within it).

## M4 advanced constraints — acceptance gate & the violation-output contract (2026-07-16)

M4 lands ADR-0035's constraint clauses; this records the decisions the milestone's design gate (F0)
settles, so the engine slices that follow have a fixed contract. See ADR-0035 §7 amendment and the
acceptance-status ledger.

- **Violation output (§7, Q1).** Mandatory produce-and-flag replaces the current _silent parking_ of
  `MANDATORY_START`/`MANDATORY_FINISH` as MSO/MFO. The engine gains an **engine-owned per-activity
  `constraintViolated` boolean** (the pin overrides a stronger logic bound) and a plan-level
  **`constraintViolationCount`** that **replaces `parkedConstraintCount`** (nothing is parked any
  more). N15's soft case (a `START_ON_OR_AFTER` before the data date, honoured-and-noted) is a
  separate plan-level **`constraintWarningCount`**. Produced, never repaired — the boundary neither
  rejects nor rewrites a mandatory constraint. **No standalone ADR** (no new axis/invariant): recorded
  as the ADR-0035 §7 amendment. `constraintViolated` is engine-owned like the other CPM outputs
  (never client-settable), so the security posture matches `isCritical`/`totalFloat`.
- **ALAP modelling (§11, Q3).** As-Late-As-Possible is a **boolean `scheduleAsLateAsPossible`**, not a
  `ConstraintType` enum value — keeping `ConstraintType` strictly date-bearing. It is delivered as a
  display-only zero-free-float placement pass (the free-float=0 _assertion_ defers to M6, matrix
  "M4/M6").
- **Expected Finish shape (§9, Q2).** A plan-level recalc **option** (`useExpectedFinishDates`,
  mirroring M2's `progressRecalcMode`) plus a per-activity **`expectedFinish` date**, reusing M2's
  remaining-duration seam to resize remaining work to hit the target — not a per-activity boolean.
- **Zero-duration task ≠ milestone (§22).** The engine keys milestone-specific behaviour off an
  **`isMilestone(type)`** predicate, not `duration === 0`, so a zero-duration `TASK` keeps a real
  start+finish and loses the project-finish tie-break to a genuine finish milestone at the same
  instant. Delivered first (F1) behind the byte-parity golden gate.
- **Topology reporting (§13/§14) in scope.** F8 (duplicate-edge reject with the pair named; cycle
  reports naming the exact members) is included in M4 as the last, droppable slice.
- **Total-float mode coincidence (§18, M6-F3).** The plan-level `totalFloatMode`
  (`START`/`FINISH`/`SMALLEST`, default `FINISH`) is implemented, but SchedulePoint measures total
  float on the activity's **own** calendar for **both** the start and finish sides (ADR-0037 §4), so
  the three modes **coincide for every unprogressed activity** — advancing start and finish by the
  duration on one calendar preserves the working-time gap. Consequently the conformance fixture's
  mixed-calendar S13 divergence (`A4340/A7710/A11100/A5500`) is **deliberately not reproduced**
  (verified 0/4). The modes diverge only for a **progressed** activity (frozen actual start ⇒ zero
  start-float). P6's start-vs-finish split measures the two sides on different _neighbour_ calendars —
  a multi-calendar-measurement artefact we don't adopt (north-star, not parity). Recorded as the
  ADR-0035 §18 semantic; no standalone ADR (a consequence of ADR-0037's own-calendar-float decision).
- **Float-path output contract (§19, M6-F6).** `computeFloatPaths(activities, edges, options, target,
maxPaths)` is a pure, read-only analysis returning ranked **contiguous driving chains** into a target
  (not activities sorted by total float): `{ index, relativeFloat, activityIds }`, target-first.
  **Path 0** is the target's driving chain (`relativeFloat` 0); each activity's **non-driving**
  predecessors seed a frontier, and later paths pop the lowest-total-float branch and walk ITS driving
  chain through still-unassigned nodes — so every activity belongs to exactly one path and branch paths
  come out by non-decreasing relative float. `relativeFloat` = the entry activity's total float minus the
  target's; it may be **negative** when a branch is more critical than a floating target (a
  constraint-broken predecessor). Bounded by `maxPaths` + a per-chain depth guard (no blow-up on dense
  graphs). The read endpoint `GET .../schedule/float-paths?target=&maxPaths=` (schedule:read; 422 if the
  plan has no start date; 404 for a target not in the plan) now exposes
  it — the analysis recomputes the schedule live via the shared engine-input builder, so it can never
  drift from a recalculate (ADR-0035 §19); no standalone ADR (a read-only analysis over the existing
  schedule + driving edges).
- **Float-path relative float is reported in MINUTES (audit F4 M0, 2026-08-02).** This entry used to
  say "relative float in working days", and that clause was **false in a way that mattered**. The
  read-model divided the engine's working minutes by a flat 1440 while total float is measured on the
  **activity's own** calendar (ADR-0037 §4, ADR-0068) — so on an eight-hour calendar one working day
  of relative float (480 minutes) rounded to **0**, indistinguishable from the driving path, and
  larger values were understated threefold. It never bit because nothing consumed the field;
  **building the F4 surface is what would have made it bite**. The response now carries
  `relativeFloatMinutes` (the engine's figure, unconverted) alongside a retained-and-deprecated
  `relativeFloat` — **superseded 2026-08-03: that day field was removed; see the entry at the top of
  this log.** Readers convert against the calendar they are presenting on, which for the F4
  panel is the **target activity's** (recorded in `docs/specs/float-paths-surface/feature-spec.md`
  §7, CQ-3). The envelope also gained `hasMorePaths`, derived by asking the engine for `maxPaths + 1`
  and slicing — **`engine/float-paths.ts` is unmodified**, pinned by
  `schedule/float-paths.structural.spec.ts`. This is F8's defect one field along, and F8 had named
  this exact conversion as unchecked.
- **TSLD export & print (Stage C1, `VITE_EXPORT_PRINT`, on by default 2026-07-20).** The `export`/`print`
  toolbar placeholders became four **client-side** deliverables — no API/schema/`@repo/types`/CPM-engine
  change, so the recalc parity gate is structurally untouched (spec `docs/specs/export-print/`). Key
  decisions: (a) the **CSV** projects a deliberate **superset** of the responsive activities-table columns
  (a planner/QS export, not table parity), Excel-safe with an OWASP **formula-injection guard** (a leading
  `= + - @` / TAB / CR — or one after only leading whitespace — is apostrophe-prefixed before RFC-4180
  quoting) and a UTF-8 BOM; all-rows by default with a conditional **Matching activities only (N)** item
  when a Stage-A/B lens narrows the set. (b) The **image** exports reuse the shipped `paintScene` against a
  freshly-created **off-screen** canvas (the live `TsldCanvas` is only read via `getViewport()`, never
  repainted) in a **light print palette** (`resolvePrintPalette`, token-derived); **offer both extents** —
  whole-plan and current-view — each with a distinct filename, bounded to an 8192 px/side raster cap +
  scale-to-fit. (c) **PDF** via **lazy `import('jspdf')`** (jspdf@3.0.4, MIT) so it is absent from the
  initial bundle and fetched only on first PDF export (measured: the ~235 KB-gzip jsPDF graph sits in
  separate chunks unreachable from the entry). (d) **Print** uses the **image path** (a print-only
  container + `@media print` stylesheet hiding `#root`), never a CSS print of the live one-viewport canvas
  bitmap. Rejected/deferred: a hand-rolled PDF writer (maintenance/security), app-handled `Ctrl/Cmd+P`
  interception (a documented fast-follow — hijacking the browser print shortcut is a footgun), and
  XER/MSP interchange + the `share` External-Guest link (Stage **C2**). No standalone ADR (client
  render/serialisation on ADR-0026/0031). Follow-ups noted: a CI bundle-budget gate now that the first
  heavy lazy dep landed, and npm-level SBOM for the SPA image (both pre-existing, tracked as tech debt).
- **On-canvas Level of Effort / Hammock (Stage D, `VITE_CANVAS_ACTIVITY_TYPES`, on by default 2026-07-20).**
  The canvas Add split-button's Level-of-effort + Hammock "Coming soon" placeholders collapse into ONE
  live **Level of Effort (hammock)** item that arms a two-click endpoint-pick tool-mode (a mutually-
  exclusive sibling of the ADR-0032 Link tool: a new `'loe'` `EditMode`, a `loePicking` gesture state, a
  `loeSpan` intent). Picking a start driver then a finish driver runs `createLoeSpan`, which composes a
  `LEVEL_OF_EFFORT` activity (0-day) + SS (start→LOE) + FF (LOE→finish) edges as **one undoable command**
  (ADR-0048; undo deletes the LOE, whose edges cascade server-side), rolls back the orphan LOE + refetches
  - clears redo on any sub-mutation failure, then fires the coalesced auto-recalc (ADR-0032). **Frontend-
    only** over the already-shipped LOE engine (M5-epic, ADR-0035 §21) — no API/schema/`@repo/types`/CPM-
    engine change, so the recalc parity gate is structurally trivial. Key decisions: **(Q1)** Hammock is NOT
    a distinct engine type — SchedulePoint's LOE already computes the span-derived hammock (SS-pred start →
    FF-succ finish) and `WBS_SUMMARY` covers the rollup variant, so a raw `HAMMOCK` create is **never wired**
    (the enum would mis-schedule as a TASK); the `'Hammock'` label map stays only for display-honesty of an
    imported activity. **(Q2)** a **single** "Level of Effort (hammock)" item (the P6 vocabulary kept for
    discoverability) rather than two labels. Review-hardened before flip: the armed Add trigger shows "Pick
    start driver" → "Pick finish driver", the item shades below two activities, the tool disarms + announces
    on commit/cancel, and a keyboard-picked start is single-sourced (`useTsldCanvasUiState.loeStartId` +
    a controlled `TsldCanvas.loePickStartId` prop) so it survives a pointer-picked finish (WCAG 4.1.3). A
    distinct engine Hammock (a behaviourally-different span) remains an optional future sub-stage (plan
    M-D3), not built. No standalone ADR (client interaction on ADR-0031/0032/0048).
- **Canvas resource view + over-allocation highlight (Stage E, `VITE_CANVAS_RESOURCE_VIEW`, on by default
  2026-07-20; ADR-0049).** The `resource-view` "Coming soon" placeholder becomes a real Look-row lens that
  toggles a **canvas-axis-aligned demand strip** — a Canvas 2D **sibling layer** (the third ADR-0026 layer:
  scene · interaction · strip) painted by the existing `TsldCanvas` rAF loop from the SAME `viewRef`, so
  bucketed resource-loading bars sit under the diagram's day/week/month columns and pan/zoom with zero
  desync. The band is reserved via `measure()` only when active (`stripBand = active ? RESOURCE_STRIP_HEIGHT
: 0`), with dual dirty flags (`dirtyRef` viewport + `stripDirtyRef` data) and a whole-series
  viewport-independent y-scale; strip _chrome_ (resource picker + reused bucket-size `Select` + reused
  accessible `<table>`) is DOM in a `ResourceStripPanel` docked above the band, strip _bars_ are canvas. A
  sibling `over-allocation` lens rings over-allocated bars with a rising-histogram **shape** badge (warning
  hue, distinct from the constraint pin / conflict / lane-overlap cues; + listbox marker + polite count
  announcement), derived purely from the shipped levelling flags (`levelingWindowExceeded`/
  `selfOverAllocated`) as a default-absent `TsldScene.flaggedIds`. **Frontend-only** over the already-shipped
  resource-histogram read-model (`useResourceHistogram`) — no API/schema/`@repo/types`/CPM-engine change, so
  the recalc parity gate is structurally trivial; flag-off (or curves-off) ⇒ both ids are their placeholders
  and the canvas reserves no band and paints byte-for-byte today's. Gated on `RESOURCE_CURVES_ENABLED` (the
  data source). Review-hardened before flip: the shared `ResourceLoadingTable`/`BucketSizeSelect` extraction
  is now consumed by both the strip and the modal `ResourceHistogram` (no duplication), the chrome no longer
  occludes the band, the over-allocation toggle can't stick on (enabled while active), the strip section has a
  visible focus ring, and integration/hook e2e coverage lands. See ADR-0049.
- **Schedule interchange — Primavera P6 XER import (Stage C2 M1, `VITE_SCHEDULE_INTERCHANGE`, on by default
  2026-07-20; ADR-0050).** Planners import an existing P6 `.xer` into a new SchedulePoint plan, lowering the
  switching cost (PROJECT_BRIEF §8/§17). A **pure, engine-free `@repo/interchange` package** (mirroring the
  `engine-conformance` split) does detect → parse (`%T/%F/%R/%E`, CP1252) → a **format-agnostic canonical
  model** → map to a SchedulePoint import graph → **validate/repair/report** per the ADR-0035 reject/repair/
  report contract (drop dangling edges, de-dup `(pred,succ,type)`, deterministic cycle-break to guarantee
  acyclicity per ADR-0021, disambiguate duplicate codes, coerce hours→working-minutes, and **report every**
  unmapped type / dropped M2 table (PROJWBS/RSRC/TASKRSRC) / non-expressible calendar detail — nothing is
  dropped silently). A thin NestJS `interchange` module exposes a **two-phase** flow — `dry-run` (parse →
  `InterchangeReport`, no write) then `commit` (create the plan via the existing repositories in one batched
  `createMany` transaction, recalculate, return `{ planId, report }`) — behind an `interchange:import`
  permission (Planner + Org Admin) + target-project org-scope (anti-IDOR) + a 16 MiB boundary cap and an
  explicit graph-size ceiling (the DoS backstop). The commit acquires the edit-lock on the new plan for the
  importer so the pen-gated recalc (ADR-0028) succeeds under enforcement, then releases it. Key decisions
  (CQ-1..5): **import only** (the External-Guest share link is a separate future Stage F), **import-first**
  (export deferred), **XER + MSPDI (M3); `.mpp` excluded** (no permissive TS reader), always a **new plan**
  (no merge), and a **pure TS package** (not a Python worker). The **CPM engine and its recalc golden suite
  are untouched** (commit reuses services + calls the unchanged recalculate). Flag-off ⇒ the plan-create
  surface is byte-for-byte today's (no entry, no dialog). See ADR-0050; M2 adds WBS/constraints/progress/
  resources mapping, M3 adds MSPDI, M4 (optional) export.
- **The app shell's root was a minimum, not a height (`min-h-dvh` → `h-dvh`; found by ADR-0059's Gantt
  scale journey, 2026-07-28).** `app-shell.tsx`'s outermost box was `min-h-dvh`, which leaves its
  computed height `auto` — so every `flex-1 min-h-0` beneath it (the shell row, `<main>`, the plan
  workspace, the workspace body) resolved against **content**, not the viewport, and the plan
  workspace region was silently unbounded. The TSLD canvas had shared that container since ADR-0029
  without exposing it: a canvas sizes itself from a `ResizeObserver` and fills whatever it is handed,
  so it cannot report that the box it was handed was wrong. The Gantt's virtualizer measured the same
  container, found its scroller exactly as tall as its own content, and rendered **every** row —
  `clientHeight === scrollHeight`, 101 live rows at 100 activities and 301 at 300, measured in a
  browser. That is precisely the premise ADR-0059 §1 rejected canvas on, so the scale journey was the
  right test and it worked as intended on its first real run.

  Both shell roots take the fix (`AppShell` and the `VITE_NAV_TREE=false` fallback in
  `authed-layout.tsx`, which has to carry it too or a rollback resurrects the bug), and each takes
  **both halves**: the root becomes `h-dvh overflow-hidden` _and_ `<main>` becomes the scroller
  (`min-h-0 overflow-auto`). A fixed root without a scroller is the trap in between — the first
  attempt did exactly that and turned "a screen taller than the viewport scrolls" into "a screen
  taller than the viewport collides", which the flag-off plan workspace demonstrated immediately: its
  canvas region was squeezed to nothing while the empty-state inside it could not shrink, so it
  overflowed onto the docked activities panel. The panel stayed visible and enabled in the
  accessibility tree while every click landed on the canvas — the worst shape a layout bug can take,
  because nothing looks broken. Scrolling `<main>` rather than the document is also the honest model
  for a persistent shell: with a fixed header and rail, scrolling the page moved the chrome away
  anyway.

  That squeeze was a real latent defect of its own, not collateral: `CANVAS_MIN_HEIGHT` had been
  documented as "height always kept for the canvas" since ADR-0030 but was only ever applied to
  clamp the panel's _maximum_, never as an actual floor on the canvas region. It is now a real
  `min-height`, so the column grows past the viewport and scrolls instead of overlapping.

  Held by `e2e-gantt/gantt-scale.spec.ts` (the row count). **No unit test can hold it**, because
  jsdom has no layout: it cannot tell a bounded scroller from an unbounded one, nor a panel from the
  element painted over it.

  _Corrected 2026-08-10 (ADR-0088 D3)._ This sentence also named `e2e-workspace/workspace.spec.ts`
  as holding the collision. Deleting that suite with `VITE_CANVAS_TOOLBAR` prompted a read of it,
  and **it never asserted the collision** — its unique assertion was the panel's WAI-ARIA splitter,
  which was ported into `e2e-toolbar/toolbar.spec.ts`, and everything else it did that suite already
  covered. So the citation was wrong when written, not broken by the deletion: the collision half
  has never been held by a journey. Which is ADR-0058's rule exactly — the claim read as coverage
  for months, and only checking it showed there was none.

- **Resource-dependent activities reach the product (ADR-0035 §23 web surface, 2026-07-28).** §23 was
  Accepted and built in M7.2 — the engine schedules a `RESOURCE_DEPENDENT` activity on its driving
  resource's calendar (ADR-0039), the service resolves that calendar, the conformance slice covers it —
  and **none of it was reachable**: the type was missing from `ADVANCED_ACTIVITY_TYPES`, so the picker
  never offered it, and `resourceDriverMissing` (the produce-and-flag signal for "no driving
  assignment") had no renderer at all. Its only non-test references were a guest-API default and a test
  fixture. A plan could therefore schedule work on the wrong working time and look entirely normal.
  This slice adds the three missing surfaces: the type in the picker, the row badge, and the plan-level
  count (`resourceDriverMissingCount`, which the API had returned unconsumed since M7.2). The
  per-activity calendar picker is **shaded with its reason** for this type rather than left live,
  because the service overrides it — a live control that saves an ignored value is the same
  lit-but-inert defect the Gantt's zoom preset had a week earlier. No schema, API or engine change, so
  the recalc parity gate is untouched. The membership rule for the advanced-types list is now stated
  where it lives: **the engine honours it as labelled** — the bar the constraint selector already held.
  Found by checking the roadmap's "still pending" claim against the code instead of believing it
  (ADR-0058); the same pass corrected the Gantt's "closed the last Must-have" claim, which the brief
  words "read-primary; **edit supported**".

- **The reversed link (ADR-0064 A2) is closed as _unreproduced_, and its likely cause was the Link
  trigger that armed nothing (2026-07-30).** The epic opened on two observations from one driving
  session: six link attempts that created **zero** dependencies, and one link that recorded
  `Reinforce → Set out` after clicking _Set out_ then _Reinforce_. The plan (CQ-1) required the
  second to be diagnosed with evidence before anything was "fixed", because the gesture reducer maps
  the **first** click to the predecessor and carries no inversion on any path — so the cause had to
  be elsewhere, and recording "fixed" for a defect we never explained is the failure ADR-0058 exists
  to name.

  `apps/web/e2e-authoring-flow/link-direction.spec.ts` drives the two-click pick against a real API
  with the pen enforced and the coalesced auto-recalculation live, sweeping the inter-click delay
  across the 500 ms debounce boundary (0 / 250 / 600 / 1500 ms quiescent, 0 / 900 ms with a
  recalculation genuinely in flight — armed by drawing a task on the canvas, since an API-direct
  write would never schedule one). Each bar's click point is **measured**, not assumed: the harness
  walks one canvas column in `select` mode and reads the canvas's own parallel listbox back, then
  re-probes the same two pixels after the pick. That is what makes the outcomes distinguishable —
  no row at all means a click was dropped; a reversed row with a **changed** map means the scene
  moved between the clicks; a reversed row with the map intact means a third mechanism.

  **All seven cases recorded exactly one dependency, in click order, with the map unchanged.** A2
  does not reproduce, and is closed as unreproduced rather than as fixed.

  What the same session's _other_ observation does explain is A1c, and it is now pinned: the Link
  split-button's primary region used to open its type menu and arm **nothing**, so a planner who
  clicked "Link" and then clicked two bars was still in **Add** mode and drew two activities. That
  is where the zero dependencies came from, and it is also the shape most likely to be read as a
  reversal — the click sequence the planner counted was not the sequence the machine received. The
  invariant is therefore stated as a **replacement**, not as "Link arms": arming Link while Add is
  armed leaves Add disarmed, the next canvas click picks an endpoint, and the plan's activity count
  does not change. Asserting only the dependency would pass on a run that _also_ drew two strays.

- **The canvas now says which tool is armed (ADR-0064 M1, 2026-07-31).** Six surfaces landed
  together behind `VITE_CANVAS_AUTHORING_FLOW`, flipped default-on the same day once the flag-on
  journey was green locally: the mode statement band, the link confirmation with its direction and
  Undo, keyboard pick parity for the Link tool, recalculation quiescence during an open pick, and
  the empty-plan state. The defect fixes they sit on — the Link trigger arming its tool, the uniform
  disarm contract, the create popover's visible label and distinct submit — ship **outside** the
  flag, because gating them would mean writing parity suites that pin a bug.

  Three things this epic taught that outlive it. **A `[VERIFIED]` tag is a claim, not a fact**: two
  of this spec's carried one and were wrong, both written by the same person who drove the session
  they came from. **Measure the thing you are about to assert about**: the diagnostic only produced
  an answer once it stopped trusting the pixel it drew at and started asking the canvas which bar
  was there. And **a helper that fixes one hazard can introduce another** — the selection-clearing
  helper added to stop the floating actions bar covering a pick point clicked while Add was still
  armed, opening a create popover over the very points it was protecting.

- **Link corridors now step around bars, and the draw budget turned out to be fiction
  (ADR-0065 / ADR-0064 M2, 2026-07-31).** `VITE_CANVAS_LINK_ROUTING` default-on. The geometry is
  one optional parameter on the existing `routeOrthogonal` rather than a second router, so flag-off
  is byte-identical by construction; the interval index comes from the same `activityRect` the bars
  draw from; the search is bounded and fixed-order because a route that varies between frames reads
  as the diagram twitching.

  The part worth remembering is not the routing. Building the gate meant writing
  `apps/web/scripts/measure-link-routing.mjs`, which paints the real painter against a **real 2D
  context in Chromium** — and the first thing it reported was that the **already-shipped** canvas
  runs at 16.7–23.1 ms p95 at 2,000 activities against ADR-0026 §16's stated ≤ 4 ms. Nobody had
  ever run it. TECH_DEBT #59 has said "the budget has never been measured on the hardware envelope
  it names" for months, and the number was quoted in ADR after ADR as though it were being met.

  Two smaller lessons from the same afternoon. **A budget fixture that does not exercise the code
  it budgets is worse than none** — the first run of `paint.routing-budget.test.ts` reported _zero_
  extra segments, because the fixture's edge offset was an exact multiple of the lane count and
  every "long-range" edge was same-lane. And **a dead branch survives a green suite**: the first
  draft of the five-point fallback ran `candidates.find(free)` after a loop that had already
  returned on any hit, so it could only ever emit the plain elbow. It was caught by reading the code
  back, not by a test — a test would have passed.

- **A hub's comb of verticals became one trunk (ADR-0065 §5 / ADR-0064 M3, 2026-07-31).** Same flag.
  The rule that matters is not the snapping, it is the refusal: a corridor only joins the trunk if
  the trunk x is free across the lanes that corridor crosses, so bundling can never put a line back
  through the bar the milestone before it moved that line off. It also moves the **line only** — the
  lag anchors, their handles and their hit zones are computed before the bundler runs and are not
  passed to it, so the plan's stated M3 risk is answered by what the function can reach rather than
  by care.

  Two things recorded rather than smoothed over. The plan's gate said "if M2 measures badly, M3
  becomes the remedy for the cost" — **it is not**: the painter batches every edge into one path, so
  overlapping verticals cost what separate ones did, and the re-measurement found no change either
  way. M3 stands on legibility alone. And the gate's other input, a ux review of what the remaining
  problem actually is, was **not run** in this session.

- **The enablement review pass found five defects that had passed a human read (ADR-0064/0065,
  2026-07-31).** Five specialists over the combined epic diff; performance passed, the other four
  blocked. What they found, in descending order of how badly it would have bitten:

  1. **A stale link confirmation beside a live Undo.** `lastLink` was guarded by an `atMode` field
     always set to the literal `'link'` and only read inside a `mode === 'link'` branch — a
     condition that can never be false. So once a planner had made one link, **every later arming of
     the Link tool replayed "Linked A → B"**, next to an Undo bound to the top of the command stack,
     which by then was a different, more recent edit. A sentence naming one link beside a button
     that discards another. Now a per-arming generation; the regression test was verified to fail
     against the old guard before being kept.
  2. **Focus restored to a `tabIndex={-1}` node.** Both new split buttons passed
     `restoreFocusRef={triggerRef}` — the caret's ref, deliberately outside the tab order — so after
     picking a type or pressing Escape, the next Tab went wherever raw DOM order led (WCAG 2.4.3).
     `IsolateControl`, in the same file, had always done it correctly with a separate
     `mainButtonRef`. The reviewer reproduced it against the real toolbar rather than reading it.
  3. **The Link tool's pointer picks were silent.** The keyboard path announced inline; the pointer
     path was wired to a raw `setState`. Both **drop** routes came through the same callback,
     including the recalculation-cap drop that fires with no user gesture — so a screen-reader user
     mid-pick got no notice their pick had gone, and their next Enter was read as a fresh
     predecessor. The LOE tool's equivalent handler, twenty lines up, had been right all along.
  4. **A Cancel that could not cancel.** Moving off native `disabled` (correct — SC 2.4.3) gave the
     submit a click guard and shading; Cancel got the `aria-disabled` attribute alone, so it
     announced "unavailable" while staying lit and clickable — and `onCancel` cannot abort the
     in-flight create, so it would have closed the popover and let the activity appear anyway.
     Switching the input to `readOnly` had re-opened Escape as the same route.
  5. **Untested wiring at three seams** — the Undo path, the hold/release pairing, and the
     drop-signal round trip — all covered now, plus the two derived flags.

  The pattern is worth naming: **four of the five are a correct pattern applied to one control and
  not its neighbour.** Not one was a design mistake; every one was an inconsistency inside a diff
  whose own docblocks described the right thing. That is what a specialist gate catches and a human
  read does not, and it is the third epic running where that has been true.

---

## 2026-07-31 — Three defects from the imported Unit 300 programme

The product owner imported a real 18-node / 126-activity P6 programme and reported that most WBS
summaries started on the project data date and drew on the canvas rather than the WBS band, that the
band's rows "didn't tally", and that logic lines "go up and off the canvas and back down". Three
separate defects, each reproduced against the actual file before anything was changed.

**1. `parentId` never reached the CPM engine (the big one, and server-side).**
`ScheduleActivityRow` had no `parentId`, `loadActivities` did not select it, and `toEngineActivity`
did not pass it — so **every** `WBS_SUMMARY` arrived at `computeSchedule` childless and took
ADR-0035 §24's _empty-summary_ branch: collapse to a zero-length point at the data date. Reproduced
end to end: all 18 summaries came back `ES = EF = 2026-03-02` despite every one of them having
between 2 and 13 children. With the seam fixed they roll up correctly (the root now spans
2026-01-05 → 2027-03-04, the whole programme).

Two things about how it hid for so long are worth keeping. First, the empty-summary convention is a
_defined_ answer, so nothing errored, no count was wrong, and the failure rendered as a 2px sliver on
the project start — which reads as a rendering nit, not as the engine being fed the wrong graph.
Second, `compute.wbs.spec.ts` constructs `EngineActivity` objects directly and passes `parentId` in
by hand, so the engine's own rollup suite was green throughout **and would have stayed green through
any fix**. The regression test therefore had to go in at the service seam
(`schedule.e2e-spec.ts`), nested two levels deep so it also pins the deepest-first ordering, and was
verified to fail against the old loader before being kept.

**2. An over-cap WBS summary rendered nowhere.** The band stacks three depths (ADR-0063 §3) and skips
anything deeper; `deriveWbsBandSource` lifted **every** summary out of the scene regardless. So a
depth-3 summary was skipped by one and removed by the other — invisible and unselectable — while
`wbs-band.ts`'s own docblock said it "is still an ordinary bar in the diagram". Fixed by making the
cap one exported predicate (`isWithinBandDepth`) that both halves call, which is the ADR-0065
"one route function, not two" rule applied to a filter. Not what the product owner hit (their tree is
exactly three deep) but found while confirming that it wasn't.

**3. Auto-arrange minimised lane count, not link length — and the measurement refuted the first
hypothesis.** The guess was that `packLanes` was scattering a chain; measured on the real programme it
does the opposite, taking mean |Δlane| per link from 13.0 to 2.3 and lanes from 144 to 13. The
residual problem is real but smaller: first-fit is _indifferent_ between equally-free lanes, so a
successor routinely lands as far as possible from its predecessor. Passing the plan's logic in as an
optional hint — choose the nearest free lane, never open one you would not have opened — gives mean
1.83, halves the links spanning more than five lanes, and uses **exactly the same 13 lanes**. The
hint is one optional parameter of the one packer, absent ⇒ byte-identical, for the reason ADR-0065
gives about `routeOrthogonal`.

Worth recording separately: the state the planner actually meets **on import** is 144 lanes, because
the interchange commit assigns `laneIndex` sequentially by source order. That, not the packer, is the
dominant source of "up and off the canvas". Auto-arrange is the existing remedy and it works; nothing
tells a planner to run it. Left as a product question rather than fixed here, because packing at
import needs computed dates that do not exist until the recalculation that follows the insert.

---

## 2026-07-31 — The seed catalogue (ADR-0066 M0–M5): what a test bed for the _application_ found

The engine has had a conformance harness since ADR-0034, and it proves nothing about the
application: it feeds `computeSchedule` directly and never touches Prisma, a service, a DTO or the
API. The catalogue closes that — 36 documented plans and cases across five tiers, every one created
through the **public REST API** by an ordinary client that signs in, obeys RBAC and holds the pen.

Recorded here because the findings, not the tooling, are the deliverable.

**What it found, per tier.** M1 (the fixture plan) found the seeder producing a plan that _looked_
right and was not, which became TECH_DEBT **#78/#79/#80** — three write-path gaps where the engine
and the storage support something (sub-day durations, window-only calendars, intraday shift
patterns) and **no public write path can create it**. That class is invisible to an engine harness
by construction: the harness never uses a write path. M3 (the pairwise differential) put the engine
in as its own oracle over the API. M4 (scale) fed TECH_DEBT **#75** a realistic scene and changed
its answer. M5 (hostile input) ran 18 negative attempts against the real API and found the
interchange exporter silently downgrading **Level of Effort to a task**.

**The LOE export defect is the epic's premise paying out**, so it is worth the detail. The import
adapter maps `TT_LOE → LEVEL_OF_EFFORT`; the emitter maps `LEVEL_OF_EFFORT → TT_LOE`; both are
correct. `export.service.ts` coerced the type to `TASK` **before the emitter ever saw it**,
justified by a docblock claiming it "matches how the import adapter coerces the same two kinds" — a
sentence that stopped being true when the importer was fixed, and that nothing then re-read.
ADR-0050's mapping-contract table already promised "`TT_LOE` ⇄ `LEVEL_OF_EFFORT`, exact both ways":
**the document was right and the code was wrong**, which is the reverse of the usual drift ADR-0058
is written about. It survived because nothing in the repo looked at both interchange directions at
once — the export suite asserts fields it chose, on plans built for the purpose, and a hand-built
fixture can only lose what its author put in it. The round-trip e2e now sends a _generated_
catalogue plan out and back and diffs everything: 45/45 activities, 64/64 links, 0 type changes.

**And one finding about the catalogue itself.** M4's generator passed every declared shape
assertion — density, WBS depth, milestone fraction, progress front, all correct — while producing a
plan that was **96% critical with an average total float of zero**: one queue, not a programme. No
test caught it. A Postgres query against the live seeded result did. The lesson is the one the
epic exists to make: a generator that asserts its own _inputs_ proves nothing about the _shape of
the answer_, and the check that mattered (`longestChainFraction`, verified failing at 0.992 against
its 0.4 bound before being relied on) had to be written against the computed schedule.

**Two things are deliberately not gates.** A seeded plan that the product refuses is reported as a
**finding**, not an exit code — failing the process would make an operator stop reading exactly
when there is something to read. And a _drop_ in the round-trip diff is not automatically a defect,
because ADR-0050 records what XER cannot carry; only the core network is asserted, the rest is
measured and printed. What **is** gated is `pnpm check:playbook`, which compares
`docs/TEST_PLAYBOOK.md` against `seed --list-plans` in both directions — the second direction being
the one worth the effort, since a plan nobody documented gets seeded, looks plausible, and
demonstrates nothing, which is the exact state the catalogue was built to end.

## 2026-08-01 — The Continental preset keeps 06:00–18:00, every day

The ADR-0067 spec reserved "Continental's exact hours" as a product-owner decision. Building the
preset list showed the question had a wrong premise — a continental rota is a **multi-week cycle**
that a 7-day repeating shift table cannot hold — so the preset was renamed for what it actually
writes rather than for the rota it half-resembles: `Continental days — every day, 06:00–18:00`.

Confirmed as-is. The reason is the shape of the set rather than the hours themselves: the five
presets are Standard week (Mon–Fri 08:00–17:00), Two shift (Mon–Fri 06:00–14:00 + 14:00–22:00),
Continental days, 24/7, and Window-only. Continental is the **only** one covering seven days without
being round-the-clock, which is a real gap the other four leave. Making it two-shift — the obvious
alternative — would have produced two presets differing only by weekend coverage.

Every label carries its hours, so a planner reads what a preset writes before committing to it; a
preset is a **verb** (ADR-0067 §5), so nothing records which one produced a week, and changing this
constant later reinterprets no stored calendar.

## 2026-08-07 — The search field's Escape, and who owns the live region

Two decisions the search-navigation epic (ADR-0079) settled by being driven in a real browser rather
than reasoned about.

**Escape belongs to the field, and the way out is two Escapes.** The alternative — leaving the
canvas's `window` listener unguarded and accepting that a planner sometimes loses an armed tool —
was never seriously available once it was seen happening: it is the ADR-0064 defect verbatim. What
was genuinely open is whether the guard could stand alone. It cannot: with the guard and no second
step, a keyboard planner has **no route at all** to Escape's other meaning, because focus never
leaves the field. The two-step is therefore part of the guard rather than a refinement of it.

**The panel owns "Search cleared.", not the handler.** The obvious place is the callback that clears
the query — it is where the decision is made and where the announcer is already injected. It is
wrong, and invisibly so: the panel's filter effect runs _after_ that commit and blanks the region to
drop the stale count, so the useful message is overwritten a tick later by machinery that is doing
its own job correctly. Owning it at the transition also covers the Clear button, which had been
silent since it shipped.

Both were found by `apps/web/e2e-search-nav/` on its first run. Neither is reachable by a unit test
in this repository.

## 2026-08-08 — Space toggles the selection; the logic summary moves to `i`

The multi-select epic (`docs/specs/canvas-multi-select/`, CQ-1) rebinds a shipped key, which is
worth recording because it is not visible in a diff of behaviour: **both** bindings do something,
so nothing looks broken from either side.

Flag-on, `Space` on the TSLD's parallel listbox adds or removes the focused activity from the
selection — the APG Listbox binding for a multi-selectable list, and the one a planner arriving
from any other list in the product will press. Its previous job, announcing the focused activity's
logic ties and driving detail, moves to **`i`**. That key was verified free against the current
keymap before it was taken (`Enter`, `?`, `[`, `]`, `Space`, `n`, `Alt+*`, `Shift+←/→`, arrows,
Home/End) rather than assumed free.

Two consequences worth stating, because both were decisions rather than fallout:

**`Shift+Arrow` extends vertically only.** `Shift+←/→` is already the ADR-0052 duration nudge, and
this listbox navigates vertically, so the horizontal chord is both taken and meaningless here.
Taking it would have removed a shipped edit accelerator to add a navigation one nobody asked for.

**The keyboard cursor becomes a separate piece of state.** Space toggles the focused row _without
moving focus_, and until this milestone the focused row and the selection were the same thing — so
toggling the primary off would have teleported the cursor to whichever row was added last. The
`activeIdRaw` state exists for that one sentence; flag-off it resolves to `selection.primaryId`,
expression for expression.

The rollback contract is `TsldPanel.multi-select-keyboard.flag-off.test.tsx`, which pins the old
binding rather than merely omitting the new one — a rebinding is the easiest kind of change to
half-revert, and a half-revert leaves `Space` doing nothing with no test failing.

## 2026-08-08 — Copy names disambiguate, and it is deliberately not `disambiguate`

`packages/interchange/src/validate.ts:55-63` already contains a name-disambiguation routine, and
`features/activity-copy/model/clone-naming.ts` contains a second one. That duplication is a
decision, not an oversight, so it is recorded here before somebody helpfully removes it.

They answer different questions. `disambiguate` resolves an **accidental** collision in imported
data — two source rows that happen to share a name — and its output is an apology (`Excavate (2)`);
it exists to get the import through a unique constraint. `freeCopyName` names a **deliberate** act,
and its output is a statement the planner made (`Excavate (copy)`, then `Excavate (copy 2)`); the
word "copy" is the whole point, and a planner reading `Excavate (2)` in their own plan would have
to work out where it came from.

The ADR-0065 argument for one implementation — "two will drift, and the drift is invisible" — does
not apply here, because **this** drift is visible the instant a name renders: it is on screen, in
the table, in the export. What would be invisible is the opposite move, sharing a function and
having one caller's suffix rule quietly change the other's.

Both truncate to `ACTIVITY_NAME_MAX_LENGTH` (200) before appending, because the constraint they are
getting past is the same one and exceeding it is a 422 at write time rather than anything the
reader could have predicted.

## An ADR clause outlives the mechanism it was written for (2026-08-12)

`Start → Finish` could not be drawn on the canvas for about a year, and the reason is worth keeping
because the code was doing exactly what it had been told.

`LINK_TYPES` listed three of the four dependency types and cited **ADR-0026 D5** — _"SF is
dialog-only (the rare inverse)"_. Read the ADR and it says something narrower than the citation
implies. Linking was then an **edge-drag**, whose type came from a **modifier key**, and there are
exactly three: none, Shift, Alt. SF lost the ballot for a slot. It was never a statement about what a
_menu_ should contain.

**ADR-0052 then replaced the edge-drag with the two-click Link tool and its explicit type menu**,
which has no three-way limit. The constraint evaporated; the exclusion did not. Meanwhile the Prisma
enum, `@repo/types`, the CPM engine (ADR-0035's SF arithmetic), the API, the activity editor's Logic
tab and the canvas painter all handled SF — so an SF link scheduled and painted correctly and simply
could not be created on the surface this product is built around, while `docs/PROJECT_BRIEF.md` named
four dependency types as a headline capability.

**Three things to take from it.**

A citation is not evidence — ADR-0076 Class 2 in its natural habitat. The docblock read as
authoritative, named a real decision, and misdescribed it. Opening the ADR took a minute and was the
whole finding.

**A decision has a scope, and the scope is usually a mechanism.** When the mechanism is replaced, the
clauses that hung off it need re-reading rather than inheriting. ADR-0052 amended ADR-0032 M5 by
name; nobody asked what else the edge-drag had been carrying.

**And a subset needs a home in the domain.** The audit found no second instance, which is the useful
result: label maps are `Record<DomainType, string>` and the compiler forces them exhaustive, and
where a surface legitimately offers a subset this codebase already names it in the domain
(`SELECTABLE_CONSTRAINT_TYPES` / `PARKED_CONSTRAINT_TYPES`, which still offers a _present_ parked
value so an imported plan round-trips) or flag-gates it with the reasoning written down (the Add
menu's Hammock / Level-of-effort staging). `LINK_TYPES` was the only place a subset was invented in a
UI file with no domain-level name — which is what made it invisible.

**Process note.** The fix itself did not go through the feature-analyst: it is a bug fix against a
documented capability, not a new requirement, and §7's contract for a bug fix is a regression test
rather than a spec. What it _did_ owe was this entry and the note now in ADR-0026 — the reasoning
originally lived only in a code docblock and a commit message, which is not the register. Recorded
after the product owner asked whether the process had been followed.

---

## 2026-08-19 — A gate that counts its own documentation

**ADR-0097 Landing B**, found while the overview screen was being built, and worth its own entry
because it is the third instance of one shape and the first with a perverse incentive attached.

`token-architecture.test.ts`'s weight ratchet reads every `.ts`/`.tsx` file under `src/` and counts
`font-<weight>` utilities, split into two buckets: what the primitives place (a design system doing
its job) and what screens place (the drift the archetypes exist to absorb). It scanned **raw file
text**. So a docblock explaining _why_ a weight was chosen counted as placing one — which inflated
both numbers, and, worse, meant that writing the reasoning down pushed the gate towards failing. A
gate that penalises its own documentation is a gate somebody eventually works around.

Stripping comments moved the measured buckets to **162 screens / 23 primitives** — one lower in
each. Both ceilings were re-set to the corrected measurement rather than left at the inflated one,
because a ceiling that is one higher than the truth is a free slot nobody decided to grant.

**The shape.** A scan matching prose has now shipped three times here: the Gantt row-rhythm gate
matched `font-size` inside a comment; the overview's own archetype gate reported `OverviewScreen.tsx`
for an `<h1>` that appears only in its docblock; and this one. All three were caught the same way —
by a green gate going red for a reason the code did not support, or a red one for code that was
correct — and all three are fixed the same way. The rule that generalises: **a structural gate reads
code, so it should be handed code.** Comments are the one part of a file guaranteed to talk _about_
the thing being counted.

**What the ratchet did right, on the same day.** The new screen pushed the screen bucket from 165 to
167 — four row links each restating `font-medium` plus a hover colour, an underline and its offset.
The ceiling was **not** raised. The treatment moved into `rowLinkClass` on the `ListRow` primitive
(the `buttonVariants` precedent: a class constant rather than a component, because `components/ui/`
does not import the router), four screen sites became one primitive site, and the screen ceiling
ratcheted **165 → 162**. That is the trade the two-bucket split was designed to make visible, and it
only works because the primitives bucket is also capped — otherwise "move it into a primitive" is an
unlimited escape hatch rather than a decision.

---

## 2026-08-19 — Two of four symptoms had already been fixed

**ADR-0097 Landing C, found before M0's measurement ran** — by checking the spec's own
decision-bearing claims against the code, which is CLAUDE.md §19.10 applied to a document written
for this epic rather than to one inherited from an earlier one.

`docs/specs/design-system-rewrite/command-surface.md` §2 argues that the plan toolbar is a menu bar
rendered as a row, and lists **four symptoms that follow directly from the shape**. Two of them
describe behaviour that **ADR-0091 M7 had already changed**:

- _"Labels are all-or-nothing per row"_ cited `Toolbar.tsx:286-310`, which is `applyLadder` and the
  head of `measure` and has never held a label pass. The label pass is `computeLadder`'s Stage 1,
  and it labels an **importance-sorted prefix** through `affordablePrefix` — labels fall one at a
  time. That is precisely what M7 shipped, in answer to the product owner's "labels should fall one
  at a time rather than all at once".
- _"The `⋯` is an unnamed container for four named commands"_ — `tier: 3` has **one** occupant in
  the plan toolbar (`float-paths`), M7 made tier 3 admitted-last rather than exiled, and ADR-0093
  then returned `clear-visual-placement` inline and the `⋯` left Row 2 entirely.

§3.2's deletion list also names `LABEL_CHROME_PX` and `LABEL_PROMOTION_MARGIN_PX`, both of which M7
already removed — so the list overstates what the reshape buys by naming things already gone.

**This is the third ADR-0091 M7 fix that this one document describes as a live defect.** ADR-0097's
own register entry records the first: the reshape was costed partly on `CHROME_RESIDUAL_PX`
over-charging Row 2 by ~47 px, and M7 had fixed that too, the constant reading `16` today with its
docblock recording the recovery. One stale citation is ADR-0076 Class 2; three in one document, all
from the same milestone, is a pattern — **a spec written from the epics that preceded it inherits
their problem statements, and a milestone that fixed things does not go back and edit the specs that
complained about them.**

**What it costs, stated rather than absorbed.** The corrections are made in place with the withdrawn
claims struck through, because a reader who meets a four-symptom diagnosis weighs it differently
from a two-symptom one. Symptoms 3 (every width decision is a subtraction — `computeLadder`, four
band floors, a 48 px hysteresis, `CHROME_RESIDUAL_PX`, the `⋯` costing) and 4 (two rows) are
**verified accurate**, and the menu-structure argument — that `TOOLBAR_GROUPS` is a closed
seven-member tuple of nouns, verified exactly as cited — was always the stronger half. But the
proposal now has to carry itself on those, and §6 gains a second gate saying so: M0's report is read
against the 120 px of slack **and** against whether what survives justifies replacing the renderer
on the surface with the most test coverage in the product.

**The generalisable half.** A spec's problem statement is a claim like any other, and it goes stale
in the one direction nobody checks: the problem gets fixed and the document keeps complaining. The
rule that follows is cheap — **before building from a spec, re-verify the symptoms, not just the
design.** Everything in this repository's process already re-verifies the _solution's_ citations;
nothing re-verified the _problem's_, and three of them had rotted.

---

## 2026-08-19 — A gate that answered from an `undefined`

**ADR-0097 Landing C M0.** The measurement that withdrew the menu band took **three passes**, and
the two failed passes are worth more than the result.

**Pass 1 said PROCEED with 307 px of slack.** Three faults, all mine:

- The fixture plan was called `Logic` — five characters, **37 px**. `command-surface.md` §5 risk 2
  is, verbatim, _"165 px of slack is thin, and a long plan name eats it."_ I measured the exact term
  a stated risk is about, at that term's most favourable possible value. An ordinary construction
  plan name (`Riverside — Phase 2 Substructure`) measures **227 px**, and that 190 px is most of the
  reversal.
- Menu triggers were identified as **"anything that paints text"**, which swept in both halves of two
  segmented controls and the `finish-chip` read-out — 24 samples, a 25 px chrome spread. Pricing a
  menu from a segment prices the wrong control. The discriminator is `aria-haspopup`, which is what a
  trigger structurally **is**; on that set the spread is **6 px** across five samples, and `view`
  reads 89 px against `m2-item-widths.md`'s 91 px measured two days earlier.
- The verdict was taken from the **median** of that spread. A gate answered from the middle of a
  spread passes on average.

**Pass 2 reported WITHDRAWN — from an `undefined`.** The edit adding `slackAtWidestChrome` to the
report had silently failed to apply, because Prettier had rewrapped the line the find-and-replace was
matching and `str.replace` does not complain when it matches nothing. So the gate evaluated
`undefined >= 120`, which is `false`, which reads as "withdrawn". **The right answer, produced by a
missing number.** Whichever way that lands it is a vacuous gate, and it would have been the third
this session had it not been checked.

The gate now **throws** when it has no number to judge, rather than answering. That is the rule
worth keeping: _a gate that cannot see its own input must refuse, not default_ — because a default
is indistinguishable from a measurement in the report, and "withdrawn" looked exactly as authoritative
as it would have if measured.

**The silent no-op replace is the session's second.** A `docs/TESTING.md` write earlier the same day
also matched nothing, and was reported as done before the loss was noticed. Both were writes not read
back. The habit that follows is cheap and now applied throughout this file's edits: **assert the
match, then read the file back** — a write you did not verify is a claim, not a change.

**What the measurement finally said.** 1619 px against a 1646 px container: 27 px of slack at the
median chrome, **7 px at the worst**, negative from 1440 down. §3.1's strip estimate was right to
within a pixel; its trigger estimate was 47 px light; its identity estimate was 100 px light. Fourth
consecutive epic whose width expectation its own measurement contradicted, and the fourth in the same
direction — an estimate of what a row can hold, made without a browser, comes out optimistic.

## 2026-08-21 — A debt register entry can prescribe a fix that has gone stale

`docs/TECH_DEBT.md` #158 ("the printed and exported diagram is painted on a near-black ground")
carried both a diagnosis and a remedy. The diagnosis was right and had been confirmed by capturing
the downloaded PNG. The remedy — "a `PRINT_GROUND` the function does not read from the DOM at all"
— was **measured before implementing and rejected**.

The register row predates ADR-0102's criticality ladder. Freezing `resolvePrintPalette` to its
existing literals would have shipped **two inverted label pairings**: white ink on the on-schedule
fill at **3.56:1** — the commonest bar in any programme, a WCAG 1.4.3 failure — and near-black on
the warning amber. The light theme had put dark ink on the lightest fill for exactly that reason.
So the prescribed fix would have made the deliverable worse than the state the row was filed
against, while reading as compliance with the register.

**The rule this adds.** `CLAUDE.md` §19 already says to re-verify a spec's PROBLEM statement,
because a problem goes stale when somebody fixes it and the document keeps complaining. This is the
mirror: **a remedy goes stale when the world it was written against moves**, and it goes stale
silently, because nothing re-reads a remedy until somebody implements it. Both halves of a filed
item are claims. #158's diagnosis survived re-verification; its remedy did not.

**What made the difference was one measurement**, twenty lines of throwaway probe resolving the
canvas scope out of `globals.css` and printing live-vs-fallback for every field the print palette
reads. Two of thirty rows came back with a luminance delta of ±0.99 — a complete inversion — and
nothing short of running it would have shown that, because each literal is individually plausible.

**A second, still-live drift was found on the way and the row had not spotted it.**
`PrintSurface.css` pinned three hexes under a comment claiming they were "PINNED to
`resolvePrintPalette()`'s own light fallbacks so the two can't drift". They had. The escape that
comment missed is in its own last sentence: a `@media print` rule cannot read a runtime JS value,
but it **can** read a custom property. Both sides now read one set of `--print-*` tokens.

**And two register rows were stale in the other direction.** #161c and #161d were filed the same
day the release that resolved them shipped — #161d explicitly labelled "the one item here that is a
product-owner question rather than a defect", when the product owner had already been asked and had
already answered. Left standing, it would have sent them a question they had settled that morning.

## 2026-08-21 — The architecture decision inside a debt fix, recorded where it belongs

The entry above this one records a **process** lesson from closing `docs/TECH_DEBT.md` #158 — that
a filed remedy goes stale as readily as a filed problem. That was the transferable finding, and it
is not the architectural call the same commit made. The deferred review pointed out that the call
was living in two docblocks and nowhere a reader would look, which is that commit's own headline
finding — a comment naming its own trigger is not a record — one level up.

So, plainly: **a fourth non-rebound colour token group was introduced.** `--print-ground`,
`--print-ink` and `--print-muted-ink` are declared at `:root`, rebound by no surface scope, and
read by both `resolvePrintPalette()` and the two print stylesheets.

**The alternative was a `[docs]`-worthy sixth surface scope** — `[data-surface="print"]` with a
complete 31-member family, governed by ADR-0097's closure rules like every other scope. It was
costed and deferred, for one reason only: choosing which of the 31 members genuinely differ on
paper is design judgement nobody had done. A second stated blocker — that the image export has no
DOM node to carry the attribute — was **checked and is false**, and is recorded as false in #163 so
it cannot be cited later as evidence the scope is expensive.

**The precedent leaned on was the wrong one, and two reviewers found that independently.** The
justification given was ADR-0077's `--ground`/`--ground-end` pair. But this repo's own written
discriminator is _"if the thing has a semantic sibling in the base vocabulary, rebind it; if it
does not, pack it"_ — and these three have exact siblings. Invoking the _shape_ of a precedent
while skipping the test that authorises it is how an exception becomes a category. The trio is now
enrolled in `OUTSIDE_THE_CLOSURE` under its own `deferredScopes` key, described as what it is: a
surface family truncated to three members, not a pack.

**The accounting gap it walked through is closed.** The closure gate derived its subject from
`@theme inline`, so its real scope was "every colour token exposed as a utility" rather than "every
colour token" — and a `:root` declaration that is never exposed was invisible to it in all four
directions (not rebound, not orphan, not pack, not reset). Measured: 246 colour-ish `:root`
declarations, 182 family-prefixed, 57 exposed, leaving **seven** unaccounted — the four family
roots and these three. A narrow gap, which is why closing it generally was four lines rather than a
project. `token-architecture.test.ts` now sweeps `:root` and requires every colour token to be in a
family or named outside the closure with a reason. There is no third option, which was the point of
computing the closure in the first place.

---

## 2026-08-22 — A shell control whose subject is an organisation is withheld where there is none

> **This decision is now [ADR-0104](adr/0104-a-shell-control-whose-subject-is-an-organisation.md).**
> Promoted on the independent spec check's recommendation and the product owner's ruling: it
> establishes a rule that governs future shell controls, and it carries a Feature Spec, an
> Implementation Plan and three specialist reviews — more than this file is for. The entry stays
> because the ADR is the decision and this is the account of how it was reached, including where
> the author was corrected.

`docs/TECH_DEBT.md` **#165a**. Three of the thirteen authenticated routes are not
organisation-scoped, and the app shell rendered the Project Explorer on all three: ~298 px of
drawer at 1646 saying _"Select an organisation to browse"_ — on `/onboarding`, beside a card asking
the reader to create their first organisation, where there is nothing to select by definition.

**The rule was never missing.** `app-header.tsx`'s below-`lg` Explorer trigger is already
`{shell && orgSlug ? … : null}`. `tool-rail.tsx` already withholds the six organisation
destinations without a slug — and its test is titled _"renders no destinations outside an
organisation — there are none to show"_, forty lines below a Project Explorer button that was
exempt from it. `BrandLink` branches on `orgSlug === undefined` and points at `/`. `OrgSwitcher`
returns `null` with no organisations. **Four correct answers to one question and one wrong one, in
one 48 px rail** — the ADR-0064 §7 / ADR-0093 shape, at the instance where the register's own rule
says extract rather than repeat.

So the shell derives **one fact** — the Explorer has a root — and a second derived from it — a
drawer is on screen — and routes the drawer column, the Escape rung and the below-`lg` `Sheet`
through them, while the **rail derives the same fact from the `orgSlug` it already has**.

That last clause is a correction, made the same day by the component gate and worth keeping rather
than smoothing over. The first attempt passed `explorerAvailable` down as a prop, argued as "the
shell derives it once and both consumers read it" — but the rail already held `orgSlug` and already
derived the identical condition for the destinations one cluster along, so
`<ToolRail orgSlug="acme" explorerAvailable={false} />` typechecked. **Two guards for one fact that
can silently stop agreeing is this row's own defect, moved one level down into a prop list.** One
source, and divergence is unrepresentable.

`NavigatorRail`'s `orgSlug` went the other way and became **required**, for the same reason read
forwards: both production call sites now guarantee one, so the `"Select an organisation to browse."`
fallback was unreachable code carrying the exact sentence the fix exists to remove. Requiring it
turns the shell's guarantee into a compiler check, and the compiler found every fixture.

**Omit, not shade** (ADR-0082). Its third omit clause is this case verbatim — nothing to show at
all, rather than an action shut by a state the reader can change. The objection worth answering is
that a reader on `/account` with three organisations _can_ change the state: they cannot change it
**here**, because picking one in the switcher navigates elsewhere, and that switcher is two rows up
the same rail, unshaded, already being that affordance. A reason sentence would have been the
sentence #165a reports as useless, moved somewhere quieter. The answer is the same on all three
routes, because the discriminator is the **route**, not the reader's account.

**Two rejected shapes, and why.** A fourth `orgSlug ?` at the call site is not an option — it _is_
the defect, and after this fix the same term is needed in four places. Route `staticData` was
rejected on three counts: it encodes an author's intent beside a data requirement and the two can
diverge; it fails silently in both directions on the next route added, whichever way it defaults;
and `staticData` appears nowhere in `apps/web/src`, so it would be a first. `orgSlug`'s presence is
not an inference about intent — every organisation-scoped route carries `$orgSlug` in its path
**and** `ensureOrgMembership` in `beforeLoad`, so the param is the route tree's own statement of
the fact.

**One formulation trap, avoided because it was named before it was written.** The symmetric-looking
derivation `subject === 'explorer' && available` silently deletes an unrelated behaviour: the
drawer falls back to the Explorer when a context registration goes away while `subject` is still
`'context'`, which is a case the shell's own comment exists for. Keying on the active subject would
leave an empty drawer on an organisation route. The term is **availability, not selection**.

**The sharp finding is the Escape rung, and it was proven rather than reasoned.** That rung guarded
on `drawer.collapsed` alone. With the preference set to open and nothing available to show, an
Escape on `/account` called `drawer.collapse()` — which `use-resizable-panel-prefs.ts` persists to
`localStorage` through an effect — and announced _"Project Explorer closed."_ when nothing was
open. The reader's panel preference died on a trip through their account settings, and the evidence
arrived later, on a plan, with nothing saying why. A fix that suppressed the Explorer by collapsing
the drawer rather than by not rendering it would have passed every other assertion and shipped
exactly this. The test asserts `localStorage`, not the screen, because on that route there is
nothing on screen either way: **the write is the whole defect.**

**And the area's own suites used the broken state as their default fixture**, which is most of the
answer to why nobody saw it. `app-shell.test.tsx` mocked `useParams: () => ({})` and then asserted
the Project Explorer navigation IS present — so five of its six cases described the org-less shell,
and every reviewer read them as describing the product. `drawer-entry-point.test.tsx` had the same
default. This is one layer past ADR-0081's finding: not a capability with no entry point, but a
**defect with a suite that pins it**, where the fixture and the defect are the same thing and
nothing can tell them apart from inside.

Two adjacent findings are **filed rather than absorbed** (#168 below-`lg` Escape closing an
invisible drawer; #169 the actions row rendering empty for non-writers), the first because fixing
it would change behaviour on a viewport the new journey does not drive, and both because #165a's
own wording would otherwise read as more closed than it is.

---

## 2026-08-22 — The #165a spec was written after the build, as a check, and it found four things

`docs/TECH_DEBT.md` #165a shipped with a `ui-architect` design pass and three specialist reviews
and **no Feature Spec and no Implementation Plan**. The product owner caught that and ruled one be
produced as a check before merge.

**The sharpest part is not that PROCESS.md was skipped in general.** The parent epic
(`docs/specs/post-theme-consolidation/`) has an approved spec whose own scope table says of W1 —
the milestone that produced #165 — that its output is register rows _"and the work it may generate
is **specified after it runs**"_. #165a is exactly the work W1 generated. The approved document
commits in writing to specifying it, and that step was skipped.

**How it was made a check rather than a rubber stamp.** `feature-analyst` ran in an isolated git
worktree pinned to `52b6003`, the commit before any of this work — so it could read the problem, the
register row and the original code, and could not read the solution. A spec written with the
solution in view rationalises it; that is the whole reason for the worktree.

**It reached the same core design independently**, which is what makes the exercise worth anything:
omit rather than shade, the same rule on all three routes, reject rooting the Explorer at the
last-active organisation, and no `VITE_` flag. It also independently found **both** of the
implementation's two sharpest discoveries — that `drawer.collapse()` would persist a collapse the
reader never asked for, and that `app-shell.test.tsx` mocks `useParams: () => ({})` and then asserts
the Explorer **is** present, so the suite pinned the defect.

**Three of its arguments are better than the ones that were shipped, and are adopted:**

1. **Why the same rule on all three routes** — not "the route is the discriminator" as a principle,
   but a mechanical fact: memberships come from `useOrganizations()`, a **query**, so a
   membership-keyed rule is a _deferred_ rule. The shell would paint without the panel and add it a
   beat later, moving ~298 px on every `/account` load.
2. **Why omit rather than shade** survives ADR-0083, which drew the **opposite** conclusion for form
   fields. The generalisation that settles both: _shade what the reader came to read and cannot act
   on; omit what has no content at all._
3. **Why rooting the Explorer at the last-active organisation is wrong** — it breaks ADR-0029's
   stated invariant that selection is a pure projection of the URL, so the tree and the switcher
   40 px away would disagree about which organisation you are in. And it cannot help `/onboarding`
   at all, so the withholding rule is needed regardless, leaving two rules discriminated by a fact
   the reader cannot see.

**Four things it found that the implementation had missed. Two are fixed here.**

- **The cause was still in place under a fixed symptom.** `app-shell.tsx` called
  `useExpansionState(orgSlug ?? '')`, so every org-less route wrote a
  `schedulepoint-nav-expanded:` key — expansion state for **an organisation named empty string**.
  The shell did not model the absence; it modelled a blank presence, and each consumer then degraded
  on its own. That is #165a's actual cause, and withholding the Explorer without it would have fixed
  what a reader sees and left what the shell believes. `orgSlug` is now `string | undefined` through
  the hook, with no read and no write when it is absent. Regression test verified red.
- **The persistence assertion was too weak.** It checked the resting value, and a rule that
  collapsed and then restored would leave `collapsed: false` on disk having written `true`. It now
  spies `Storage.prototype.setItem` and asserts no write names a collapse at all.
- **`#165(b)`'s photograph is now stale** and must be re-shot rather than designed from — widening
  `<main>` on `/me/activity` changes the layout that row describes. Recorded on the row.
- **`schedulepoint-active-org` is never cleared and carries no user id** — found while costing the
  rejected option. Filed as **#171**; it is the rule ADR-0098 set deliberately for its sibling,
  decided the other way by accident rather than by argument.

**Two of its open questions are answered here rather than left.** The six organisation destinations
stay withheld on `/account` and `/me/activity` (CQ-4) — that is **entailed** by rejecting the
last-active-organisation rooting, since the destinations need a slug for exactly the same reason the
tree does, and the same objection applies. And the brand tile's `/` on `/onboarding` resolving back
to `/onboarding` (Q-5) is a correct self-link: the home resolver sends a reader with no organisation
there, which is where they already are.

**One of its proposed tasks is deliberately NOT built, and the reason is in the fix's favour.** The
plan carries an `M0-T3` structural gate to catch a fourth org-less route arriving later without the
rule. That gate is unnecessary here, because the rule is **derived from the route param rather than
from a list**: `explorerAvailable` is `orgSlug !== undefined`, so any route added under `_authed`
without an `$orgSlug` is covered the day it is written, with nobody remembering anything. Checked
rather than assumed — of the 14 routes under `_authed`, exactly four lack the param (`/`, which only
ever redirects, plus the three this row is about), and a future one would inherit the behaviour by
construction. The failure direction is also the safe one: a route whose param were named differently
would withhold the Explorer rather than wrongly show it. Recorded so the gate is not built later on
the strength of a plan written without sight of the shape.

**One question is left open on purpose**: the check recommends a short **ADR** rather than this
entry, on the ADR-0093 precedent. That is the product owner's call, not the author's — an ADR is permanent and
this establishes a rule without adding a gate. Recorded as a disagreement rather than resolved
quietly.
