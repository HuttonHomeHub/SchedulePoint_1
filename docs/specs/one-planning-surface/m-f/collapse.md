# M-F — the collapse

**Status:** Approved

The record of deleting the `EARLY`/`VISUAL` split. Written per task as it lands, because the
milestone's largest risk is a claim about what the collapse does NOT touch.

---

## T1/T2 — the read path

### What actually changed

`barDateSourceFor(mode, lateOverlay)` became `barDateSourceFor(lateOverlay)`, returning
`lateOverlay ? 'late' : 'visual'`. Two call sites dropped an argument. That is the whole of it on
the read side.

**Dropping the parameter rather than ignoring it is the decision.** A caller still holding a
`schedulingMode` would be asking a question the product has stopped having an answer to; the
compiler removes the question, instead of every caller separately agreeing to stop asking.

### The claim the milestone is most likely to be wrong about, checked

> "Early mode is Pass 1, so deleting the mode means deleting Pass 1."

**False, and checkable in one command.** `grep -rn "schedulingMode" apps/api/src/modules/schedule/engine/` returns **nothing**: `computeSchedule`
has never taken a scheduling mode, and `compute.ts`'s results loop writes `visualEffectiveStart` /
`visualEffectiveFinish` for **every activity of every plan**, unconditionally, beside the early and
late pairs. So:

- **The engine is untouched by M-F.** Not "carefully preserved" — untouched. There is no mode input
  to remove.
- **Pass 1 is not the "Early mode" pass.** It is the float, the criticality, the Late dates, the
  drift a placement is measured against, every DCMA metric and the whole ADR-0034 conformance
  matrix. All of it still runs on every recalculation.
- What collapsed is **which of two already-computed columns a BAR is drawn from**.

### What moves on screen, and for whom

On an activity nobody has placed, `visualEffectiveStart === earlyStart`, so the great majority of
the estate draws in identical pixels. The population that moves is exactly the one the
`placement-on-early-plan` diagnostic (D-D2) was built to size: a bar carrying a placement made
while its plan was `VISUAL`, on a plan later switched back to `EARLY`, which renders at its early
dates today and will render where it was placed. That diagnostic exists precisely so this is a
number an operator can take rather than a surprise.

### No flag gate, deliberately

The collapse is unconditional. Gating it on `SCHEDULING_MODES_ENABLED` would buy nothing an
operator can use — ADR-0088 D1 established that a `VITE_` constant is inlined at build time and
every published image carries the default, so it is not a rollback — while maintaining a second
product whose bars sit somewhere else. The rollback is a commit boundary.

The same edit unified a second reading: `barDateSource` read the raw `viewToggles.lateOverlay`
while the print path beside it read the hoisted `lateOverlayActive`. The two agreed by accident
while this resolved to `'early'` whenever the flag was off; post-collapse they would not.

## The finding: the rule had no test, and the whole suite proved it

**686 test files passed, unedited, through a change that re-points every bar in the product.**

`barDateSourceFor` had **no direct test at all**. Six suites `vi.mock` it to `() => 'early'`, which
pins the mock and says nothing about the rule; nothing else called it but the product. So the
function collapsed from two branches to one and the entire web suite could not tell the difference.

A green suite that cannot distinguish a change from its absence is this register's most-filed
shape, and the honest response is a test rather than relief. `lib/bar-dates.test.ts` now covers the
rule, with three mutations verified red:

| #   | mutation                                       | result           |
| --- | ---------------------------------------------- | ---------------- |
| P1  | the collapse reverted (`'visual'` → `'early'`) | **1 failed** / 5 |
| P2  | the Late overlay loses precedence              | **1 failed** / 5 |
| P3  | `'visual'` falls back to the early columns     | **1 failed** / 5 |

Its fixture carries **three distinct date pairs** on purpose: with two sources sharing values, a
resolver returning the wrong one passes, which is how a rule about which column to read comes to be
tested by a case that cannot see the difference.

**The six mocks were corrected in the same pass.** Left at `'early'` they would describe a world no
shipped bundle can produce — the shape ADR-0088 records the base journey's six editing specs having
been in for months, where a suite proves something true of nothing that ships. They still mock
rather than call the real resolver, because those suites are about the host; the rule has its own
file now.
