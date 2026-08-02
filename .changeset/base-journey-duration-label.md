---
'@repo/web': patch
---

Point the journeys at the duration label the shipped default actually renders

ADR-0070's flag flip renames the activity form's control from `Duration (working days)` to
`Duration` once the field can resolve how many hours the activity's day is worth — deliberate, since
it no longer promises whole days. Three Playwright journeys were still asking for the old label: the
base `e2e/activities.spec.ts` and the `e2e-activity-editor` / `e2e-programme` fixtures.

The pre-push gate did not catch it, and the rule is why. `docs/TESTING.md` says to run a flag-on
suite when you add or change one — which was done, and passed, because that suite pins the flag on.
What a default flip moves is every suite that does **not** pin it, starting with the base suite,
which serves the app on the shipped defaults. No file in `e2e/` was touched, so nothing pointed at
it.

The base journey now asserts `Duration`, the shipped default, so it fails loudly if that moves
again. The two fixture helpers accept either spelling with an anchored regex — they are setup, not
the assertion, and pinning one there only buys the same failure at the next flip. `docs/TESTING.md`
gains the rule as a numbered step and a worked example.
