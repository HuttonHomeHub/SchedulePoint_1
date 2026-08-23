# Unsaved-work navigation guard — frontend architecture

> **Scope.** This document is the **mechanism**: where "is there unsaved work?" lives, which
> blocking primitive is used for which exit, where focus goes, how a registration is released, and
> how large the surface is. Stages 1–2 (business understanding, functional requirements) belong to
> `feature-spec.md`, produced in parallel by `feature-analyst`; the milestone slicing belongs to
> `implementation-plan.md`. Neither is written here.
>
> **No application code is written by this document.** The one non-prose change it makes is adding
> its own dependency citations to `scripts/dependency-claims.json` (ADR-0076), because
> `pnpm check:claims` fails on an unregistered citation and this design rests on six of them.

Every decision-bearing claim below names the command, the `file:line` or the test that established
it (CLAUDE.md §19.11). Where something is reasoned rather than observed, it says so.

---

## 1. What exists today, verified

| Claim                                                                                                       | How it was established                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| There is **no** unload handler and **no** router blocker anywhere in the client.                            | `rg -n "beforeunload\|useBlocker\|blocker\|shouldBlock" apps/web/src` → the only hits are `TsldCanvas.tsx`'s `interactionDirtyRef` (a repaint flag, ~36 occurrences) and unrelated prose.                                                                                                                                                                                                                                                                                                                                                                          |
| The activity editor already confirms before discarding **on its own close path**, and on a subject change.  | `ActivityEditorDialog.tsx:373-380` (`requestClose`), `:364-371` (subject hold), `:837-871` (the `ConfirmDialog`), pinned by `ActivityEditor.subject-guard.test.tsx`.                                                                                                                                                                                                                                                                                                                                                                                               |
| That confirmation is derived from **three** scope forms and deliberately excludes the three Progress forms. | `ActivityEditorDialog.tsx:342-351` — the docblock states the exclusion and its reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| The editor is a **modal** again; `registerDrawerSubject` has no production caller.                          | ADR-0101; `docs/TECH_DEBT.md` #156. A native `<dialog>` + `showModal()` (`dialog.tsx:65-70`) makes the rest of the page inert — so it blocks in-app navigation by pointer or keyboard, and blocks **nothing** about Back/Forward, reload or tab close.                                                                                                                                                                                                                                                                                                             |
| There is **no shared `<Form>` wrapper** to hang an automatic registration on.                               | `components/ui/form.tsx` exports `TextField`, `SelectField`, `CheckboxField`, `TextareaField`, `FormErrorSummary`, `FormProblemCount` — field primitives and a summary, no wrapper. `rg -c "<form" apps/web/src --glob '!*.test.*'` shows every host writing its own `<form>` element (e.g. `ClientFormDialog.tsx:88`). **`docs/FRONTEND_ARCHITECTURE.md` "Form handling" is stale on this point** — it says "Every form uses the shared accessible `Form` primitive", which a reader would design against. Correcting that line belongs to this epic's docs task. |
| `<main id="main" tabIndex={-1}>` already exists as the skip link's target.                                  | `app-shell.tsx:498-501`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The shell's Escape ladder already stands down for an open native modal.                                     | `app-shell.tsx:366-381`, specifically `if (aNativeModalIsOpen()) return;` at `:376`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| The root route's component is an empty `() => <Outlet />`.                                                  | `app/router.tsx:48-50`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| The router uses the **browser** history (no explicit `history` option).                                     | `app/router.tsx:514-529`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## 2. Q1 — Where "is there unsaved work?" lives

### D1. Dirt is a **keyed registry of records**, never a boolean, and it is owned once at the root route.

A global `isDirty` boolean is the wrong shape for exactly the reason the brief gives: ADR-0060 gives
the editor four write scopes with different permissions, and the editor is not the only holder. A
boolean can only over-warn ("you have unsaved changes" when a Contributor has typed a progress
percentage and a Planner's definition scopes are clean) or under-warn (whoever wrote the last `set`
wins).

The state shape:

```ts
/** One independently-losable piece of user input. */
export interface UnsavedWorkRecord {
  /** What the reader would lose, in their words: "General", "Working week", "Weighted steps". */
  readonly label: string;
  /**
   * The thing being edited, so the confirmation can say more than "somewhere":
   * "Excavate foundations", "Site calendar". Groups records in the dialog.
   */
  readonly subject: string;
}
```

Owned by an `UnsavedWorkProvider` rendered by the **root route's component** (`app/router.tsx:48-50`,
today an empty `() => <Outlet />`). That position is forced, not chosen: `useBlocker` calls
`useRouter()` (`` `dist/esm/useBlocker.js`, lines **37** ``), so the provider must be inside
`RouterProvider`; and it must be outside every route, or navigating away unmounts the thing holding
the block.

### D2. The registry is held in a **ref**, and dirt changes cost **zero renders**.

`Map<string, UnsavedWorkRecord>` in a `useRef`, mutated through two stable functions the provider
owns — the `drawer-subject.tsx:81-98` precedent, and for the same reason recorded there: a context
value is immutable as far as the React Compiler is concerned, so consumers must never touch the ref.

Nothing renders on a dirt change. The two readers are:

- `shouldBlockFn` / `enableBeforeUnload`, which are **called** by the router at navigation and unload
  time and read the ref then;
- the confirmation dialog, which captures a **snapshot** of the records when the block fires.

This is what lets one blocker be registered once, for the life of the application, with no
re-registration churn — see D6.

### D3. **One derivation, two readers.** The editor's existing confirmation becomes a projection of the registry, not a sibling of it.

This is the ADR-0065 `routeOrthogonal` argument applied literally: two implementations of "is this
dirty?" would drift, and _the drift would be invisible_, because each surface looks right on its own
and only a reader who closed the editor one way and navigated away the other would ever see one list
name a scope the other omits.

That drift is not hypothetical here — **it already exists in the one place a comparison is possible.**
`dirtyScopeNames` (`ActivityEditorDialog.tsx:347-351`) covers General, Scheduling and Cost.
`ActivityProgressPanels.tsx` holds three more independently-dirty forms (`:94` Progress, `:244`
Measure, `:392` Steps) and none of them is represented. A second list built for the navigation guard
would inherit that gap or contradict it, and there is no way to tell which from either file.

So: each scope calls `useUnsavedWork(record | null)`; `requestClose` reads the records back **filtered
to this surface** rather than re-deriving from three `formState.isDirty` values.

**Two consequences, both stated rather than absorbed:**

1. The close confirmation **widens** to name Progress, Measure and Steps. The existing exclusion's
   stated reason — "each is one endpoint away from durable, and none of them can be lost by a stray
   Escape without the others" (`ActivityEditorDialog.tsx:343-346`) — is **true for the close path and
   false for a reload**, where all six vanish together. The reason does not transfer, so the
   exclusion does not survive. `ActivityEditor.subject-guard.test.tsx` gains cases; none of its
   existing assertions changes.
2. **A latent defect surfaces, and it is latent — verified, not asserted.** The subject-change hold at
   `ActivityEditorDialog.tsx:364-371` gates on `dirtyScopeNames.length === 0`, and the Progress
   panels re-seed on `activity?.id` through `useScopeForm` (`useScopeForm.ts:68-77`). So a dirty
   Progress panel plus three clean definition scopes plus a subject change = silent discard, no
   confirmation. It is **not reachable in the shipped product**: ADR-0101 returned the editor to
   `modalShell`, `registerDrawerSubject` has no production caller (TECH_DEBT #156), and a native
   modal's inert backdrop means the subject cannot change while it is open. It becomes live the day
   #156 gets a registrant. D3 closes it by construction rather than by a separate fix.

### D4. What stops a **second** surface registering dirt and the two disagreeing: a derived census, not a convention.

There is no shared `<Form>` wrapper (§1), so registration cannot be automatic without inventing one
and rewriting 22 call sites. Opt-in registration therefore has the failure mode that matters: a form
that does not register is silently unguarded, and **nothing reports it**.

The instrument is the ADR-0072 **route census** applied to forms —
`unsaved-work-coverage.structural.test.ts`:

- Derive the roster **from the filesystem**, never from a hard-coded list. A hard-coded list is the
  ADR-0073 C4 defect in miniature: it goes stale the day a form is added, and it goes stale quietly.
- Every component containing a `useForm(` or `useScopeForm(` call is either **registered** or in a
  **reasoned exclusion set**, with the reason as an enum value. Every reason is a decision somebody
  made — no `PENDING_COVERAGE`, which ADR-0073 C3.4 deleted for being a queue wearing a decision's
  clothes.
- **Strip comments before scanning.** Four instruments in this repository have gone wrong by matching
  their own prose (ADR-0098's weight ratchet, ADR-0099's sizing ratchet, ADR-0106's
  `reset-fills.structural.test.ts`, and the `check:claims` gate itself). A docblock that says
  "this component deliberately does not call `useForm(`" must not count as calling it.
- Carry a **pinned positive case**: at least one known registrant must be found by the derivation, so
  a regex that stops matching anything cannot pass as full coverage (the ADR-0094 blind spot).

Blast radius and a proposed tiering are §7.

---

## 3. Q2 — Router blocker vs `beforeunload`

**The division is not a choice between two mechanisms. In the installed version they are one
registration with two channels, and the app must not add a second listener.**

### What the installed code actually offers

Installed: `@tanstack/react-router@1.170.27` (`node_modules/.pnpm/@tanstack+react-router@1.170.27_…`),
which delegates to `@tanstack/history@1.162.1`. Read, not assumed:

| Fact                                                                                                                                                                                                            | Citation                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `useBlocker` exists, and with `withResolver: true` it returns a resolver carrying `status`, `current`, `next`, `action`, `proceed()` and `reset()` — enough to render **our own** dialog with **our own** copy. | `` `dist/esm/useBlocker.js`, lines **77-95** ``; corroborated by the `BlockerResolver` type in the sibling `useBlocker.d.ts`. |
| It registers through `history.block(...)` in an effect and returns the unsubscribe as the cleanup.                                                                                                              | `` `dist/esm/useBlocker.js`, lines **97-100** ``.                                                                             |
| `history.block()` **appends to an array** and returns an identity-filtered unsubscribe — several blockers may coexist.                                                                                          | `` `dist/esm/index.js`, lines **116-124** ``.                                                                                 |
| The `beforeunload` listener is added **once, at history creation**, with `capture: true` — not by `useBlocker`.                                                                                                 | `` `dist/esm/index.js`, lines **297** ``.                                                                                     |
| That listener is driven by the **same blocker array**, consulting each blocker's `enableBeforeUnload`, which may be a **function evaluated at unload time**.                                                    | `` `dist/esm/index.js`, lines **240-262** `` — specifically the `typeof shouldHaveBeforeUnload === "function"` branch.        |
| In-app navigations consult blockers only for `PUSH`/`REPLACE`, and `navigate({ ignoreBlocker: true })` skips them entirely.                                                                                     | `` `dist/esm/index.js`, lines **19-26** ``.                                                                                   |
| Back/Forward is handled on `popstate`, separately, and a blocked pop is rolled back with `win.history.go(1)`.                                                                                                   | `` `dist/esm/index.js`, lines **223-235** ``.                                                                                 |
| `enableBeforeUnload` **defaults to `true`**.                                                                                                                                                                    | `` `dist/esm/useBlocker.js`, lines **35-36** ``.                                                                              |
| `createMemoryHistory` has blockers but **no `beforeunload` listener at all**.                                                                                                                                   | `` `dist/esm/index.js`, lines **335-342** ``.                                                                                 |

### D5. One blocker, registered once, at the provider. Both channels read the same registry.

```ts
useBlocker({
  shouldBlockFn: stableShouldBlock, // reads the registry ref
  enableBeforeUnload: stableHasAnyDirt, // a FUNCTION, read at unload time
  withResolver: true,
});
```

Three things this buys, each of which is otherwise a defect:

1. **The app never writes `window.addEventListener('beforeunload', …)`.** The listener already exists
   (`index.js:297`) and is already fed by the blocker array. A second listener would be a second
   source of truth for the same question — the D3 drift, one layer down.
2. **`enableBeforeUnload` must be passed, and must be a function.** It defaults to `true`
   (`useBlocker.js:35-36`), so a permanently-registered blocker with no `enableBeforeUnload` prompts
   the browser's "leave site?" dialog on **every reload of every page**, clean or dirty. Passing a
   boolean instead of a function is nearly as bad: it sits in the effect's dependency array
   (`` `dist/esm/useBlocker.js`, lines **101-108** ``), so the blocker unregisters and re-registers
   every time the answer changes.
3. **A single blocker, not one per form.** The history layer would accept N (`index.js:116-124`), and
   N is wrong for two reasons: N blocked navigations means N dialogs racing, and — more sharply —
   `withResolver`'s promise is resolved only by `proceed`/`reset` (`useBlocker.js:77-86`), so a
   blocker whose component unmounts while blocked leaves an unresolved `await` inside
   `tryNavigation` and the navigation hangs forever. A root-level blocker that never unmounts makes
   that unreachable by construction.

### D6. The division of labour, which is a division of **exits**, not of preference

| Exit                                          | Channel                                                          | What the reader is shown                                      |
| --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| In-app link / `navigate()` (PUSH/REPLACE)     | Router blocker                                                   | Our `alertdialog`, naming every record, two outcomes          |
| Browser Back / Forward                        | Router blocker (popstate path, `index.js:223-235`)               | Same dialog; a blocked pop is rolled forward                  |
| Reload, tab close, address bar, external link | `beforeunload`                                                   | The browser's generic string. No copy, no naming, no control. |
| Post-save redirect, forced sign-out on 401    | Neither — `navigate({ ignoreBlocker: true })` (`index.js:19-26`) | Nothing                                                       |

`beforeunload` is the **last resort for the exits the router cannot see**, and its ceiling is
structural: the browser will not render our sentence, and modern browsers gate the prompt on a prior
user gesture. That is precisely why it must not be the primary channel, and precisely why we cannot
drop it.

### D7. Two outcomes only — **Stay** and **Discard and leave**. No "Save and leave".

Tempting and wrong for the reason ADR-0060 already settled: the editor's scopes do not share a
permission or an endpoint, and "save everything" would have to pick one rule. A guard that offers to
save would either fail silently on the scopes the reader cannot write, or quietly write a
Contributor's progress alongside a Planner's definition. Per-scope save is structural (ADR-0060);
a merged save smuggled in through a navigation dialog is that decision reversed by the side door.

Labels follow the rule `ConfirmDialog` already states in its own docblock
(`confirm-dialog.tsx:29-35`): "Cancel" is ambiguous when the dialog offers a **choice between two
outcomes**. So: **`Stay on this page`** and **`Discard and leave`** — each naming what pressing it
does.

---

## 4. Q3 — Focus and accessibility

`Dialog` is the native `<dialog>` with `showModal()` (`dialog.tsx:65-70`), so focus containment,
Escape, the inert backdrop and native focus restore are the platform's. The guard reuses
`ConfirmDialog` unchanged — no bespoke dialog, no new primitive.

### D8. Where focus goes, in all three outcomes

**(a) On a blocked navigation — the dialog opens.**
The browser moves focus into the dialog and remembers the previously-focused element. The **initial
focus must be the safe option** (`Stay on this page`). `ConfirmDialog` renders the dismiss button
first (`confirm-dialog.tsx:56`) and `Dialog` sets no `autofocus`, so native ordering should land
there — **reasoned from the markup, not observed**, and therefore a test to write rather than a fact
to assert. Pin it.

Escape is `Dialog`'s native close → `onClose` → `reset()`. Escape means _stay_, which is the safe
direction, and it must never route to `proceed()`. The shell's Escape ladder stands down while a
native modal is open (`app-shell.tsx:376`), so one press cannot both dismiss the guard and close the
context drawer behind it.

**(b) On `Stay` — nothing unmounted, so the platform is right.**
`dialog.close()` fires native focus restore to the element that had focus. That element still exists,
because the navigation never happened. This is the one case where relying on native restore is
correct, and it should be pinned rather than assumed — the assertion is that focus is back on the
control the reader activated, not merely "not on `<body>`".

**(c) On `Discard and leave` — native restore is a trap, and this is the recorded defect class.**
The route unmounts. Native restore aims at an element inside the unmounting subtree and drops focus
to `<body>` — ADR-0099 M10, ADR-0063 M6 and ADR-0096 all record this exact failure, and in this app
it is worse than a WCAG 2.4.3 breach on its own, because the workspace accelerators are a React
`onKeyDown` on the workspace root and focus on `<body>` silently disables them (ADR-0080).

So the guard does **not** rely on native restore here. After `proceed()`, once the destination route
has committed, it moves focus to `<main id="main">` (`app-shell.tsx:498-501`) — already `tabIndex={-1}`
and already the skip link's target, so no new focus target is invented.

**The ordering is the whole difficulty.** `proceed()` resolves the promise inside `useBlocker`
(`useBlocker.js:83`), the navigation runs, and React commits the destination — while
`dialog.close()` fires native restore somewhere in between. Focusing `#main` in the click handler
therefore focuses the _old_ main and is then undone. The provider must instead hold a
`pendingProceedRef` and act when the location has actually changed: subscribe to the router's
resolved location, and on the first resolution after an unblocked proceed, focus `#main` and clear
the ref.

**One destination has no `#main`.** A blocked navigation can land on `/sign-in` (sign-out with
unsaved work should warn). `AppShell` owns the only `id="main"`; the public shell has none. The
remedy is one line — give the public shell the same `id="main" tabIndex={-1}` — and it is named here
as a task rather than left for the implementer to discover. The fallback must never be "focus
`document.body`", which is the defect spelled out.

### D9. Announcement, and what is deliberately not announced

The dialog's `role="alertdialog"` (`confirm-dialog.tsx:46`) announces itself and its description on
focus, which covers the blocked navigation — including the case with no visible page change, where a
reader pressed Back and the page stayed put.

On `Stay`, nothing is announced: focus returning to the control the reader pressed _is_ the
statement, and a live region saying "you stayed" would be a second channel for a fact the first one
already carries. On `Discard and leave` the destination route's own render is the announcement; the
guard adds nothing.

### D10. Surface scope: nothing new (ADR-0055 / ADR-0097)

The provider mounts at the root route, outside every `<Surface>`, so the dialog resolves the **page**
family — which is what every other `ConfirmDialog` in the product does. A native `<dialog>` is in the
top layer for _painting_, but CSS custom-property inheritance follows the **DOM** tree, so
`[data-surface]` behaves normally.

No new token, no new family, no new scope, and no colour literal in `className`/`style` (the
ADR-0055 lint rule). The one thing to refuse is a bespoke dialog with its own values: ADR-0106
records `bg-card`/`text-card-foreground` being reached for in a scope that does not rebind them,
four days after the same defect one file over.

---

## 5. Q4 — Registration and deregistration lifecycle

### D11. One hook, a `useId()` token the caller never sees, release in its own unmount effect.

```ts
export function useUnsavedWork(record: UnsavedWorkRecord | null): void;
```

- **The token is `useId()`, generated inside the hook.** Never a caller-supplied string: two
  instances of the same component (two note composers on one screen —
  `PlanNotesSection.tsx:63` and `:92`) must not collide, and a caller cannot forget to make one
  unique if it cannot supply one.
- **Depend on the record's fields, not the object** — the `drawer-subject.tsx:249-255` precedent — so
  a caller need not memoise and cannot form a register → setState → new object → register loop.
- **Release lives in its own effect** (`useEffect(() => () => release(token), [release])`), separate
  from the registering effect. `drawer-subject.tsx:257-272` records why, including the honest part:
  the split was first justified by a defect it did not fix, and is kept because it is what the code
  _means_. The same holds here.

### D12. Why a leak is worse here than anywhere it has leaked before

ADR-0064 records leaked recalculation holds failing silently. A leaked _dirt_ registration is that
class one turn worse: the reader cannot leave. Every navigation opens a dialog naming work that does
not exist, and the only way past it is to confirm discarding nothing — on every navigation, forever,
until reload.

**There is no TTL and no timeout.** A TTL is a guess, and it would sometimes drop real dirt — turning
a nuisance into data loss to fix a nuisance.

The defence is structural instead:

- the registry is only ever mutated through the provider's two stable functions;
- release runs in cleanup, which React guarantees on unmount;
- the blocker itself never unmounts (D5), so the only leakable thing is a `Map` entry;
- and an entry is keyed by a token no one else holds, so a release cannot miss and cannot over-reach.

### D13. The tests that pin it, and the one that is the discriminator

| #   | Test                                                                                                                           | Why it exists                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mount a registrant, unmount it, assert `shouldBlockFn()` is `false`.                                                           | The plain leak.                                                                                                                                       |
| 2   | **Mount two, unmount one, assert the other still blocks.**                                                                     | The discriminator. A `release()` that clears the whole map passes test 1 and fails this. Without it, test 1 is satisfied by the wrong implementation. |
| 3   | Assert `shouldBlockFn` and `enableBeforeUnload` are **referentially stable** across re-renders (`expect(a).toBe(b)`).          | D5's "registered once". They sit in `useBlocker`'s dependency array (`useBlocker.js:101-108`), so instability is silent churn.                        |
| 4   | Journey: navigate away, confirm, navigate away again — the second must **not** prompt.                                         | The end-to-end statement of 1 and 2, against a real router.                                                                                           |
| 5   | Journey: dirty a form, press browser Back, cancel, assert the URL is unchanged and focus is on the control that was activated. | (b) above.                                                                                                                                            |
| 6   | Journey: dirty a form, press Back, confirm, assert the URL changed **and** `document.activeElement` is `#main` — not `<body>`. | (c) above. Verify red first against a build without the `pendingProceedRef` step.                                                                     |

**Assert behaviour, never the map's contents.** Test 1 written as "the map is empty" passes against a
release that clears everything, and against a blocker that was never registered.

### D14. `beforeunload` is **unprovable** in unit tests, and that is a structural fact, not an omission

`createMemoryHistory` sets up blockers but adds no `beforeunload` listener at all
(`` `dist/esm/index.js`, lines **335-342** ``, against the browser history's `:297`). So any test using
memory history or jsdom exercises the branch that is _not_ the unload path — the ADR-0074 `e2e-csp`
shape exactly, where the unit suite structurally cannot reach the branch that ships.

The consequence for the plan: the `beforeunload` half needs a **real browser**, in a journey that
asserts on the browser's own dialog. Write it down as a limitation of the unit suite in the suite's
own docblock, so nobody later reads a green run as covering it.

---

## 6. Module structure

```text
apps/web/src/
├── app/
│   └── router.tsx                      # rootRoute.component wraps <Outlet/> in the provider
├── features/unsaved-work/              # a feature module, deletable as one folder
│   ├── model/
│   │   ├── unsaved-work-registry.ts    #   pure: Map ops + record ordering/grouping. No React.
│   │   └── unsaved-work-registry.test.ts
│   ├── components/
│   │   ├── UnsavedWorkProvider.tsx     #   the ref, the two stable fns, the ONE useBlocker
│   │   ├── UnsavedWorkPrompt.tsx       #   ConfirmDialog + copy + focus handoff
│   │   └── *.test.tsx
│   ├── hooks/
│   │   └── use-unsaved-work.ts         #   useUnsavedWork(record | null) — the only registrar
│   ├── unsaved-work-coverage.structural.test.ts   # the derived census (D4)
│   └── index.ts                        #   exports useUnsavedWork + UnsavedWorkProvider only
└── e2e-unsaved-work/                   # its own Playwright config + CI step (ADR-0081)
```

Ordering and grouping live in `model/` as **pure functions over an injected registry**, not inside
the provider — the `features/overview/model/recent-plans.ts` precedent
(`docs/FRONTEND_ARCHITECTURE.md` "Browser-local state"): testable without a browser, and unable to
acquire a hidden dependency on `window`.

`index.ts` exports **two** symbols. The registry type, the token and the provider internals stay
private; a consumer that can read the whole registry is a consumer that can build a second answer to
D3's question.

### Data flow

```mermaid
flowchart TD
  subgraph Surfaces
    A["ActivityEditor scope form"] -->|useUnsavedWork(record)| R
    B["Progress / Measure / Steps"] -->|useUnsavedWork(record)| R
    C["CalendarFormDialog week"] -->|useUnsavedWork(record)| R
  end
  R["UnsavedWorkProvider<br/>Map in a ref — zero renders"]
  R -->|filtered by subject| E["Editor requestClose<br/>(a projection, not a sibling)"]
  R -->|read at call time| S["shouldBlockFn"]
  R -->|read at unload time| U["enableBeforeUnload()"]
  S --> BL["one history blocker"]
  U --> BL
  BL -->|PUSH / REPLACE / popstate| P["UnsavedWorkPrompt<br/>Stay · Discard and leave"]
  BL -->|reload / tab close| N["browser's own string"]
  P -->|reset| K["stay — native focus restore"]
  P -->|proceed| G["navigate, then focus #main"]
```

### States

| State                             | Behaviour                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Registry empty                    | `shouldBlockFn` → `false`, `enableBeforeUnload()` → `false`. Byte-identical to today: no dialog, no browser prompt. |
| Dirty, in-app navigation          | Prompt, grouped by `subject`, listing every `label`.                                                                |
| Dirty, reload/close               | Browser's generic prompt. Nothing we control.                                                                       |
| Dirty, `ignoreBlocker` navigation | No prompt, by design (post-save redirect, 401 sign-out).                                                            |
| Blocked, then `Stay`              | URL unchanged, focus restored natively.                                                                             |
| Blocked, then `Discard and leave` | Navigation proceeds; focus moves to `#main` after the destination commits.                                          |
| Blocked while already blocked     | See **O1** — open, deliberately not designed around.                                                                |

---

## 7. Q5 — Blast radius, counted

Derived from `rg -n "useForm[<(]" apps/web/src --glob '!*.test.*'` (23 hits) plus a read of each host.

- **23** non-test `useForm(` call sites: **22** in components, **1** in the shared `useScopeForm`
  helper (`useScopeForm.ts:56`).
- `useScopeForm` is instantiated at **9** call sites across 3 components:
  `ActivityCreateDialog.tsx:262,275,282,283` (4), `ActivityEditorDialog.tsx:297,303,304` (3),
  `ActivityProgressPanels.tsx:94,244` (2).
- ⇒ **31 independently-dirty RHF instances.**
- Plus **1 non-RHF holder**: `CalendarFormDialog.tsx:155-156` holds the authored working week
  (`week`, `weekProblems`) in `useState`, written at `:207`. **Nothing compares it to its seed**, so
  the shift editor ADR-0067 built is unsaved work the product currently cannot detect _at all_ — its
  RHF `isDirty` is blind to it.
- ⇒ **32 independently-losable pieces of user input, across 24 host components.**

Excluding the four public pre-auth forms (`SignInForm`, `SignUpForm`, `ResetPasswordForm`,
`RequestPasswordResetForm`) — where the "unsaved work" is a credential and where sign-in navigates
immediately on success, so a guard would fire on its own redirect — leaves **28 pieces across 20
components**.

### Where they sit, because it changes which channel matters

A native modal's inert backdrop makes in-app navigation impossible by pointer or keyboard, but does
nothing about Back or reload. So:

| Host                                                                                                                                                                                                | Pieces | Chrome                    | Channels that matter             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------- | -------------------------------- |
| `ActivityEditorDialog` + `ActivityProgressPanels`                                                                                                                                                   | 6      | modal (ADR-0101)          | Back, reload                     |
| `ActivityCreateDialog`                                                                                                                                                                              | 4      | modal                     | Back, reload                     |
| `CalendarFormDialog` (form + `week` + nested `CalendarExceptionsEditor.tsx:313`)                                                                                                                    | 3      | modal                     | Back, reload                     |
| `ResourceFormDialog`, `ClientFormDialog`, `ProjectFormDialog`, `PlanFormDialog`, `ShareLinksDialog`, `InviteMemberDialog`, `CreateBaselineDialog`, `EditDependencyDialog`, `AddCrossPlanLinkDialog` | 9      | modal                     | Back, reload                     |
| `AddLinkSection`, `ActivityResourcesPanel` (assign form)                                                                                                                                            | 2      | in-editor panels          | Back, reload                     |
| `NoteComposer` ×2 sites, `NoteItem`                                                                                                                                                                 | 3      | **non-modal**, page-level | **all** — including in-app links |
| `CreateOrganizationForm` (`/onboarding`)                                                                                                                                                            | 1      | **non-modal**, page-level | **all**                          |
| `ChangePasswordForm` (`/account`)                                                                                                                                                                   | 1      | **non-modal**, page-level | **all**                          |

The two non-modal categories are the only ones where an ordinary in-app link can currently destroy
work with no dialog anywhere in the product.

### Recommended tiering (the choice is the spec's; the rule is architectural)

The rule I recommend, because it is derivable and does not need per-form judgement: **register a
surface when losing its state costs more than retyping one field.** That gives:

- **Tier 1 (M1)** — the activity editor's 6, the create dialog's 4, the calendar dialog's 3
  (including the `week`, which is the largest single loss in the product and is currently invisible
  to every dirty check). **13 pieces, 3 hosts.** Enough to prove the mechanism end to end and to
  cover the epic's motivating case.
- **Tier 2** — the remaining authenticated multi-field forms: 9 modal + 2 panel + `ChangePasswordForm`.
- **Excluded, with the reason recorded in the census** — the 4 public auth forms, and single-field
  composers (`NoteComposer`, `NoteItem`) where the guard would be more disruptive than the loss.

Whatever the spec chooses, D4's census makes each of the 24 hosts carry a decision, once, one way.

---

## 8. Risks and trade-offs

| Risk                                                                                                                            | Assessment                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Over-warning kills the guard.** A prompt on a clean form trains readers to confirm without reading, and the next one is real. | The registry is exact by construction (a record per dirty scope), and RHF's `isDirty` is a comparison against the seed, not a "was touched" flag. The residual case is the calendar `week`, which needs a real seed comparison written for it — named in Tier 1 rather than assumed.                                     |
| **Adding `@tanstack/react-router` to the claims register makes a version bump fail CI.**                                        | Intended (ADR-0076): the bump is exactly when six citations into a blocking primitive need re-reading. Note the sharper edge here: `apps/web/package.json:69` is `^1.170.21` and `1.170.27` is installed, so an ordinary `pnpm install` can move it within the caret. That is a feature of the gate, not a defect of it. |
| **`beforeunload` is untestable outside a browser** (D14).                                                                       | Accepted; answered by a journey rather than hidden. The failure mode of _not_ naming it is a green unit suite read as coverage.                                                                                                                                                                                          |
| **The close confirmation's behaviour changes** (D3 consequence 1).                                                              | Deliberate and stated. Its existing exclusion's reason does not survive contact with a reload.                                                                                                                                                                                                                           |
| **Opt-in registration leaves unregistered forms silently unguarded.**                                                           | The only real mitigation is the derived census (D4). A shared `<Form>` wrapper would remove the problem entirely and is the right long-term answer; it is a 22-call-site refactor and does not belong in this epic. Record it as debt with the trigger: _the next epic that touches form authoring_.                     |
| **No `VITE_` flag** (ADR-0088 D1 — a `VITE_` constant is inlined at build time and is not an operator rollback).                | The rollback is a commit boundary: the provider, the hook and the registrations land as separable commits, and reverting the provider makes every `useUnsavedWork` call a no-op by construction (the hook is a no-op with no provider — the `drawer-subject.tsx:149-160` rule).                                          |

**One thing this design does _not_ guard, named so it is not mistaken for an oversight:** canvas
edits. Every canvas gesture PATCHes immediately through `use-plan-workspace-model.ts`; there is no
draft. `TsldCanvas.tsx`'s ~36 `interactionDirtyRef` occurrences are a repaint flag and have nothing
to do with unsaved user work — a reader grepping `dirty` finds them first.

---

## 9. Open questions

**O1 — Two blocked navigations at once.** While the prompt is open the backdrop is inert, so a second
in-app navigation cannot be started — but the browser's own Back button is outside it. A second
`popstate` calls the blocker again, and `useBlocker`'s `setResolver` **overwrites** the pending
resolver (`useBlocker.js:78-86`), orphaning the first promise so its `win.history.go(1)` rollback
(`index.js:223-235`) never runs.

Reasoned from the source, **not observed**. The recommendation is deliberately not to design around
it: reproduce it in the journey first (press Back twice with the prompt open; assert the URL). If it
reproduces, the answer is to hand-roll the resolver in the provider — roughly twenty lines, we
already own the dialog, and it removes an unbounded `await` from inside the library. If it does not,
`withResolver: true` stays and this note is the record. Designing for an unobserved failure is
ADR-0076 Class 3.

**O2 — Which surfaces are Tier 1.** §7 recommends; the spec decides.

**O3 — `check:claims` has a camelCase blind spot, found while writing this.** The completeness scan's
colon-form pattern is `\b([a-z0-9.-]+\.m?js):(\d+…)` — **case-sensitive**
(`scripts/check-claims.mjs:161`), so `useBlocker.js:35` matches nothing and a citation into any
camelCase dependency file is invisible in **both** directions: it cannot be demanded, and it cannot
be noticed going stale. This is the same family as the `guard.js` dotted-basename hole that file
records at `:152-158` and as `docs/TECH_DEBT.md` #101.

It is worked around here rather than fixed: every `useBlocker.js` citation above uses the **prose**
form, whose pattern carries the `i` flag (`scripts/check-claims.mjs:163`) and therefore does match.
Fixing the scan is a shared-gate change and fires ADR-0105's trigger, so it is filed rather than
smuggled into this epic. Recommend a new `docs/TECH_DEBT.md` row.

---

## 10. This warrants an ADR

It adds a cross-cutting provider, a new shared hook, a new structural gate, a Playwright config, and
it changes the activity editor's existing close behaviour — four of ADR-0105's five triggers. The
full spec and plan are mandatory (which `feature-analyst` is producing in parallel).

**Draft decision list** — suggested number **ADR-0108**, subject to the ADR-0071 rule: check the
register at filing time and record a collision rather than routing around it.

| #   | Decision                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Unsaved work is a **keyed registry of records**, not a boolean; owned once at the root route, inside `RouterProvider` and outside every route.                                                                                          |
| D2  | The registry lives in a **ref**; a dirt change costs zero renders. Readers are called, not rendered.                                                                                                                                    |
| D3  | **One derivation, two readers.** The activity editor's close/subject confirmation becomes a projection of the registry. Consequence: it widens to Progress/Measure/Steps, and the latent subject-change discard closes by construction. |
| D4  | Coverage is a **derived census with reasoned exclusions**, comment-stripped, with a pinned positive case — not a convention and not a hard-coded list.                                                                                  |
| D5  | **One blocker, registered once**, with a stable `shouldBlockFn` and a stable `enableBeforeUnload` **function**. The application never adds its own `beforeunload` listener.                                                             |
| D6  | The two channels divide by **exit**, not by preference: the router blocker owns everything it can see, `beforeunload` is the last resort for reload/close/external.                                                                     |
| D7  | **Two outcomes only** — `Stay on this page` / `Discard and leave`. No "Save and leave": ADR-0060's per-scope save is structural and a merged save through a navigation dialog reverses it by the side door.                             |
| D8  | Focus: safe option focused on open; native restore on Stay; **explicit `#main` after the destination commits** on Discard — never native restore, which drops to `<body>`. The public shell gains an `id="main" tabIndex={-1}`.         |
| D9  | No new surface scope, no new token, no bespoke dialog: `ConfirmDialog` unchanged, page family.                                                                                                                                          |
| D10 | Release is an unmount-only effect on a `useId()` token; **no TTL**, because a TTL trades a nuisance for data loss.                                                                                                                      |
| D11 | No `VITE_` flag (ADR-0088 D1). The rollback is a commit boundary; the hook is a no-op with no provider.                                                                                                                                 |
| D12 | The `beforeunload` half is **unprovable** in unit tests (`createMemoryHistory` has no listener) and is covered by a journey, with the limitation written into the unit suite's docblock.                                                |

---

## 11. Implementer checklist

1. **Read `docs/specs/unsaved-work-guard/feature-spec.md` first** for Tier-1 scope; this document
   does not set it.
2. Wrap `rootRoute.component` (`app/router.tsx:48-50`) in `UnsavedWorkProvider`. Nothing else moves.
3. Pass **`enableBeforeUnload` as a function**. Omitting it prompts on every reload
   (`useBlocker.js:35-36`); passing a boolean churns the registration (`useBlocker.js:101-108`).
4. Do **not** add a `window.addEventListener('beforeunload', …)`. It already exists at
   `index.js:297` and is fed by the same blocker array.
5. Make `shouldBlockFn` and `enableBeforeUnload` referentially stable, and assert it (test 3).
6. Register through `useUnsavedWork` only. Do not export the registry.
7. Convert the editor's `dirtyScopeNames` into a **projection** of the registry (D3). Add cases to
   `ActivityEditor.subject-guard.test.tsx`; change none of its existing assertions.
8. Give `CalendarFormDialog`'s `week` a real seed comparison — it has none today
   (`CalendarFormDialog.tsx:155-156, 207`) — before registering it.
9. Focus `#main` **after** the destination commits, via a `pendingProceedRef` and the router's
   resolved location. Not in the click handler. Verify red first.
10. Add `id="main" tabIndex={-1}` to the public shell, or a blocked sign-out drops focus to `<body>`.
11. Write the census with comments **stripped** and a **pinned positive case**.
12. Land the journey with the first user-facing milestone (ADR-0081), not at the end — including the
    O1 double-Back probe and the `beforeunload` case.
13. Run `pnpm prepush` (ten gates, one command) **and** `scripts/e2e-local.sh web:unsaved-work`.
    `pnpm check:claims` must be green: §12 below is the register change it needs.
14. Correct `docs/FRONTEND_ARCHITECTURE.md`'s "Form handling" paragraph — there is no shared `<Form>`
    wrapper (§1).

---

## 12. Claims register

Two packages and ten citations were added to `scripts/dependency-claims.json` alongside this
document (`@tanstack/react-router@1.170.27`, `@tanstack/history@1.162.1`). Every anchor was read in
the installed tree while writing §3 — none is quoted from memory or from documentation.

The `useBlocker.js` citations are written in the **prose** form deliberately; see **O3** for why the
colon form would be invisible to the gate.
