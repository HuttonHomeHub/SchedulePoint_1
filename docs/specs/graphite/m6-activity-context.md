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

### Corrected at M10: three of those six rows were wrong, and in both directions

The table above was written from an analogy — _a modal loses its scopes when it closes, so a drawer
must too_ — and the M10 gate pass established that the analogy does not hold. It is left in place
rather than edited, because the correction is more useful than a tidy table.

- **Close button and Escape do NOT need guarding.** The editor's hooks live in `ActivityEditor`,
  above the `shell` call, so a portal returning nothing unmounts the rendered fields and **not the
  component**; RHF does not unregister fields by default, so the draft is still there when the panel
  comes back. This file already says exactly that about a _different_ route two sections down ("safe
  by construction"), and nobody applied it to these two. Now pinned by
  `ActivityEditor.drawer-chrome.test.tsx` — if it ever goes red the table was right and a guard is
  owed. Verifying the claim rather than trusting the document is ADR-0058's rule; the document here
  was this one.
- **`Navigating away` is unchanged and stays unguarded**, as stated.
- **What the table missed entirely is focus.** Both of those routes unmount the element the reader
  has just pressed, and a browser drops focus from a removed element to `<body>` — WCAG 2.4.3, and
  the third instance of that class in this register. Fixed by handing focus to the rail button, which
  survives the transition and is _about_ the panel that went away.

The last two rows are the milestone's real work. A modal makes "change the subject" impossible by
construction; a drawer makes it a click on the canvas. **`requestClose` is therefore not enough —
the guard belongs on the subject transition, not only on the close.** Whatever shape that takes, it
must be one guard both hosts route through, because two copies of a discard rule is how one host
gets a fix and its neighbour does not (ADR-0064 §7, recorded five times in this register).

## What T2 ships, and what it deliberately does not

**Entry points** (ADR-0081: a milestone names them or declares itself dark):

- The tool rail's **Activity details** button opens the drawer on the activity subject.
- The canvas selection bar's **Edit** — and the other two ADR-0060 intents — fill it.
- With nothing selected the drawer says so explicitly, and renders **no editor at all**.

**~~The activities table's row menu still opens the modal.~~ Closed by T4.** The table held its own
`editorIntent` and mounted its own `ActivityEditorDialog` beside the workspace's — two mounts, two
sets of scope forms and two dirty states for one activity, and after T2 also two different chromes
for the same Edit. Its own comment called it "the table's ONE editor", which was true of the table
and false of the plan.

It now mounts none, and `onOpenEditor` is **required** rather than optional: an optional seam lets a
host mount the table and silently leave four row actions doing nothing, and the compiler is a better
reviewer than a convention. The cost was 19 stub props across 17 suites and one real rewrite —
`activity-editor-entry-points.test.tsx` asserts the _whole chain_ (a row action reaches one editor on
the right tab), so it grew a five-line host rather than losing its assertions. Testing the callback
alone would prove the door opens and nothing about the room.

Dropping the mount also orphaned `calendarsError`, a prop the table only ever forwarded. Removed
rather than left as a prop with no consumer.

### What the browser found, and what I got wrong diagnosing it

Driving the real product turned up one thing worth fixing and one wrong diagnosis, and the wrong one
is recorded because it is the more instructive.

**The labelling fix, which stands.** The rail button was called **Activity**, which collides with the
Add split-button's caret (`Activity type: Task`) under any substring match — the probe hit it
immediately as a strict-mode violation. It is now **Activity details**, and the better reason is not
the collision: a rail button should say what pressing it _shows_, as "Project Explorer" beside it
does. A bare noun names the subject, not the panel.

**The wrong diagnosis.** I saw a modal `<Dialog>` open while the drawer was on screen and concluded
that `useDrawerSubject` was unregistering its subject on every change — a cleanup returned from the
registering effect runs on each dependency change, so a new `title` would null the registration for
one commit, flip the shell's `showingContext`, and flip the editor's chrome. I wrote that up as a
found defect. **Then I could not make a test fail against it.** React batches the cleanup's
`register(null)` with the effect's re-registration into one commit, so no render ever observes the
`null`. The real cause was that my probe clicked the **activities table's** editor — the second
mount named above — rather than the workspace's, which the instrumented render log then showed had
never received `open: true` at all.

The two-effect split is kept, on a smaller and honest argument: it is what the code _means_. This
hook unregisters when its route goes away, and expressing that as a dependency-change cleanup relies
on a batching detail to keep a wrong statement harmless. It is not kept on the strength of a defect
it did not fix.

Same for the icon: `icon: <Info … />` in a dependency array is a new element every render, which is
a register → setState → re-render loop. **Reasoned, not observed** — the one call site hoists it to
a module constant, so the loop was never reachable. Held in a ref so it is unreachable for the next
caller too.

Two claims corrected rather than quietly dropped, in the milestone that made them (ADR-0076 Class 3).

## Sequence

| Task                                                                                         | Ends with                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** Extract `ActivityEditorBody`; `ActivityEditorDialog` becomes a thin wrapper           | All eight suites pass **unchanged**. Any suite needing an edit means the extraction changed behaviour — stop and find out why                                                    |
| **T2** `DrawerSubject` gains `'activity'`; rail button; empty state when nothing is selected | `tool-rail.test.tsx` covers the new button's pressed state; the empty state is explicit, never the last activity's stale data                                                    |
| **T3** The subject-change guard — _landed_                                                   | Four cases, three of them verified RED against the pre-guard component; the fourth pins unchanged behaviour and passes both ways, which is stated rather than counted as a proof |
| **T4** Entry points re-pointed: the three ADR-0060 intents open the drawer                   | The modal path stays available and tested until T5 decides otherwise                                                                                                             |
| **T5** Decide the modal's fate, with the numbers                                             | Either it is deleted (and its suites move to the body) or it stays with a written reason. Not left ambiguous                                                                     |

## T3, as built

The editor holds a **`seededId`**, and renders the activity that id names rather than the one the
host is currently offering. When they differ:

- nothing dirty ⇒ adopt immediately, adjusted during render (the pattern this file already uses for
  `seenIntent` — an effect would paint the new subject and then take it back);
- work outstanding ⇒ keep rendering the old subject and raise the existing discard confirmation,
  which now names **where the work is going** ("Switching to Pour slab will discard them") because a
  discard prompt that does not say what you are switching to cannot be answered.

`Discard` adopts. **Keep editing** holds the subject _and_ calls `onSubjectHeld(heldId)`, so the host
can put its selection back — without it the drawer would go on editing one activity while the
diagram highlights another, which is two surfaces disagreeing about what the reader is working on.
The id is held, never the row: the editor reads `version` from the **live** row at submit time,
which is what makes a two-scope session work, and a snapshot would go stale on the first save.

**Sequencing, stated honestly: nothing changes the subject under the editor yet.** The drawer does
not follow the canvas selection until T4. The guard and its host wiring land first deliberately — a
guard that arrives with the path it guards is a guard somebody has to remember to add, and this
register records that shape (ADR-0064 §7) more often than any other.

**Switching drawer subject is a third route and it is safe by construction**, which is worth stating
because the plan listed it as a hazard: the editor's hooks live in `ActivityEditor`, above the
`shell` call, so the portal returning `null` unmounts the rendered fields and not the component.
RHF does not unregister fields by default, so the draft is still there when the subject comes back.

### A finding from building it

`ConfirmDialog` had no `cancelLabel`, and the first version passed one through a conditional spread:
`{...(confirming === 'subject' ? { cancelLabel: … } : {})}`. **Typecheck accepted it** — a
conditional spread widens to `{}` in one branch, so TS never checks the other — and the button
rendered "Cancel" while the code said otherwise. The same widening ADR-0074 records for
`...(FLAG ? [route] : [])`. The prop now exists and is passed directly.

## T5 — the modal's fate, and the numbers that decided it

Three counts, taken rather than reasoned:

| Question                                      | Answer                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| Production mounts of `<ActivityEditorDialog>` | **0**                                                                           |
| Test files mounting it                        | 11                                                                              |
| Viewports that get the modal                  | **every one below 1024** — the drawer is `hidden lg:flex` (`app-shell.tsx:346`) |

**So the modal stays, and the question the plan asked turns out to be the wrong one.** "Delete it or
keep it" assumes the modal is a legacy path. It is not: it is the chrome for every narrow viewport,
because a drawer needs width the shell will not spend below `lg`. Deleting it would leave the editor
unreachable on a tablet in portrait.

**What the numbers did find is a duplication I introduced in T2.** `PlanActivityEditor` built its own
inline `<Dialog>` rather than reusing the wrapper's — two definitions of the modal chrome, in the
epic that keeps removing exactly that. One exported `modalShell(open)` factory now serves both. It is
a **factory returning a called function**, not a component: the workspace swaps `shell` between it
and the drawer portal, and swapping two _components_ would remount the editor and take the scope
forms' unsaved state with it. That is what T1's render prop bought, and it is why the returned
function is named (`react/display-name` cannot tell a called render function from a mounted one, and
neither can a stack trace).

`ActivityEditorDialog` therefore has **zero production callers** and is kept as the tested public
composition. Recorded in its own docblock rather than left for a reader to discover — a component
with no caller is worth knowing about even when keeping it is right.

## Gates

`pnpm lint && typecheck && test` · `scripts/e2e-local.sh web` (the base journey) ·
`scripts/e2e-local.sh web:activity-editor` · `web:wbs` · `web:copy-paste` (all three drive the
editor) · `node scripts/shoot.mjs --width 1646`. Per plan.md's sweep table this is a **targeted**
milestone, not a sweep one — M10 is the backstop.

## T4 was not met, and the M10 gate pass is what found it

**The three intents did not open the drawer.** They filled it — but only if the planner had already
discovered the rail's Activity-details button and pressed it. Registering a subject makes a button
appear and nothing else; there was no channel for a route to say _show me_. So pressing **Edit** on a
selected activity opened the **modal**, at every width, exactly as before this epic, and the drawer —
this milestone's headline capability — was dark in the product's default path.

That is ADR-0081's defect verbatim, and it is the fifth recorded instance: _a milestone claiming
user-facing capability with no entry point_. Its unit tests passed throughout, because they mount the
editor and not the shell. The one thing that would have caught it is the one thing ADR-0081 says to
do — a flag-on journey landing with the first user-facing milestone — and this epic's gate table
routed M6 to "targeted suites", none of which drives the shell.

**The fix is a third channel** (`DrawerSubjectControls`), and it stays a _request_: the route asks
for its registered subject to be shown, and the shell decides what that means. The shell therefore
still learns nothing about plans (ADR-0029). It is asked on the **transition** into open, never per
render — asking every render would take the Explorer away from a planner who had deliberately pointed
the drawer back at it.

Two more things fell out of the same seam, both found by the same pass:

- **The tab rail did not fit.** `railFits` asked a **viewport** query, which is the right question for
  a dialog sized by the window and the wrong one for a panel sized by a splitter. The drawer only
  exists at `lg`+, so the query was always true and the 208 px vertical rail always rendered inside a
  224–420 px panel — about 92 px of content beside it at the default width. `use-context-drawer-prefs.ts`
  says in its own words that "its tabs are a horizontal strip"; nothing had wired that up.
- **Below `lg` the editor vanished.** `showingContext` had no viewport term, so narrowing the window
  portalled the editor into a `display: none` slot with no fallback and no message. Nothing was lost —
  which is why it read as breakage, because nothing on screen said where it had gone.

All three are covered by `drawer-entry-point.test.tsx` and `ActivityEditor.drawer-chrome.test.tsx`,
each verified red against the pre-fix code first.
