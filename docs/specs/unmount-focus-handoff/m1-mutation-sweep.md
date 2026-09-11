# M1 — the decision table, verified red

ADR-0110 D5: _a gate is not finished when it passes; it is finished when it has been made to fail by
the defect it was written for._ Ten mutations were applied one at a time to
`use-focus-handoff.ts`, each run against the whole suite, and the source restored afterwards.

| #   | Mutation                                          | Result             |
| --- | ------------------------------------------------- | ------------------ |
| M1  | remove `target.focus()`                           | **RED** (8 failed) |
| M2  | remove the `activeElement` guard                  | **RED** (1)        |
| M3  | remove the containment check when it acts         | **RED** (1)        |
| M4  | clear the record on every blur                    | green — see below  |
| M5  | remove the containment guard at record time       | **RED** (1)        |
| M6  | omit the record clear                             | green — see below  |
| M7  | early-return on an empty resolved list            | **RED** (2)        |
| M8  | announce before focusing                          | **RED** (6)        |
| M9  | drop `[data-toolbar-item-scope]` from attribution | **RED** (1)        |
| M10 | look the reason up when it acts, not at focus     | **RED** (2)        |

## The two that stayed green, and why neither is softened

**M4 — the blur rule — is not coverable at this tier, and that is jsdom rather than the rule.**
Probed directly: in jsdom, removing the focused node sets `document.activeElement` to `BODY` and
dispatches **no blur event at all** (`blurCalls=0`). There is therefore no blur for the mutation to
mishandle. In Chromium a removal blurs with **no related target**, which is exactly the case the
handoff must still read as "we had focus" — the rule `selection-actions.tsx:971-977` records for the
same reason. It is covered by the M3 journey, against a real browser. The half jsdom _can_ see — a
blur **with** a related target clears the record, so a reader who moved on is not yanked back — has
its own case, which is red without the clear.

**M6 — the record clear — is masked by the `activeElement` guard, and is kept as defence in depth.**
Omitting it does schedule a second frame on the next commit, but by then the container already holds
focus, so the guard turns it away and nothing is announced twice. The guard is the load-bearing rule.
The clear means one removal can never _schedule_ more than one handoff, which is cheap and true; the
case that covers it asserts the property a reader cares about (two items leaving produces one
announcement) and is honest in its own comment that it holds for two independent reasons.

## An instrument failure, recorded because it nearly stood

The first sweep reported **STILL GREEN for all nine** mutations it then had. It was passing
`--reporter=basic`, which vitest 4 does not have: every run died loading the reporter, before a
single test executed, and the script's verdict came from grepping for failure markers — of which
there were none, because there were no tests.

The repair is the one this repository keeps arriving at: the verdict now requires the run to have
executed a **known population** (`failed + passed === 16`) before it means anything. That guard
immediately earned its keep twice, reporting `WRONG POPULATION (14 of 15)` and then `(15 of 16)` as
cases were added — a sweep measuring a suite it did not have would otherwise have read as a result.
