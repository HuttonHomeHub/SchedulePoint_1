# M4 verdict: layout interchange

Judged 2026-09-24 against `conditions.md`, which was committed alone before any code and not edited
since, except for its one dated amendment (the lane label).

| #    | Condition                               | Verdict        | Evidence                                                                                                                                                                           |
| ---- | --------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FC-1 | NetPoint XER round trip is layout-exact | **Pass**       | `apps/api/test/layout-interchange.e2e-spec.ts`: 58/58 placements and every lane, visual dates and conflict reasons equal by code; `it.fails` through M0–M2, `it` since M3          |
| FC-2 | Foreign files unchanged                 | **Pass**       | The torture file's graph and report digests pinned at M0 pass unedited; persisted lanes measured against the post-M1 baseline. Scope: the two XER fixtures this repository imports |
| FC-3 | Edited-elsewhere file                   | **Pass**       | Same file: 0 carried lanes moved, the new activity and the corrupted one overlap nothing, conflict count equals the engine's, one `repair`                                         |
| FC-4 | Near-miss labels are foreign            | **Pass**       | `xer-layout-fields.spec.ts`: `… v1: Lane`, `… v1:lane` give a graph identical to the file without them; `… v2: lane` adds exactly one newer-version drop                           |
| FC-5 | Phase 3 leaves no drawn overlap         | **Pass**       | `m1-record.md`: torture 37–39 → 0, NetPoint 2 → 0, run-to-run lane differences 32–39 → 0                                                                                           |
| FC-6 | A real P6 opens the file                | **Unobserved** | No P6 was available (product owner, 2026-09-24). Not a pass; recorded as such in ADR-0156                                                                                          |
| FC-7 | Export unchanged in scheduling content  | **Pass**       | `visual-placement.spec.ts` against `golden/fc7-rich-export.pre-epic.xer`, written by the pre-M3 exporter and never regenerated                                                     |

## Reviews (M4-T1)

Six specialist reviews ran over M1–M3 before M2 merged (`m2-record.md`, "Review fold"), and a
security review of the export side ran after it, because M3 was held out of the tree during the first
pass (`m3-record.md`, "Review fold"). Every blocking finding was folded into the release that shipped
the code it concerned. The non-blocking suggestions not taken are `docs/TECH_DEBT.md` #387–#390; the
`@ApiBody` calendar-scope enum that restated its values was fixed rather than filed.

## Releases

The reader (M2) released as `api-v0.75.0` / `web-v0.148.0`, one release before the writer (M3), so no
deployed browser meets a report from a file it cannot parse (ADR-0156 D9).
