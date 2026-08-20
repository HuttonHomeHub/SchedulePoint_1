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

### Corrected after reading the rest of the file: a `shell` render prop, not a hook plus a presenter

The hook-plus-presenter sketch above was written after reading the file's first 400 lines. Reading
the remaining 350 changed it, and the reason is worth keeping: the render body touches **~25**
locals — `announce`, `update`, `active`/`setActive`, `saveError`, `savedScope`, `confirmingClose`,
three `useScopeForm` results, `hoursPerDay`, `seedFactor`, `scopeCalendarId`, `type`,
`parentOptions`, `dirtyScopeNames`, `requestClose`, `scopeError`, `saveScope`, `tabs`, `facts`,
`railFits` — so a hook boundary means a 25-field object threaded through a prop and kept in step by
hand. That is a lot of surface to buy one thing: letting the wrapper see `requestClose`.

**Inverting the control buys the same thing for nothing.** One component keeps every hook exactly
where it is today and takes a `shell` render prop:

```
function ActivityEditor({ shell, ...props }) {
  /* every hook, unmoved */
  return shell({ requestClose, title, description, children: <>...</> });
}

ActivityEditorDialog =        shell -> <Dialog onClose={requestClose} confirmBeforeClose ...>
drawer subject 'activity' =   shell -> <>{children}</>          <- no Dialog at all
```

No wide object, no ref dance, one source of truth, and the drawer's shell is a passthrough. The
"must not inherit focus containment" rule then holds **by construction** rather than by discipline:
the drawer's shell renders no `<Dialog>`, so there is no trap to opt out of.

`ActivityEditorDialog` keeps its exact public signature either way, which is what makes the proof
condition — eight suites unchanged — mean the same thing under either shape.

## T2's decision: the shell offers a slot, never an activity

`tool-rail.tsx:13` already draws the line this milestone has to respect:

```ts
/** The drawer subjects the shell itself owns. Plan-scoped subjects arrive with the plan. */
export type DrawerSubject = 'explorer';
```

An activity is plan-scoped, and ADR-0029's rule is that the shell mounts once and knows nothing
about plans. So `DrawerSubject` must **not** grow an `'activity'` literal — that string in the shell
_is_ the shell knowing what a plan is, and it would be the fourth epic to put a plan concept into
chrome written to avoid exactly that.

Instead the shell gains one generic second subject — a **registered context subject** — and stays
ignorant of what fills it:

- **Content travels by portal**, reusing `ChromeSlot`'s established mechanism with a third name.
  Its own docblock already licenses this: _"a third slot costs a string"_, and the `rail` name was
  added in M5 for the same reason one column along. So `ChromeSlotName` becomes
  `'rows' | 'rail' | 'drawer'`, and the plan's editor stays exactly where it is in the **React**
  tree while only its DOM node moves — which is what lets it keep reading `usePlanWorkspaceModel`
  and the ADR-0060 gating without any of that crossing the boundary.
- **The label and title travel by context**, because they are data the shell must render (a rail
  button's accessible name, the drawer's `<h2>`) rather than markup it can host. A portal cannot
  carry them; a two-field context can.
- **The rail button exists only while something is registered.** No registration, no button — the
  same contract `empty:hidden` gives the rail slot on the twelve screens that are not a plan.

The alternative — one registration carrying a `render()` the shell calls — was rejected: it reads
tidier and it runs the plan's hooks inside the shell's tree, which inverts the ownership the portal
exists to preserve.

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
