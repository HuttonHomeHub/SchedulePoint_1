# M-D — FC-3's list of expected golden insertions, written BEFORE the edit

**FC-3 clause 1 requires this file to exist first**, so the re-baseline is a reviewed list rather
than whatever the diff turns out to be. Written 2026-09-20 against `ee690c1f`, before any change to
either artefact.

---

## 1. Two of FC-3's own statements are corrected here, and both change the work

**(a) `goldens.spec.ts` does not compare the engine result. It compares a PICKED object.**

```ts
expect({
  earlyStart: …, earlyFinish: …, lateStart: …, lateFinish: …, totalFloat: …, isCritical: …,
  ...(expected.freeFloat !== undefined ? { freeFloat: result!.freeFloat } : {}),
}).toEqual(expected);
```

So adding a field to `EngineResult` requires **no change to this suite at all** — every existing
case keeps passing untouched. FC-3 reads as though the suite would break on 28 blocks and need
insertions into each; it would not. Recorded because a condition whose premise is wrong gets
satisfied by doing the wrong work carefully.

**(b) The population is 28 expectation pairs, not "~30–40".** Counted (`grep -c 'earlyStart:'` over
`goldens.ts`), not estimated.

## 2. The file already has the idiom for exactly this, and it is the one to follow

`freeFloat` was added the same way and its docblock states the rule: _"Optional free-float assertion
(M6-F1/F5); compared only when a case specifies it."_ So `GoldenExpectation` gains two **optional**
fields and the spec file gains two conditional spreads mirroring `freeFloat`'s.

That satisfies clause 1 more strongly than blanket insertion would — **zero modified lines and zero
insertions into any case that is not deliberately pinning the new behaviour.**

## 3. And it walks straight into the vacuity trap unless the pins are chosen

Every golden case is pure CPM with **no placement anywhere**, so for all 28
`remainingFloatMinutes === totalFloat` and `visualConflictReason === null`, identically. Pinning
both on all 28 would add 56 assertions that **cannot fail for the reason they exist** — they would
restate `totalFloat` under a second name. That is ADR-0093's shape, and it is the likely outcome of
following FC-3's text literally.

## 4. The list

**Into `goldens.ts`:**

| #   | Insertion                                                                    | Why                                                                 |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | `GoldenExpectation.remainingFloatMinutes?: number`                           | optional, mirroring `freeFloat`                                     |
| 2   | `GoldenExpectation.visualConflictReason?: VisualConflictReason \| null`      | optional, same rule                                                 |
| 3   | pins on **the existing float-bearing case**, asserting `=== totalFloat`      | the unplaced identity, on a case that has float to be identical to  |
| 4   | **one NEW golden case carrying a placement**, where the two genuinely differ | the only shape in which these fields say anything the others do not |

**Into `goldens.spec.ts`:** two conditional spreads beside `freeFloat`'s. **Two inserted lines, zero
modified.**

**Expected diff shape:** insertions only, in both files. No existing `expected` block is edited, no
case is reordered, and no date, float or `isCritical` value moves. If any of those change, the
re-baseline is not what this file predicted and the discrepancy is recorded rather than accepted.

## 5. Clause 2 — the snapshot

`level.parity.spec.ts:185` is the module's only `toMatchSnapshot()`. Its picked shape contains
neither new field, so it **must not move**. Checked by running the suite without `-u` and confirming
it passes; if it moves, a picked-field shape has silently widened and that is the finding.
