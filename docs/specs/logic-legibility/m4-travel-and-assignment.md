# M4 — travel and assignment

> **Status:** Complete. **FC-L6 passes for one of four candidates**, and that candidate goes to the
> product owner rather than being built inside this milestone — M4-T4's own stated dependency.
>
> `node apps/web/scripts/measure-assignment-vector.mjs`, at `df4ae28b`. Unit 300, band off, whole
> plan, 4 px/day.

FC-L6, verbatim, and encoded in the harness rather than applied by eye:

> A candidate is **offered to the product owner** only if it improves **at least one** of
> `occl/link`, `x/link`, mean |Δlane| by **≥ 20 %** while worsening **none** of the three by more
> than **10 %**. Height is reported and does not disqualify (decision 2).

## 1. The vector

| assignment              | rows | `occl/link` | `x/link` | mean \|Δlane\| | links > 5 lanes |
| ----------------------- | ---- | ----------- | -------- | -------------- | --------------- |
| shipped (packed + hint) | 21   | 0.261       | 1.856    | 2.670          | 30              |
| A chain rows            | 28   | 0.266       | 3.473    | 5.032          | 72              |
| B near predecessors     | 28   | 0.245       | 1.803    | 3.766          | 50              |
| C depth-first pack      | 23   | 0.319       | 2.128    | 3.181          | 35              |
| **D lane re-indexing**  | 21   | 0.271       | 1.915    | **2.016**      | **19**          |

| against shipped        | occl       | crossings  | travel      | rows       | verdict                    |
| ---------------------- | ---------- | ---------- | ----------- | ---------- | -------------------------- |
| A chain rows           | +2.0 %     | +87.1 %    | +88.4 %     | +33.3 %    | no component reaches −20 % |
| B near predecessors    | −6.1 %     | −2.9 %     | +41.0 %     | +33.3 %    | no component reaches −20 % |
| C depth-first pack     | +22.4 %    | +14.6 %    | +19.1 %     | +9.5 %     | no component reaches −20 % |
| **D lane re-indexing** | **+4.1 %** | **+3.2 %** | **−24.5 %** | **+0.0 %** | **OFFER**                  |

Three controls run before any figure is printed, and all three pass: every layout carries the same
**188** links (a framing that culls hands the win to whichever layout shows less of the plan, and
these candidates differ in height by design — M-C0-T2b's recorded error); every candidate is
**deterministic across two independent builds**, compared on the fingerprint of every drawn
polyline rather than on the lane map, because it is the picture that has to be stable; and lane
re-indexing **does not change the row count**, which is the structural claim `cheap-levers.md`
makes and which is the whole reason that candidate is cheap. The determinism control was verified
red by seeding the digest with `Math.random()` — it named the first candidate and refused to judge.

## 2. Chain rows, measured first, and both hypotheses are true

FC-L6's amendment required chain rows to be measured **before** anything else — it is the NetPoint
reference's own shape, and ADR-0149 D5's worst candidate — and required the result to be reported
as a decomposition, because **a measurement framed only by H1 would find H1**.

| assignment              | same-row links | occluded | rate      | cross-row links | occluded | rate      | by lane |
| ----------------------- | -------------- | -------- | --------- | --------------- | -------- | --------- | ------- |
| shipped (packed + hint) | 68             | 12       | 0.176     | 120             | 37       | 0.308     | 68      |
| A chain rows            | 68             | 10       | **0.147** | 120             | 40       | **0.333** | 68      |
| B near predecessors     | 59             | 10       | 0.169     | 129             | 36       | 0.279     | 59      |
| C depth-first pack      | 46             | 8        | 0.174     | 142             | 52       | 0.366     | 46      |
| D lane re-indexing      | 68             | 12       | 0.176     | 120             | 39       | 0.325     | 68      |

**Both hypotheses hold, and they very nearly cancel.** H1 is confirmed — chain rows lowers the
same-row occlusion rate from 0.176 to 0.147. H2 is confirmed — it raises the cross-row rate from
0.308 to 0.333. The aggregate moves **+2.0 %**, which is the sum of two real and opposite effects
and not the small number it looks like. A milestone that had reported only the aggregate would have
said chain rows "does nothing for occlusion", and a milestone that had reported only H1 would have
said it helps.

**So chain rows is rejected a second time, on a second metric — and this is the stronger result.**
ADR-0149 D5 rejected it on crossings alone, which left open the reading that the crossing metric was
simply the wrong question for it. It is not: on the metric built specifically to answer the
product owner's complaint it is still worse than shipped on every component, by +2.0 %, +87.1 % and
+88.4 %, for 7 extra rows.

### The finding nobody was looking for: the shipped packer already does what chain rows does

Chain rows and the shipped packing put **exactly the same number of links in one row — 68 of 188**.
That looked like a classifier that could not see the candidate, so the split was re-derived a second
way: the printed figure reads the **drawn polyline** (a link is same-row when its first and last
point share a y — `routeOrthogonal`'s own condition, `link-routing.ts:346`), and the `by lane`
column reads the **layout** (`lane(pred) === lane(succ)`). The two share no code and agree exactly on
all five rows.

So the coincidence is real, and it has a mechanism: ADR-0069's `packLanes` takes a **predecessor
hint**, which already places a successor in its predecessor's lane whenever that lane is free. An
explicit longest-chain decomposition finds no more same-row links than the greedy hint already
finds — it just spends seven rows, 87 % more crossings and 88 % more travel finding them. That is
worth knowing before anybody proposes chain rows a third time.

## 3. D qualifies, and it is not a packing rule

**Lane re-indexing is a relabelling.** It takes the shipped packing and permutes which row index each
lane occupies; the bars in a row, the row count and every bar's x are untouched. Its same-row
bucket is therefore **identical to shipped's, to the occluded link** (68 / 12 / 0.176), which is the
structural argument showing up as data rather than as a paragraph: a permutation cannot change which
bars share a row, so it can only move cross-row distance — and that is exactly where its figures
move (cross-row occlusion 37 → 39, travel 2.670 → 2.016).

- **Travel −24.5 %**, and long links (> 5 lanes) **30 → 19, a third fewer**.
- **Occlusion +4.1 % and crossings +3.2 %** — both real costs, both inside FC-L6's 10 % tolerance,
  and both stated here rather than left to the table.
- **Zero height cost.** It is the only candidate whose row count is structurally guaranteed not to
  move.

`cheap-levers.md` measured this at −7.5 % mean and −14.3 % long links on Unit 300 **and never on
occlusion or crossings**, and its own status line says it is not built. Both halves are now
supplied: the travel gain is larger than that file recorded (−24.5 % against −7.5 %, because that
reading was taken before M1/M2/M3 changed what the rows are), and the two components it never
measured are small and adverse.

**The rendered pair is `assignment-shipped.png` and `assignment-lane-re-indexing.png`** (same
viewport, same zoom, same framing, band off — only the assignment differs). The difference is
visible rather than merely arithmetical: the long vertical bundles on the left terminate roughly
half a screen higher, and the work that sat below the fold in the shipped picture is pulled up
beside the work it connects to. The nearly-empty summary rows move out of the middle of the diagram.

## 4. What this milestone does NOT do

**It does not build D.** M4-T4's stated dependency is "a qualifier from M4-T1/T2/T3, **and the
product owner choosing it**", and FC-L6 says a qualifier is _offered_. The trade being offered is
plain: a third fewer long links for 4 % more occlusion, at no height cost.

If it is chosen, M4-T4 is **one optional parameter of `packLanes`** — with `interchange.service.ts`
calling that function directly, so CQ-5's default applies (both callers, one parameter) and FC-L10
case 3 makes the scope checkable: omitted and neutral are two separate byte-identity cases. It would
also be a post-pass rather than a change to the packing itself, which is what keeps the byte-identity
argument structural.

`database-architect` is **not** engaged, because there is still no schema change to design — recorded
so that "the agent was not run" cannot read as an oversight.
