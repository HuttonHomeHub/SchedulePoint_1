# M3-T2 measurement record: seven destinations in the left rail at 1024 × 600

Recorded 2026-10-14 against the milestone-3 code (`Export data` as the seventh organisation destination).
Evidence for plan Task 3.2 (ADR-0113: measure the problem; ADR-0179: the 1024 × 600 floor). Container
Chromium, layout only; the shared sandbox, so read the heights, which do not depend on machine speed.

## The question, and the rule fixed before the numbers were read

The rail's column (`navigator-rail.tsx`) is a flex column that scrolls as a whole (`overflow-y-auto`)
around a tree with a four-row floor (`min-h-32`, 128 px). The plan's rule is "does the organisation nav fit
without pushing the tree to zero height or clipping a link?". Written as a test, before measuring:

1. **The tree keeps at least its 128 px floor**, in every form measured.
2. **No link is clipped**: every one of the seven is wholly inside the visible window, or, where the column
   scrolls, wholly inside it once scrolled to the end.
3. **The seventh row hides nothing that was visible with six**: no link, and not the version footer.

Fails any one of these: use the fallback (an **Export data** link in the Members page header, rail stays at
six).

## The harness

Throwaway, not committed (as in `minimum-viewport/m4-measurement.md`). A Playwright spec on the audit suite's
config (real API, real database): sign up an Org Admin, create an organisation, open the organisation at
1024 × 600, read `getBoundingClientRect()` of the rail, the tree region, the organisation nav, the footer and
each link; then set `display: none` on the seventh link and read the same again, which gives the six-link
baseline **on the same page with the same fonts**; then press **Hide Project Explorer** and repeat for the
icon strip. Fine pointer is a plain context; coarse is `hasTouch: true`, checked with
`matchMedia('(pointer: coarse)')` before reading. The tree held no clients (its region is a flex fill with
a 128 px floor, so its contents do not change its height until they exceed it).

## Results (CSS px, 1024 × 600)

**Expanded rail** (the rail's visible window is 549 px fine, 545 coarse):

| Pointer | Links | Link height | Org nav | Tree region | Rail scroll range | Links visible unscrolled | Footer visible |
| ------- | ----- | ----------- | ------- | ----------- | ----------------- | ------------------------ | -------------- |
| fine    | 6     | 28          | 195     | 281         | 0                 | 6 of 6                   | yes            |
| fine    | **7** | 28          | 225     | **251**     | **0**             | **7 of 7**               | **yes**        |
| coarse  | 6     | 44          | 291     | 177         | 0                 | 6 of 6                   | yes            |
| coarse  | **7** | 44          | 337     | **131**     | **0**             | **7 of 7**               | **yes**        |

**Collapsed rail** (icon strip; its window is 497 px fine, 477 coarse):

| Pointer | Links | Link size | Strip height | Window | Scrolls | All links inside |
| ------- | ----- | --------- | ------------ | ------ | ------- | ---------------- |
| fine    | 6     | 36        | 235          | 497    | no      | yes              |
| fine    | **7** | 36        | 273          | 497    | no      | yes              |
| coarse  | 6     | 44        | 283          | 477    | no      | yes              |
| coarse  | **7** | 44        | 329          | 477    | no      | yes              |

The seventh row costs 30 px on the fine rail (28 + the 2 px gap) and 46 px on the coarse rail (44 + 2), and the
numbers above agree with that to the pixel (225 − 195, 337 − 291). The six-link block reads 195 and 291, the
figures `navigator-rail.tsx:123-124` and `minimum-viewport/m4-measurement.md` record, so the baseline is
the one already in the repository's evidence.

## Decision: the rail link ships

| Rule                                       | Fine, expanded   | Coarse, expanded   | Collapsed (both) |
| ------------------------------------------ | ---------------- | ------------------ | ---------------- |
| 1. Tree keeps its 128 px floor             | 251 px, passes   | **131 px, passes** | not applicable   |
| 2. No link clipped                         | all seven inside | all seven inside   | all seven inside |
| 3. The seventh hides nothing seen with six | passes           | passes             | passes           |

Seven destinations fit at 1024 × 600 in all four forms with **no scrolling of the rail at all**, so the
entry point stays where the plan puts it: the left rail's organisation list, **Export data**. The
fallback is not used.

**The thin margin, stated:** coarse and expanded leaves the tree 131 px against its 128 px floor, 3 px of
slack. It passes, but the next destination added to this list would not (46 px more would take the tree to
the floor and start scrolling the column, which `navigator-rail.tsx` already tolerates by design). That is
the useful number for whoever adds an eighth: at the floor on a touch screen the rail is full at seven.
