# What the NetPoint reference picture actually shows

**Status:** Evidence for [`feature-spec.md`](./feature-spec.md). Measured 2026-09-24 from the
power-plant picture the product owner supplied: a NetPoint 4.1 export, 1632 × 1056 px, with the
footer `NetPoint 4.1 © 2007-2012 PMA Technologies LLC … Schedule Unit: HalfMonths`.

**The image is not committed.** It is a vendor's copyrighted screenshot and this repository is
public. Every figure below was taken from the pixels with PIL (sampled colours, run lengths along
named rows and columns), so a reader holding the picture can re-derive each one. Nothing here is
recalled from general knowledge of NetPoint. The previous review (2026-09-24) did rely on general
knowledge, and five of its guesses are corrected in the last section.

## The marks, measured

| Mark                    | What the pixels show                                                                                                                                                                                                                                                                                                                                                                                                          | Contrast on white                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Ground                  | Pure white `#FFFFFF`.                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                  |
| Time grid               | 1 px vertical lines, **dashed 3 on / 3 off**, grey `#C8C8C8`, one per time unit (a half month, 32 px apart at `x = 603, 635`). There is no heavier month or year line anywhere in the plot. Month, quarter and year boundaries appear **only in the three-tier header**. There is also a faint horizontal dotted rule, `#DCDCDC`.                                                                                             | 1.67:1 (and dashed, so effectively lighter); rules 1.37:1          |
| Activity bar            | A solid line **6 px** thick (`x = 300`, `y = 182–187`). Non-critical `#0F8C37` (green); critical `#ED2424` (red).                                                                                                                                                                                                                                                                                                             | green 4.35:1, red 4.30:1                                           |
| Node                    | A **15 px hollow circle**: a 1 px rim in the bar's colour and a white centre. One at every start and finish. Where one activity's finish meets the next one's start there is a **single shared node** (e.g. 5/16 between Fab/Del Pipe and Start Pipe, 2/1 between Pipe 10-30% and Pipe 31-70%).                                                                                                                               | rim as bar                                                         |
| Link                    | A **3 px** line in pale yellow `#EBEB20`, carrying **red direction marks**: elongated arrow shapes about 17 px long and 3 px tall, pointed at both tips (17 px on the centre row, 9 and 5–6 px on the rows either side), repeated every **~41 px**. Seen at `y = 126–128` along the link from Mob to Fab/Del Electrical.                                                                                                      | yellow **1.28:1**; red marks 4.30:1 on white, 3.37:1 on the yellow |
| Link length label       | A small **boxed blue number** on every link that crosses time, giving the gap in **schedule units** (half months). Checked on five links: Mob (4/1/2015) → Fab/Del Condenser (12/1/2015) reads `16`, which is 8 months. Mob → Fab/Del E&I (7/1/2016) reads `30` (15 months). Mob → Chimney Fdn (11/1/2015) reads `14` (7 months). Mob → Fab/Del CW Pipe (5/16/2015) reads `3` (1.5 months). Set Condenser → Hydro reads `24`. | blue on white                                                      |
| Mid-activity attachment | A small **filled yellow dot** on a bar wherever a start-to-start or finish-to-finish link joins partway along it (Fit & Weld Boiler, Erect Boiler, Fab/Del CW Pipe, Install Circ Water Pipe). The key names these two link types and draws the dot.                                                                                                                                                                           | —                                                                  |
| Link routing            | Mostly orthogonal. A shared vertical bus runs down the left from Mob, with horizontal branches into each row. **Some links are straight diagonals** where the two ends differ in both row and date: Boiler Fdns 1/31 → Erect Boiler Steel 3/1; Erect Boiler Steel 8/31 → Erect Boiler 11/1; Turbine Fdns 9/30 → 11/1; Checkout 11/1 → Steam Blows 5/1.                                                                        | —                                                                  |
| Activity name           | Black regular sans, about 12–13 px, **centred above** the bar. No activity code. Long names **wrap to two lines** ("Erect Steam / Turbine Generator", "Chem / Clean", "Steam / Blows"). No name is truncated.                                                                                                                                                                                                                 | black                                                              |
| Dates                   | `m/d`, black, small, **under the node**. A start date sits just right of its node; a finish date sits under its node. No duration, float, or "float left" text anywhere.                                                                                                                                                                                                                                                      | black                                                              |
| Milestone               | A small **downward triangle**: green if non-critical, red if critical. The project's start (NTP) and finish (Guaranteed Commercial Operation) are an **hourglass** (two triangles). Every milestone label is **bold red**, noticeably larger than activity names, and set above-left of its symbol, **whatever the milestone's criticality**. Dates are shown for some milestones and not others.                             | red                                                                |
| Area labels             | **Bold red** words at the left end of a row: "AQCS", "345 KV Switchyard", "Coal Handling". They name the chain of work in that row.                                                                                                                                                                                                                                                                                           | red                                                                |
| Critical path           | Red bars with red node rims; the links into and out of the chain also carry red.                                                                                                                                                                                                                                                                                                                                              | 4.30:1                                                             |
| Density                 | Row pitch **≈ 57 px** (bars at `y = 127, 184, 242, 299, 357, 414`). Empty rows are left where the planner wanted space.                                                                                                                                                                                                                                                                                                       | —                                                                  |
| Key                     | A pale yellow box inside the plot: "Time Unit = 1/2 Months", with drawn examples of an activity, an SS link and an FF link.                                                                                                                                                                                                                                                                                                   | —                                                                  |

## What makes it read well

Four principles, each stated from the table above rather than from taste:

1. **Every class of mark has its own hue and its own shape.**
   - Bars are green or red; links are yellow with red arrows; gap lengths are blue; names are black.
   - No two classes share a colour, so the eye sorts them before it reads them.
   - Our canvas does the opposite. The bar and the driving link are the same `--primary` blue, and the non-driving link, the bar and the month gridline sit between 3.15:1 and 3.98:1 on our ground. One luminance band holds four different things.
2. **The time grid is the quietest mark.**
   - It is dashed, 1.67:1, and uniform. The calendar's structure is read from the header, not from the plot.
   - Our month gridline is 3.98:1 and our year gridline 5.78:1. Both are louder than any non-critical link (3.35:1) or bar (3.15:1).
   - On a time-scaled diagram most link segments are vertical, so the grid and the logic compete for exactly the same shape.
3. **An activity is an object, and a link is a connector between objects.**
   - Bar and link widths are 6 px and 3 px.
   - The 15 px node is the largest mark on the picture, and it is where links land.
   - Ours are 5 px and 2 px, with a node that disappears into a blue bar.
4. **Text says identity and dates, nothing else.**
   - Names are wrapped, not truncated, and there are no codes.
   - Dates sit at the nodes they date.
   - Duration and float are not printed. The gap on a link is a number on the link, in the plan's own unit.

## What does not transfer

These are measured defects in the reference, not preferences:

- **The link line fails WCAG 1.4.11** (1.28:1 on white). It is visible only because of its red marks. We need the line itself at 3:1 or better.
- **Critical and non-critical differ by hue alone.** Red against green is **1.01:1** in luminance, the classic red–green confusion. Our product already carries criticality in node shape and a lightness ladder (ADR-0151 M6, ADR-0097 Landing E), and that must survive.
- **Milestone labels are red whatever their criticality.** That uses the critical colour for emphasis, and so weakens what red means.
- **Diagonal links were rejected here by ADR-0065.** On a time-scaled diagram a slope asserts work across the days it crosses. That is a real trade-off, not a defect in either product, and it is left to the product owner (feature-spec CQ list).

## Five corrections to the 2026-09-24 review, which guessed

| The review guessed                             | The picture shows                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Links "neutral graphite"                       | Links are **coloured**, a distinct hue from bars, with repeated direction marks.                            |
| Float drawn as "a light tail after the finish" | **No float tail.** The gap on each link is a **boxed number in schedule units**.                            |
| Area bands "as row headers down the left edge" | Bold labels **inline at the start of the row**, not a separate column.                                      |
| Diamonds for milestones                        | **Triangles**, and an **hourglass** for the project's start and finish.                                     |
| "Chevrons only at detail zoom"                 | Direction marks are **dense and always on**: every ~41 px, and they are what makes the link visible at all. |
