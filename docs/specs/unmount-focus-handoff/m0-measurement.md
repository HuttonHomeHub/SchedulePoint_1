# M0 — Measure and falsify

**Run:** 2026-09-11, `scripts/e2e-local.sh --db-only` then
`pnpm --filter @repo/web measure:toolbar --grep "M0-T2|#204"` — 6 passed (2.0 m), Chromium,
1646 × 1000. The grep also matched three unrelated `M0-T2` probes from other epics; they are
reported here only because they ran, and nothing in this document reads them.

Ports were checked clear before the run (`reuseExistingServer` is true outside CI, the ADR-0099
incident), and the database was brought up through `scripts/e2e-local.sh --db-only`.

---

## F3 — what has focus inside the layout effect of the removing commit (M0-T2)

The design's detection point. §4.8 **reasoned** the answer; the plan forbids M1 starting on a
reasoned answer, so it was observed.

`apps/web/measure-output/unmount-focus-commit-order.json`:

```json
{
  "measuredAt": "2026-09-11T10:38:16.074Z",
  "beforeFlip": "BUTTON#probe-target",
  "wasFocusedBeforeFlip": true,
  "inLayoutEffect": "BODY",
  "inAnimationFrame": "BODY",
  "verdict": "F3 HOLDS — by the layout phase of the removing commit the browser has already moved focus off the detached node, so a `useLayoutEffect` read can see the drop. The design may detect there."
}
```

**F3 HOLDS.** By the layout phase of the removing commit the browser has already reassigned focus
to `<body>`, and it is still there one animation frame later. So the hook may detect in a
`useLayoutEffect` and `feature-spec.md` §4.6 needs no amendment; the `onBlur`-based fallback the
plan reserved is not needed.

Two things about **how** it was measured, because both are traps the plan names:

- The node is removed by a **React state change**, not `el.remove()`. A direct DOM call measures a
  case React never produces, and would have answered a question nobody asked.
- The probe is loaded through Vite's `/@fs/` route from `apps/web/measure-toolbar/`, so it runs
  against the **app's own React** — there is no second copy on the page, and no file in
  `apps/web/src` that nothing imports.

`wasFocusedBeforeFlip` and `beforeFlip` are asserted before the reading is believed: without them a
run that never focused its target would report `BODY` and look like a pass.

---

## F1 and F2 — the two-context probe (M0-T1)

`apps/web/measure-output/techdebt-204c-mode-flip-focus.json`, `peerPatch` elided:

```json
{
  "measuredAt": "2026-09-11T10:39:44.141Z",
  "serverModeAfterPatch": "EARLY",
  "planReadsByReaderAfterFlip": 1,
  "transition": "simulated — headless Chromium fires no visibilitychange on bringToFront",
  "controlStillPresentOnReadersPage": false,
  "barStillPresentOnReadersPage": true,
  "focusBefore": { "tag": "BUTTON", "name": "Clear visual start", "isBody": false },
  "focusAfter": { "tag": "BODY", "name": "Skip to main content…", "isBody": true },
  "verdict": "FOCUS DROPPED TO BODY — WCAG 2.4.3, the hazard is real. The BAR survived the item (F2 holds): this is the per-item case, and the container is there to catch focus."
}
```

**F1 PASSES.** `planReadsByReaderAfterFlip: 1` — the reader's client really re-asked the server, so
this is a statement about the product and not about the instrument.
`controlStillPresentOnReadersPage: false` and `focusAfter.isBody: true`.

**F2 HOLDS, and the epic is confirmed rather than withdrawn.** `barStillPresentOnReadersPage: true`
is the field M0-T1 added, and it is the kill switch: had the whole `role="toolbar"` gone, the case
would belong to `SelectionActionsBar`'s existing whole-bar `restoreFocus` cleanup
(`selection-actions.tsx:953-962`) and a shared roving-container hook would have been the wrong
remedy — a fifth answer to a case the product already answers.

§4.8 had **reasoned** this from `focusAfter` naming `BODY` rather than the canvas listbox. That
inference was correct, and it is now a direct reading of the bar's own presence, located by role and
name (`getByRole('toolbar', { name: /^Actions for / })`) rather than by copy.

---

## M0-T3 — the enumeration, re-derived rather than trusted

Two commands, run on the day the work started.

```
rg '<Toolbar\b|<Deck\b' apps/web/src --glob '!*.test.*'
rg 'isVisible:'         apps/web/src --glob '!*.test.*'
```

**Drift found, and it is against the spec.** `implementation-plan.md` M0-T3 and §M2's outcome both
say **four** production mountings. There are **three**:

| mounting                          | primitive | accessible name          |
| --------------------------------- | --------- | ------------------------ |
| `plan-workspace-toolbar.tsx:1799` | `Toolbar` | `Plan mode and view`     |
| `plan-workspace-toolbar.tsx:1893` | `Deck`    | `Plan commands`          |
| `selection-actions.tsx:1034`      | `Toolbar` | `Actions for <activity>` |

Cross-checked from the other direction: `rg 'role="toolbar"' apps/web/src --glob '!*.test.*'`
returns the two primitives' own containers (`Toolbar.tsx:287`, `Deck.tsx:249`) and no third
implementation, so there is no container the first command could have missed.

**It changes nothing about the design and the plan is corrected rather than the finding rounded
away.** §4.2's stated reopening threshold is an enumeration that "shrank to one container"; three
mountings across two primitives still carries the argument for a shared hook, and the `Deck` still
has the hazard. The four/three discrepancy is most likely the plural selection bar, which does not
exist as a separate `role="toolbar"`.

The **17** `isVisible:` declarations in `selection-actions.tsx` and `tsld-toolbar-items.tsx` are
unchanged from the spec's count.

---

## An instrument failure worth recording, in the thing watching the instrument

The first attempt to read F1/F2 polled for `measure-output/techdebt-204c-mode-flip-focus.json` and
found it **immediately** — carrying a `measuredAt` of `07:41` from an earlier run and, tellingly,
**no `barStillPresentOnReadersPage` field at all**, because that field had been added minutes
earlier. Had the field happened to be one the previous run also wrote, the stale reading would have
been indistinguishable from a fresh one.

That is precisely the hazard `output.ts`'s `clearMeasurement` docblock exists to describe — _"a run
that dies leaves its LAST answer on disk, and a reader cannot tell"_ — occurring one level up, in
the wait condition watching for the answer rather than in the harness producing it. The correct wait
is on the **process**, not on the file. `clearMeasurement` did its job: it deletes at the top of the
test, so the stale file was gone the moment the real test started.

---

## Verdict

| #   | Condition                                    | Result                                           |
| --- | -------------------------------------------- | ------------------------------------------------ |
| F1  | The harness reaches its condition            | **PASS** — 1 plan read, control gone, focus body |
| F2  | The bar survives the item                    | **HOLDS** — epic confirmed                       |
| F3  | `activeElement` is body in the layout effect | **HOLDS** — detect there; §4.6 stands            |

**M1 may start.**
