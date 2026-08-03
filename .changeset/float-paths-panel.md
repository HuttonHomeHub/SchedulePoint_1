---
'@repo/web': minor
---

Add the **Float paths** panel (behind `VITE_FLOAT_PATHS`, default off) — audit F4, M1.

The engine has computed the ranked contiguous driving chains into an activity since M6-F6
(ADR-0035 §19), and `GET …/schedule/float-paths` has exposed them since the reconciliation pass that
followed. **Nothing in the product ever called it.** So the question a planner actually asks — _if I
compress the critical path, what binds next and by how much?_ — could be answered by SchedulePoint's
engine and only read in the tool SchedulePoint exists to replace.

Flag ON adds a **Float paths** item to the toolbar's `find` group and a docked right panel that
ranks the chains, live in **both** the Diagram and the Gantt: it is an analysis, not a viewport
command. Relative float renders from `relativeFloatMinutes` on the target's calendar, never the
deprecated day field. The panel fetches on open with `staleTime: 0` — a measured decision
(100.4 ms p95, 0.61× a recalculate on a 540-activity plan), not a guess.

**Three fixes this milestone's design review found in shipped code, none flag-gated:**

- The **Gantt did not feed the workspace selection**. It wrote only its own `logicActivity`, so the
  toolbar's selection-aware items (Update progress, Add note, Clear visual placement) answered with
  a stale _canvas_ selection while the Gantt showed something else — and were shaded forever in a
  session that started in the Gantt. Both stores are now written together, which is what this file's
  own comment already claimed ("selection is workspace state, not view state").
- **Isolate logic path was lit and inert in the Gantt.** It drives canvas state only `TsldPanel`
  reads, and `TsldPanel` is unmounted there. It now shades with "Only in the diagram view".
- A chain member the client does not hold was styled un-activatable but **was still activatable**:
  `pointer-events-none` styles a refusal, it does not enforce one, and a keyboard Enter walks past
  it. Now `aria-disabled` plus a click guard, the shipped rule.

Flag-off is byte-for-byte the prior product — no toolbar item (not even a placeholder), no panel, no
query — pinned by a parity suite that is the rollback contract.

**The CPM engine is not imported.** The ADR-0034 recalc parity gate is untouched by construction.
