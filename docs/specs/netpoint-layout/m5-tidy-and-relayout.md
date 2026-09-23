# NetPoint-layout M5: Tidy and Re-layout

**Status:** Landed 2026-09-23. Spec §4.8; plan "Milestone M5: Tidy and Re-layout". ADR-0152.

This file records what M5 built, how it was checked, and where the build departed from the plan.

## What shipped

- **`ArrangeDialog`** replaces the `ConfirmDialog` that `Arrange` opened. It has these states:
  - **Computing:** a polite progress sentence, and Confirm shaded with its reason.
  - **Ready:** Tidy is preselected. Each option shows five figures, before and after.
  - **Nothing to do:** said once in the status, not as two options each saying "nothing would move".
  - **Bounded:** above 300 drawn activities, Tidy is shaded with the reason and Re-layout is
    preselected.
  - **Error:** an alert, with Confirm shaded.
  - **Writing:** Confirm reads "Arranging…" and is `aria-busy`.

  Confirm is `aria-disabled` with its reason linked, never native `disabled` (ADR-0145).

- **`RadioCardGroup`** (`components/ui/radio-card-group.tsx`) is a new shared primitive: the APG
  radiogroup as stacked cards, each carrying a description and a `<dl>` of figures. The component
  review before M4 chose it over stretching `SegmentedControl`, whose options are labels only.
- **`use-arrange-search.ts`** runs Tidy, then Re-layout, in the M4 module worker while the dialog is
  open, and aborts when it closes. Each result is tagged with the input it answers, so a new opening
  reads as computing without an effect resetting state.
- **The offer** (`arrangeOfferMessage`) now appears only when activities overlap in their rows and
  names the count. Its button reads **Arrange…** and opens the dialog.
- **The write** sends exactly the moves the chosen option showed, through the existing positions
  batch, as one `autoArrangeCommand` and therefore one undo step. The announcement names the option
  and the count.

## How it was checked

| Check                                                   | Result                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArrangeDialog.test.tsx`                                | Every state, set directly: computing, ready, a chosen option that moves nothing, nothing to do, bounded, bounded and already packed, over the batch cap, error, writing. The batch-cap case was verified red with the cap raised.                             |
| `radio-card-group.test.tsx`                             | Roving tab stop, Arrow/Home/End with wraparound, Space/Enter, a disabled option that is a stop but is never selected, the reason replacing the figures.                                                                                                       |
| `TsldPanel.arrange-offer.test.tsx`, `.editing.test.tsx` | The offer's predicate and copy; the dialog opened from the toolbar and from the offer. Both mock the worker with `in-process-optimise.ts`, because jsdom has no workers.                                                                                      |
| `e2e-arrange/arrange.spec.ts` (12 of 12)                | Against a real API with the pen enforced: the offer, Tidy removing an overlap with one undo restoring it (read back through the API), Re-layout, an already-arranged plan, the offer omitted without the pen, a real `.xer` import staying silent, and focus. |
| `e2e-csp/csp.spec.ts`                                   | A new case opens Arrange on a real plan under the **production** Content-Security-Policy and records no violation. This is the application's first Web Worker, and M4 could not run it in a browser because nothing called it yet.                            |

## Reviews before release (§19.13)

- **UX, blocking, folded:**
  - Tidy's description promised "fewer links hidden behind bars and fewer crossings". The search is
    lexicographic, so a move that removes an overlap can leave crossings where they were, and the
    card's own figures could then contradict its sentence. It now states the order it works in and
    the one thing it guarantees: "remove overlaps, then links hidden behind bars, then crossings. It
    never adds rows." Pinned by a test that also refuses the old promise.
  - The description never mentioned overlaps, the problem the offer names. Folded by the same edit.
  - The already-arranged departure from US-2 was unrecorded. It is recorded below and in the spec.
  - Suggestion taken: a bounded plan with nothing to pack said "neither option would move
    anything" beside Tidy's reason, which reads as a claim about Tidy. It now says "Already packed:
    Re-layout would move nothing."
- **Component, blocking, folded:** `RadioCardGroup` was missing from `docs/COMPONENT_LIBRARY.md` and
  `docs/DESIGN_SYSTEM.md`. Both now have it. Also taken: `setPicked` renamed to match its state, and
  a comment on why a shaded card keeps pointer events. The roving-tabindex logic is **not** extracted
  and shared with `SegmentedControl` yet, because the two differ in a real way (a disabled stop needs
  separate focus state). Extract it when a third radiogroup needs it.
- **Accessibility, two blocking findings, one folded and one declined:**
  - **Folded: the progress count flooded the live region.** It changed every 25 evaluations,
    about every 60–120 ms, and a polite region queues rather than interrupts, so a screen
    reader could still be reading stale counts seconds after "Both options are ready" was true
    (WCAG 4.1.3). The region now names the phase only. The count is shown beside it as plain text
    outside the region, so there is no clock to throttle by. A test asserts the region's text
    does not change as the count grows. It failed against the old dialog.
  - **Declined: removing `pointer-events-none` from Confirm while it is shaded for a standing
    reason.** The review cited a rule in `CLAUDE.md` that shading by a standing condition must
    keep the control pointer-reachable. No such rule exists there (checked by searching the
    file). `docs/DESIGN_SYSTEM.md`'s button ruling requires the class pair on every
    `aria-disabled` button, because Tailwind's `disabled:` variant fires only on the native
    attribute. The reason sits as visible text directly under the button and is linked to it, so
    nothing is lost by the pointer passing through. `LinkChainDialog` does the same.
  - **Suggestions noted, not built:**
    - When a plan turns out to be over the size limit, the roving stop can stay on the now-shaded
      Tidy card rather than follow the checked one. This matches ADR-0082 (a shaded option stays
      a stop) but has no test.
    - The `→` in the figures is read by screen readers in ways that were reasoned from
      specification, not observed. `RevisionChangesView` already ships the same convention.

## Departures from the plan

- **An already-arranged plan opens the dialog.** US-2 said "Already tidy" would be announced with no
  dialog left open, as the old rule did. That rule answered cheaply because "nothing to move" meant
  "the pack equals the rows". Tidy's answer is the result of a 0.5–5 s search, which the render path
  cannot afford (FC-N2 (a), failed by 32×). So the dialog opens, shows its progress, and says
  "Already arranged" with Confirm shaded. US-2 is amended in the spec.
- **The offer predicate is overlaps only.** FC-N2 (a) failed, so its committed consequence applies:
  hidden links are counted in the dialog, never on the render path. The `e2e-arrange` import case
  stays silent for the right reason, since an imported plan is packed and therefore overlap-free.
- **The import control is unchanged.** The plan's journey step 2 said to import a `.xer` and choose
  Re-layout. An imported plan has no overlap, so a planner would not be offered anything there, and
  the journey instead proves the offer's silence on a real import. Re-layout is driven on a seeded
  plan with scattered rows.
- **Focus moves to the diagram listbox before the dialog opens, inside `openAutoArrange`.** A native
  `<dialog>` restores focus on close to whatever held it when `showModal()` ran. The plan said "on
  confirm", but from the toolbar that returned focus to the Arrange button, which the journey caught.
  Moving focus first makes every exit (confirm, cancel, close) land on the diagram (ADR-0149 D8).
- **Confirm is shaded above 2,000 moves.** The positions batch accepts at most 2,000 rows
  (`update-positions.dto.ts`, `@ArrayMaxSize(2000)`), and the plan named this risk. It was added
  before release with a red-verified test.
- **The primitive weight ceiling rose from 25 to 26.** `RadioCardGroup`'s card title is
  `font-medium`, the one weight in the primitive. A weight on the figures was tried and removed as
  decoration. The ceiling's comment records why.

## What is still owed

- The after-epic paint reading on the product owner's hardware (M0-T6, M6).
- The M6 gate pass over the combined M1–M5 diff.
