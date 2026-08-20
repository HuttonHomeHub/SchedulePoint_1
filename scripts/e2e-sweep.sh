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
# **Not a per-change step.** Thirty-four suites is about forty minutes. It belongs to a change that
# replaces a screen every journey signs in through, or moves a control every journey clicks.
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
SUITES="${*:-web staff edit toolbar toolbar-fit workspace-chrome authoring authoring-flow programme notes undo loe multi-select copy-paste resource-view interchange share library calendar-shifts sub-day assignment-lag float-paths search-nav designed-ui designed-chrome gantt activity-editor wbs recently-deleted audit account account-verify public overview gantt-editing}"
for s in $SUITES; do
  # Fresh servers per suite: the flags bake at webServer start, so reusing one is how a suite
  # silently runs against another's configuration.
  for pid in $(ps aux | grep -E "vite/bin/vite.js|apps/api/dist/main" | grep -v grep | awk '{print $2}'); do kill "$pid" 2>/dev/null; done
  sleep 2
  echo "=== $s ==="
  timeout 900 scripts/e2e-local.sh "web:$s" > "/tmp/sweep-$s.log" 2>&1
  echo "$s EXIT=$?"
done
echo "SWEEP-DONE"
