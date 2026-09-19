# M3 — the four conditions, judged

**Taken:** 2026-09-19, **one sitting**, tenant `shoot-co-1789806774538`, same servers throughout.

**The before and after readings are both from this sitting, and that is deliberate.** M1's baseline
was taken ~20 minutes and one server restart earlier, and the plan's own risk note says two readings
from different sittings are not comparable — `page-composition/m7-measurement.md` records this page
family drifting 555px with no product change at all. So the pre-remedy `ClientsTable.tsx` was
restored from `ed3e8f41` into the running dev server, measured, and the shipped file put back. Same
fixture, same browser, minutes apart.

M1's figures are unchanged by that and are not withdrawn — they agreed to the pixel (slack 1012,
`factSpread` 0, `firstRowTop` 305) on a _different_ tenant, which is a small piece of evidence that
the numbers are not fixture-sensitive in the way the slack bar would have been.

## The verdicts

| Condition                                | Verdict  | Evidence                          |
| ---------------------------------------- | -------- | --------------------------------- |
| FC-A — nothing wraps beside unused width | **PASS** | `cf-1280/1646/1920.json`, journey |
| FC-B — reflow at 320px                   | **PASS** | `drift-1646.json`, journey        |
| FC-C — nothing pushed below the fold     | **PASS** | `drift-1646.json`                 |
| FC-D — the emptiness actually falls      | **PASS** | `before-*` vs `cf-1646.json`      |

No condition was softened, no withdrawal clause was invoked, and the two clauses that could have
withdrawn the column did not fire.

---

## FC-A — nothing wraps beside unused width: **PASS**

Clients, all three widths, zero wrapped cells:

| Width | Table | Name      | Created   | Actions  |
| ----- | ----- | --------- | --------- | -------- |
| 1280  | 905   | 519 / 177 | 147 / 147 | 239 / 82 |
| 1646  | 1271  | 769 / 177 | 147 / 147 | 355 / 82 |
| 1920  | 1438  | 884 / 177 | 147 / 147 | 408 / 82 |

`Created` is `used === natural === 147` at every width, which is what `fit` means and is the
strongest possible statement that it cannot be the column that breaks: it is never offered less
than it needs. The withdrawal clause — a `Created` that cannot fit is **withdrawn**, not declared
`auto`, because a wrapped date reads as two dates — did not fire.

The probe's own control passed at all three widths, including the audit-log wrap it pins at 1280.
No run used `EXPECT_KNOWN_WRAPS=0`.

## FC-B — reflow at 320px: **PASS**

`overflowsBy: 0` at 1646, and the standing journey case `no list screen overflows a 320px viewport`
covers Clients at 320 and passed. `fit` is `md:`-upwards precisely so that `white-space: nowrap`
never applies where there is no room for it.

## FC-C — nothing pushed below the fold: **PASS**

`firstRowTop` **305 → 305**, unchanged. `mainScrollHeight === mainClientHeight === 949`, page does
not scroll. A column adds no height until its header wraps or a taller cell appears, and neither
happened. The standing gate `every list screen shows its first row above the fold at 1646` also
passed.

## FC-D — the emptiness actually falls: **PASS**, on both clauses

| Quantity                 | Before  | After   | Change            |
| ------------------------ | ------- | ------- | ----------------- |
| `factSpread`             | 0       | 769     | +769              |
| Table slack              | 1012    | 865     | **−147**          |
| `Name` used / natural    | 870/177 | 769/177 | natural unchanged |
| `Actions` used / natural | 401/82  | 355/82  | natural unchanged |

**Clause 1** asked for `factSpread > 0` against a baseline of literally `0`. It is 769.

**Clause 2 is the one that could have failed, and it lands exactly.** Slack falls by **147px**,
which is precisely the rendered width of the new column — so the column is paid for **entirely out
of existing emptiness**, to the pixel, and nothing was taken out of another column's content.
`Name` and `Actions` both keep their `natural` widths unchanged; only their surplus shrank. The
failure this clause exists to catch — a `Created` column bought by squeezing client names — did not
happen and could not have gone unnoticed if it had.

**FC-D is still a weak condition and is still labelled one.** Clause 1 is nearly trivially
satisfied by adding any second fact column; that is the honest statement of the row's complaint,
because the defect _was_ that the number is 0.

## What did not change, and is worth stating

The table is still **68% empty at 1646** (865 of 1271). One date column does not fill a row that had
1012px of slack, and this epic never claimed it would — `docs/TECH_DEBT.md` #343 asked for the fact
the screen already holds to be rendered, and it is. Whether Clients wants a third fact is a
different question with no candidate currently on the wire.

`Actions` at 355/82 remains the largest single pocket of surplus and remains deliberately untouched
(M1 §3, CQ-2): shrink-wrapping the trailing column moves the buttons further right rather than
closer to the facts, and doing it in the same milestone would have confounded clause 2 above — which
is the measurement that just landed on the pixel.
