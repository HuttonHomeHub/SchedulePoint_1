# NetPoint grammar — M0-T5 and M0-T6: the basis check, the harness control and the baselines

## M0-T5 — the spoken slack and the drawn gap share one basis already

Spec §4.13 X1 gated M3 on this check, in case `slackByDependencyId` (early dates,
`geometry.ts:284`) disagreed with the painter's drawn gap on a placed plan. **It does not, and has not
since 2026-09-23.** `TsldPanel.tsx:1809-1820` feeds the builder the DRAWN dates (`barDatesFor(a,
barDateSource)`), and `TsldPanel.drawn-slack.test.tsx` pins it: "names the gap the canvas draws for a
placed successor, not the network gap". That was the fix for the defect `docs/TECH_DEBT.md` #372
records.

So M3 has no basis to unify. It changes the **unit** (calendar days to working days) for the canvas
label and the spoken sentence in one change, through the one builder.

## M0-T5 — the harness control (FC-G0)

`crossing-probe.ts`'s `linkPaths` now refuses a **closed** path stroked in a link sentinel. A link is
an open polyline. The node rim, the lag plate's border and the attachment dot are closed shapes, and
from M2 and M3 they are stroked in link or rung inks. Counted as links, they would inflate every
crossing count with nothing looking wrong.

- **Verified red:** a synthetic five-point rim in `LINK_SENTINELS.critical` throws, and an open
  three-point route passes.
- **Verified harmless:** `node scripts/measure-crossings.mjs` runs cleanly against today's painter,
  whose measured figures are unchanged (shipped 2.170, scramble 6.452, FC-C1 still 2.97×).

The per-mark sentinels land with each mark, in the milestone that adds its palette key, as the plan's
rules require. A sentinel for a key that does not exist yet would not typecheck.

## M0-T6 — the FC-G1 and FC-G1b baselines

Produced by `apps/web/scripts/netpoint-grammar-baseline.ts`
(`pnpm exec tsx scripts/netpoint-grammar-baseline.ts` from `apps/web`). Two consecutive runs were
byte-identical. Each milestone re-runs it and diffs the output against this file. **Any change in a
fingerprint or a lane digest is a defect in that milestone** (FC-G1, FC-G1b).

The viewport holds the whole plan, and the script refuses to fingerprint unless every edge is drawn.
A culled reading would fingerprint a subset.

## FC-G1 — route fingerprints (every link polyline, whole-plan viewport)

| Plan               | px/day | links | edges | crossings/link | fingerprint    |
| ------------------ | ------ | ----- | ----- | -------------- | -------------- |
| reference-netpoint | 1      | 68    | 68    | 0.044          | `b9666fa5608e` |
| reference-netpoint | 4      | 68    | 68    | 0.044          | `45c06f405442` |
| reference-netpoint | 12     | 68    | 68    | 0.044          | `d3ae533117ca` |
| reference-netpoint | 40     | 68    | 68    | 0.044          | `c103c8e2a7f2` |
| chain-3-placed     | 1      | 2     | 2     | 0.000          | `907e1732b6c4` |
| chain-3-placed     | 4      | 2     | 2     | 0.000          | `45c068f927b2` |
| chain-3-placed     | 12     | 2     | 2     | 0.000          | `02710b0a7cc6` |
| chain-3-placed     | 40     | 2     | 2     | 0.000          | `bd7b004e1204` |
| small-17           | 1      | 29    | 29    | 0.621          | `0402ab01b870` |
| small-17           | 4      | 29    | 29    | 0.103          | `74cdfd5da2a2` |
| small-17           | 12     | 29    | 29    | 0.103          | `20240d84eded` |
| small-17           | 40     | 29    | 29    | 0.414          | `46da33435a48` |
| Unit 300           | 1      | 188   | 188   | 2.261          | `587b7c0407b5` |
| Unit 300           | 4      | 188   | 188   | 1.995          | `a5a2fd50f937` |
| Unit 300           | 12     | 188   | 188   | 2.133          | `d6666f1a7735` |
| Unit 300           | 40     | 188   | 188   | 2.197          | `aa9840c1fb3e` |
| scale-2000         | 1      | 3200  | 3200  | 2.276          | `5ca5498c7b3b` |
| scale-2000         | 4      | 3200  | 3200  | 2.274          | `d2f2ad3f59e9` |
| scale-2000         | 12     | 3200  | 3200  | 2.276          | `6b3de46ddf2d` |
| scale-2000         | 40     | 3200  | 3200  | 2.363          | `d820a3d12736` |

## FC-G1b — Tidy and Re-layout lane assignments

| Plan               | Tidy (seed: current rows) | Re-layout (seed: packed) |
| ------------------ | ------------------------- | ------------------------ |
| reference-netpoint | `80340041e44c`            | `95c5f2a75ce2`           |
| chain-3-placed     | `835830c85bcb`            | `835830c85bcb`           |
| small-17           | `a22d6cefb9c6`            | `a22d6cefb9c6`           |
| Unit 300           | `d4f601def200`            | `d4f601def200`           |

## M0-T6 — the journey scaffold

`apps/web/e2e-netpoint-grammar/` (`playwright.netpoint-grammar.config.ts`,
`pnpm --filter @repo/web test:e2e:netpoint-grammar`) seeds the reference plan through the public API
with the pen enforced. It opens the plan and checks that the canvas scope resolves its grid tokens.
It ran green locally in 34.8 s (`scripts/e2e-local.sh web:netpoint-grammar`). It is placed on CI
shard 4, and `check:e2e-roster` projects the shards at 545 s, 564 s, 521 s and 555 s against a 593 s
budget.

## M1 — the grid and the ground (2026-09-24)

- **FC-G1 and FC-G1b:** `netpoint-grammar-baseline.ts` re-run after M1. It is **byte-identical** to
  the table above, so no route and no lane moved.
- **FC-G2:** the NetPoint block's overlay lost every entry M1 shipped. The same cases now read the
  CSS, and the screen's old month and year floor moved to paper's own tokens
  (`--canvas-paper-grid-*`, ≥ 3:1 on `--print`).
- **One value differs from `m0-solved.md`, because a gate refused it.** The month band is 1.02:1,
  not 1.05. The solver kept each surface's own separation, which put the non-working wash (1.03)
  lighter than the band it paints over. `print-palette.structural.test.ts` ("the three grounds keep
  their order") refused that. The wash keeps its quiet value, because the prototype showed a louder
  one striping every weekend, and the band gives way (month bands are off by default, ADR-0109 D4).
- **FC-G6:** the golden log was predicted before the re-baseline: only grid-layer entries change,
  with `setLineDash([3,3])` on day and month, the year going from `lineWidth` 2 on an integer x to 1
  on a half-pixel x, and a `setLineDash([])` reset. The diff matched line for line (`setLineDash`
  total 10 → 14), and it was edited in by hand.
- **FC-G7:** `paint.grid-budget.test.ts` pins one `setLineDash` per tier plus the reset, identical at
  10 and 40 px/day. That was verified red by moving the call into the per-line loop.
- **Journey:** `e2e-netpoint-grammar` asserts the shipped token values on the scene canvas and
  reads the pixels for a dashed rule. The pixel read took two corrections:
  - its first version counted a transparent pixel as ink (the scene canvas does not paint its own
    ground), so it saw a dashed rule as one line;
  - its second version counted every on/off transition, and solid rules then scored 37 against a
    threshold of 40, because bars crossing a column flip it too.

  The shipped metric counts 2–4 px ink runs between 2–4 px gaps. Solid rules score 7 against a
  threshold of 20, so it separates cleanly.

- **Other journeys run:** `arrange` (12), `export` (3), `minimap` (1) and `axis-markers` (2), all green.
