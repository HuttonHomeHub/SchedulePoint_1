# Graphite M6 — the drawer as the activity context

**Status:** planned (T1 shape decided against the code) · **ADR:**
[ADR-0099](../../adr/0099-graphite-the-workstation-in-rail-chrome.md) · **Follows**
[`m4-context-drawer.md`](m4-context-drawer.md) (the shell) and
[`m5-command-strip.md`](m5-command-strip.md)

## What this milestone is, stated as a constraint rather than a feature

ADR-0099 says the trailing drawer **replaces the modal activity dialog**. The dialog it replaces is
`ActivityEditorDialog` — **793 lines**, four tabs, four independently-dirty write scopes, and a
discard confirmation whose blast radius is the reason ADR-0060 chose per-scope save at all.

So the milestone's first act is not to build a drawer panel. It is to **extract, not
reimplement**, and the proof condition is written before the work:

> **All eight `ActivityEditorDialog.*.test.tsx` files pass unchanged.**

That is ADR-0062's bar, and it exists for a reason this repository has already paid for: a
reimplemented panel and its dialog **each look right alone**, and only a reader who opens the same
activity two ways ever sees one is a version behind.

(The plan said "nine". There are eight: `convergence`, `flag-off-round-trips`, `members.flag-off`,
`members`, `resources-matrix`, `round-trips`, `sub-day`, and the base `test`. Counted rather than
carried — ADR-0076 Class 1, and cheaper to catch here than in the definition of done.)

## The shape, decided by reading the code rather than from the shape it looks like

The obvious split — a `<Dialog>` wrapping an `<ActivityEditorBody>` — **does not compose**, and the
reason is one line in the primitive. `Dialog`'s `confirmBeforeClose` (`ui/dialog.tsx:49-57`) does
exactly one thing: it stops the native `<dialog>`'s `cancel` from tearing the element down before
`onClose` has had a say. **It hosts no confirmation of its own.** The confirmation is the editor's:
`requestClose` reads `dirtyScopeNames`, derived from three `useScopeForm` results, which live in the
body. So a body nested inside a `<Dialog>` cannot hand its own `requestClose` up to that dialog's
`onClose` prop — the wrapper needs a value the child computes.

So the split is a **hook plus a presenter**, not a wrapper plus a child:

```
useActivityEditor(props)  ->  { requestClose, confirmingClose, tabs, facts, saveScope, ... }

ActivityEditorDialog   =  const editor = useActivityEditor(props)
                          <Dialog onClose={editor.requestClose} confirmBeforeClose ...>
                            <ActivityEditorBody editor={editor} ... />
                          </Dialog>

drawer subject 'activity' =  const editor = useActivityEditor(props)
                             <ActivityEditorBody editor={editor} ... />   <- no Dialog at all
```

`ActivityEditorBody` owns the `ContextStrip`, the tab rail, every scope panel, and the discard
`ConfirmDialog` — that last one deliberately, because the drawer needs it as much as the modal does
and a confirmation rendered by the _wrapper_ would be the one thing the drawer could not inherit.
`Dialog` keeps only what a **modal** contributes: the backdrop, the focus trap, the top-layer
promotion and the Escape reflex.

The hook returns a wide object, and that is accepted rather than worked around. The alternative —
letting the body register its `requestClose` upward through a ref — makes the close guard depend on
commit ordering, which is the class of bug ADR-0092 records the drawer outlet paying for twice.

## Three things the drawer does NOT inherit, each a decision

1. **Focus containment.** A modal traps focus because nothing behind it is usable; a drawer's whole
   premise is that the stage beside it _is_. Trapping focus in a persistent panel is a keyboard
   trap — WCAG 2.1.2 — not a stricter version of correct.
2. **Focus moving in on open.** `m4-context-drawer.md` already settled this for the Explorer: the
   subject changes as the planner selects bars on the canvas, and stealing focus each time makes
   the canvas unusable. An activity subject changes on _every selection_, so the rule matters more
   here, not less.
3. **The backdrop.** There is nothing to dismiss by clicking away from.

## What it DOES owe, and this is the sharp one

`confirmBeforeClose`. Up to four scopes can be independently dirty, and in the drawer the ways to
lose them **multiply** rather than reduce:

| Route out                    | Modal today        | Drawer                                                                                                                               |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Close button                 | guarded            | must be guarded                                                                                                                      |
| Escape                       | guarded            | must be guarded — and it is ADR-0080's **outermost** rung, so the guard has to sit above the drawer-close rung rather than beside it |
| Backdrop click               | guarded            | n/a                                                                                                                                  |
| **Selecting another bar**    | **impossible**     | **new, and unguarded by anything today**                                                                                             |
| **Switching drawer subject** | n/a                | **new**                                                                                                                              |
| Navigating away              | unguarded (as now) | unguarded (as now)                                                                                                                   |

The last two are the milestone's real work. A modal makes "change the subject" impossible by
construction; a drawer makes it a click on the canvas. **`requestClose` is therefore not enough —
the guard belongs on the subject transition, not only on the close.** Whatever shape that takes, it
must be one guard both hosts route through, because two copies of a discard rule is how one host
gets a fix and its neighbour does not (ADR-0064 §7, recorded five times in this register).

## Sequence

| Task                                                                                         | Ends with                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **T1** Extract `ActivityEditorBody`; `ActivityEditorDialog` becomes a thin wrapper           | All eight suites pass **unchanged**. Any suite needing an edit means the extraction changed behaviour — stop and find out why |
| **T2** `DrawerSubject` gains `'activity'`; rail button; empty state when nothing is selected | `tool-rail.test.tsx` covers the new button's pressed state; the empty state is explicit, never the last activity's stale data |
| **T3** The subject-change guard                                                              | A test that dirties a scope, selects another bar, and proves the edit is not silently discarded — **verified red first**      |
| **T4** Entry points re-pointed: the three ADR-0060 intents open the drawer                   | The modal path stays available and tested until T5 decides otherwise                                                          |
| **T5** Decide the modal's fate, with the numbers                                             | Either it is deleted (and its suites move to the body) or it stays with a written reason. Not left ambiguous                  |

## Gates

`pnpm lint && typecheck && test` · `scripts/e2e-local.sh web` (the base journey) ·
`scripts/e2e-local.sh web:activity-editor` · `web:wbs` · `web:copy-paste` (all three drive the
editor) · `node scripts/shoot.mjs --width 1646`. Per plan.md's sweep table this is a **targeted**
milestone, not a sweep one — M10 is the backstop.
