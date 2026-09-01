#!/usr/bin/env bash
#
# Run EVERY flag-on Playwright suite, in series, each against its own freshly-started servers.
#
# **Why this exists** (`docs/TESTING.md` step 4b). ADR-0091's retrospective records three journeys
# breaking across one label change, each found by CI rather than by the author, because only the
# suite CI named was fixed. ADR-0098 M5 then found a **third** spec asserting a deleted heading
# after a `grep` had already fixed two — the grep covered `src/` and `e2e/`, and the survivor lived
# in `e2e-edit/`. A search for a string is scoped by whichever directories you remember; a sweep is
# not scoped by anything.
#
# **`web` leads the list, and it was missing until Graphite M7.** That target is the BASE journey —
# the one covering the shipped default configuration — and its absence meant the sweep could not
# catch a defect on the very screens every other suite signs in through. It did not: `e2e/schedule`
# started timing out on `Settings…` when M5 merged the command rows and put that command in the `⋯`,
# and the sweep ran thirty-three suites green over it twice. ADR-0096 added `web` as a target to
# `e2e-local.sh` for exactly this reason and stopped one line short of here.
#
# **Not a per-change step.** Forty-odd suites is the best part of an hour. It belongs to a change
# that replaces a screen every journey signs in through, or moves a control every journey clicks.
#
# **The list is DERIVED from `apps/web/package.json`, and it used to be typed out here.** That is
# ADR-0058's rule applied to this file: the hand-written list was wrong in both directions at once
# and had been for some time. It named `toolbar-fit`, for which there is no script and no directory
# — `e2e-local.sh` maps `web:<name>` to `test:e2e:<name>`, so that entry resolved to nothing and the
# sweep carried on — and it OMITTED seven suites that do exist: `workspace-fit` (which measures
# WCAG 2.5.8 target size, i.e. the one thing a layout change is most likely to break),
# `axis-markers`, `csp`, `export`, `minimap`, `shell` and `unsaved-work`. A sweep whose whole
# argument is "a search is scoped by whichever directories you remember" was itself scoped by
# whichever suites somebody remembered.
#
# So the default is now every `test:e2e:*` script the package declares. A suite added tomorrow is
# swept tomorrow, and a suite deleted stops being named the same day.
#
# **The servers are killed between suites and that is load-bearing**, not tidiness: the `VITE_`
# flags bake at `webServer` start and `reuseExistingServer` is true outside CI, so a suite that
# inherits the previous one's servers silently runs against the previous one's configuration —
# which is exactly the trap ADR-0088 records the estate being full of.
#
# Usage:  scripts/e2e-sweep.sh              # every suite
#         scripts/e2e-sweep.sh edit wbs     # just these
#
# Per-suite output lands in /tmp/sweep-<name>.log; this prints one line per suite.
set -u
# `web` leads explicitly: it is the BASE journey (`test:e2e`, no suffix), so it cannot be derived
# from the `test:e2e:*` names and would silently drop out of a derived list — which is the failure
# ADR-0096 fixed one file over and this line exists to stop repeating.
DERIVED="$(node -e '
  const pkg = require("./apps/web/package.json");
  const names = Object.keys(pkg.scripts)
    .map((s) => /^test:e2e:(.+)$/.exec(s))
    .filter(Boolean)
    .map((m) => m[1])
    .sort();
  process.stdout.write(names.join(" "));
')"
SUITES="${*:-web $DERIVED}"
for s in $SUITES; do
  # Fresh servers per suite: the flags bake at webServer start, so reusing one is how a suite
  # silently runs against another's configuration.
  for pid in $(ps aux | grep -E "vite/bin/vite.js|apps/api/dist/main" | grep -v grep | awk '{print $2}'); do kill "$pid" 2>/dev/null; done
  sleep 2
  echo "=== $s ==="
  # **`web` is passed BARE, and this is the second half of the line 45 comment.** That comment adds
  # the base journey to the list explicitly and says so at length — and this loop then prefixed
  # `web:` unconditionally, so it went to `e2e-local.sh` as `web:web`, resolved to a
  # `test:e2e:web` script that does not exist, and exited 1. The base journey has therefore never
  # once been run by this sweep: verbatim the failure the comment above claims to prevent, in the
  # same file, ten lines down. Found 2026-09-01 by the first sweep to read its own output.
  if [ "$s" = "web" ]; then target="web"; else target="web:$s"; fi
  timeout 900 scripts/e2e-local.sh "$target" > "/tmp/sweep-$s.log" 2>&1
  echo "$s EXIT=$?"
done
echo "SWEEP-DONE"
