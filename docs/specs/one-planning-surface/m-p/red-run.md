# M-P-T1 — the parity case, RED against the pre-M-P engine

Produced by reverting ONLY `compute.ts` to HEAD (`b0e2fdc9`) and running the FINAL fixture —
the one that ships, with `DONE_NO_START` and the late-starting `CHILD`. The earlier capture was
taken against an earlier draft of the fixture and is not what this milestone is judged on.

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modules/schedule/engine/compute.visual.spec.ts > computeSchedule — effective-Visual pass, Pass 1 parity where nothing is placed (FC-11) > visualEffective* equals early* for every activity when nothing is placed
AssertionError: expected { DONE: { …(2) }, …(8) } to deeply equal { DONE: { …(2) }, …(8) }

- Expected
+ Received

@@ -2,36 +2,36 @@
    "CHILD": {
      "finish": "2026-01-09",
      "start": "2026-01-06",
    },
    "DONE": {
-     "finish": "2026-01-05",
-     "start": "2026-01-02",
+     "finish": "2026-01-04",
+     "start": "2026-01-01",
    },
    "DONE_NO_START": {
-     "finish": "2026-01-05",
-     "start": "2026-01-06",
+     "finish": "2026-01-04",
+     "start": "2026-01-01",
    },
    "LEAD": {
      "finish": "2026-01-05",
      "start": "2026-01-01",
    },
    "LOE": {
-     "finish": "2026-01-05",
+     "finish": "2026-01-01",
      "start": "2026-01-01",
    },
    "SPINE": {
      "finish": "2026-01-03",
      "start": "2026-01-01",
    },
    "STARTED": {
-     "finish": "2026-01-02",
-     "start": "2026-01-02",
+     "finish": "2026-01-04",
+     "start": "2026-01-01",
    },
    "SUMMARY": {
-     "finish": "2026-01-09",
-     "start": "2026-01-06",
+     "finish": "2026-01-01",
+     "start": "2026-01-01",
    },
    "TAIL": {
      "finish": "2026-01-05",
      "start": "2026-01-04",
    },

 ❯ src/modules/schedule/engine/compute.visual.spec.ts:296:20
    294|       results.map((r) => [r.activityId, { start: r.earlyStart, finish:…
    295|     );
    296|     expect(actual).toEqual(expected);
       |                    ^
    297|   });
    298|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  src/modules/schedule/engine/compute.visual.spec.ts > computeSchedule — effective-Visual pass, a placement is inert against an actual (M-P) > a placed AND started activity renders on its actual, not on its placement
AssertionError: expected '2026-01-20' to be '2026-01-02' // Object.is equality

Expected: "2026-01-02"
Received: "2026-01-20"

 ❯ src/modules/schedule/engine/compute.visual.spec.ts:326:36
    324|     );
    325|     const p = byId.get('P')!;
    326|     expect(p.visualEffectiveStart).toBe(p.earlyStart);
       |                                    ^
    327|     expect(p.visualEffectiveStart).toBe('2026-01-02');
    328|     expect(p.visualEffectiveStart).not.toBe('2026-01-20');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  src/modules/schedule/engine/compute.visual.spec.ts > computeSchedule — effective-Visual pass, a placement is inert against an actual (M-P) > a placed summary and a placed LOE keep their DERIVED span, moved to the placement
AssertionError: expected +0 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 0

 ❯ src/modules/schedule/engine/compute.visual.spec.ts:358:73
    356|     expect(spanDays(h.earlyStart!, h.earlyFinish!)).toBe(4); // A's st…
    357|     expect(s.visualEffectiveStart).toBe('2026-01-10');
    358|     expect(spanDays(s.visualEffectiveStart!, s.visualEffectiveFinish!)…
       |                                                                         ^
    359|     expect(h.visualEffectiveStart).toBe('2026-01-10');
    360|     expect(spanDays(h.visualEffectiveStart!, h.visualEffectiveFinish!)…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 8 passed | 1 todo (12)
   Start at  13:38:59
   Duration  605ms (transform 57%, import 34%, tests 8%, worker 1%)
```
