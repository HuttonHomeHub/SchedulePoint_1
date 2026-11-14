# M3a measurement: the arrow on Follow logic

- **Status:** Measured 2026-11-14 — the stop rule passes; M3 proceeds.
- **Spec:** [`feature-spec.md`](feature-spec.md) Part B; plan milestone M3a.

## What was measured

`apps/web/measure-toolbar/follow-logic-m3a-arrow.spec.ts`, run with
`scripts/e2e-local.sh measure:toolbar -- follow-logic-m3a-arrow.spec.ts` on branch `feat/follow-arrow`
(commit `22f6469`), Chromium, 1024 × 600, mouse and finger.

Fixture: Excavate drives three followers, all placed on the data date and flagged; Pour slab is selected, so
the selection bar shows Follow logic with its arrow. Each pointer is read twice in the same page: with the real
"More Follow logic choices" arrow showing, and with only that arrow hidden. Readings are written to
`apps/web/measure-output/follow-logic-m3a.<pointer>.real.json`.

## Readings

| Pointer | Bar lines (with / without) | Bar, foot row and diagram height | Sideways scroll | Unpressable controls |
| ------- | -------------------------- | -------------------------------- | --------------- | -------------------- |
| Mouse   | 3 / 3                      | identical with and without       | none            | none                 |
| Finger  | 3 / 3                      | identical with and without       | none            | none                 |

## Verdict

The arrow costs the selection bar nothing at 1024 × 600: it adds no line, no bar, foot-row or diagram height,
nothing is cut off and every control stays pressable. The stop rule passes.

**One premise of the plan was wrong, and is corrected in the spec file.** The plan assumed the selection bar
sits on one line at 1024 × 600. It does not: with eleven controls it already wraps to three lines today, with
or without the arrow. The measure now records that line count and asserts only that the arrow does not change
it (commit `22f6469`).
