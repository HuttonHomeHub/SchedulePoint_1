# M0-T1 — The recovered `.corporate` derivation

**Recovered 2026-08-21.** The light corporate theme ADR-0097 deleted, read back from git with its
reasoning attached, and every figure in the spec re-derived against it rather than quoted.

## How it was recovered, and why not by line number

```bash
git show 44f1c59^:apps/web/src/styles/globals.css > /tmp/pre97.css
start=$(grep -n '^\.corporate {' /tmp/pre97.css | cut -d: -f1)
end=$(awk -v s="$start" 'NR>=s && /^\}/ {print NR; exit}' /tmp/pre97.css)   # 508..730
```

The plan's own risk note said to **verify by content, not by trusting the range**, and that earned
its keep on the first command: the coordinator's brief quoted lines `508,1020`, which opens
correctly at `.corporate {` and then overruns the block by 290 lines into the `[data-surface]`
rebind blocks and the `@theme inline` header.

The overrun was invisible to a name count — both ranges report **117 unique names** — because
everything the extra 290 lines add is a _rebind_ of a bare name the block already declares. A wrong
range that produces the right number is the most durable kind of wrong, and it would have been
inherited by every later figure. The block is **lines 508–730, 223 lines, 117 declarations, 117
unique names** (no duplicates).

The verbatim block is preserved in `m0-recovered-block.css` beside this file.

## The three figures, re-derived

| Figure                                      | Spec §0.3            | Re-derived                           | Verdict   |
| ------------------------------------------- | -------------------- | ------------------------------------ | --------- |
| Unique names in the recovered block         | 117                  | **117**                              | confirmed |
| Declarations in today's `:root`             | 271                  | **271** (271 unique — no duplicates) | confirmed |
| Recovered names absent from today's `:root` | none (strict subset) | **none**                             | confirmed |

`comm -23` of the two name sets is empty: not one of the 117 has since been renamed or removed, so
there is no stale vocabulary to discard.

## The composition arithmetic — corrected

Spec §3.1 gives `182 literal colours + 53 var() aliases + 35 non-colour`. That sums to **270**, one
short of 271. Measured:

```
literals   grep -cE '^\s*--[a-z0-9-]*:\s*(oklch|#|rgb|hsl)'   182
var()      grep -cE '^\s*--[a-z0-9-]*:\s*var\('                54
remainder  271 - 182 - 54                                      35
```

**54, not 53.** The spec is corrected in place. The 182 and the 35 are confirmed, and the 35 are
exactly the geometry, weight, type-scale and font-stack tokens — `--radius`, `--control-h`,
`--control-h-sm`, `--row-h`, five `--weight-*`, twenty-three `--type-*` and the two font stacks.

**ADR-0097's claim that `.dark`/`.corporate` declared zero non-colour tokens is confirmed**: no
declaration in the recovered block has a non-colour value. That is what makes the 35 safe to leave
alone, and it is also the ADR's own point — a theme in this product could express nothing but colour,
which is why "designed" could only ever have meant "recoloured".

## The classification — all 271

| Category             | Count   | What it means for M1/M2                                                                                                                |
| -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `recovered`          | **117** | A value exists in the deleted block, derived on a light ground with its reasoning attached. **Re-verify, do not re-derive.**           |
| `non-colour`         | **35**  | Untouched. Theme-invariant by construction.                                                                                            |
| `page-rename`        | **31**  | The `--page-*` closure. Ancestors are bare names in the recovered block (`--page-background` ← `--background`), so largely mechanical. |
| `plot`               | **31**  | The diagram scope. **The genuinely new design work**, and the reason M2 is its own milestone.                                          |
| `new-closure-member` | **29**  | `-hover` / `-secondary` / status members added across scopes after the deletion.                                                       |
| `theme-invariant`    | **26**  | `--brand-*` and `--auth-*`. Fixed by ADR-0077 §2/M7; not this epic's to move (see §4.5 for the one instrument that could change that). |
| `pack`               | **2**   | `--canvas-minimap-frame` and `-halo`. ADR-0100, landed this week — they postdate everything and have no ancestor at all.               |
| **Total**            | **271** |                                                                                                                                        |

Reproduce with the script in the M0 commit message.

## What this does to the epic's cost

**61 of 271 declarations do not move** (35 non-colour + 26 theme-invariant) and **117 have a
measured light value to verify rather than invent**. The work that is genuinely new derivation is
**93**, and it is not evenly hard: the 31 `page-rename` are close to mechanical, the 29 closure
members are variations on values the recovered block already fixes, and the real judgement is
concentrated in the **31 `plot` tokens plus the 2 minimap tokens** — one surface, which is exactly
the milestone boundary the plan drew before this classification existed.

This falsifies ADR-0097's own costing in the helpful direction. That ADR prices a theme's return at
"~110 declarations" plus "a week of design judgement" and says the caveat is not softened. The
declaration count is right. The judgement half is **substantially already spent and recoverable**,
for everything except the diagram — which is the one surface ADR-0099 re-derived after the deletion,
and therefore the one place where there is nothing to recover.

## The 117 that cannot simply transfer, and why

Recovery is a starting derivation, not a patch. Named explicitly so nobody treats it as one:

1. **Everything `--plot-*` (31).** The recovered block predates the diagram becoming a surface scope.
   Its `--canvas`/`--canvas-band` pair is the whole of what it says about the diagram — two values
   against today's 31 — and ADR-0099 re-derived the plot palette against a dark ground in between.
   **Nothing here transfers.**
2. **The minimap frame pair (2).** Landed 2026-08-21 (ADR-0100). No ancestor exists. Its two-tone
   frame was derived against a dark ground and is the token most obviously wrong on a light one — a
   white stroke on paper.
3. **Every closure member added after the deletion (29).** `-hover`, `-secondary` and the status
   fills exist per scope now and did not then. They are derivable _from_ the recovered values rather
   than _in_ them.
4. **`--canvas-nonworking-hatch`.** The recovered block has one (`oklch(0.83 0.004 90)`) and it is
   **not** transferable as a number: today's is a hatch over a wash, and ADR-0056 changed what that
   token draws. The recovered value is evidence of the intended _quietness_, not of the value.
5. **Anything the contrast matrix now sweeps that it did not then.** The scope set changed
   (`--page-*`/`--plot-*` split, `auth` added), so a recovered value that passed in its day passed a
   different matrix. **M1 is a measurement milestone for this reason**: apply the derivation, let the
   gate say what broke, re-derive what broke — never re-floor it.

## The reasoning worth keeping, verbatim from the block

Three pieces of Light-era reasoning become live again the moment the ground flips, and all three are
constraints rather than preferences:

- **Amber cannot be the page's primary.** _"a solid amber button on the off-white page is 1.92:1
  against it: WCAG 1.4.11 asks for 3:1 where a fill is what identifies a control, and darkening amber
  far enough to reach it lands on the bronze this theme already uses for `--warning`."_ So amber goes
  to `--chrome-primary` (7.9:1 on navy), `--chrome-ring`, the `--accent` row wash and `--chart-1`,
  and the page's primary is brand navy at 12:1. **CQ-1(a) keeps every one of those placements valid.**
- **`--warning` is bronze, not amber**, for the same reason and to keep the two distinguishable.
- **The `--accent` row wash is a tint** (`oklch(0.955 0.04 78)`) precisely so ordinary dark text keeps
  its contrast on top of it — the rule that makes hover states cheap on a light ground and is the
  opposite of the dark theme's approach.
