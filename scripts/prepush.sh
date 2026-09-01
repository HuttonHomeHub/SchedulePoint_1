#!/usr/bin/env bash
#
# The pre-push gate, as ONE command with ONE exit status.
#
# `docs/TESTING.md` documents ten steps in a table and that is where they lived: correct,
# complete, and hand-assembled at the call site every time. Three times in one session that
# assembly is what failed, never the gates themselves —
#
#   1. `pnpm check:counts | tail -2 && git commit` — a pipeline exits with its LAST stage's
#      status, so `tail` succeeded, the chain continued, and a failing gate printed its refusal
#      into the log while the push went ahead.
#   2. `for g in …; done; echo "fail=$fail" && git commit` — `echo` succeeded, so `&&` continued
#      past a real failure.
#   3. The same loop run from `apps/web`, where these scripts do not exist: ten identical
#      "command not found" failures, indistinguishable in the output from ten real ones.
#
# None of those is a gate being wrong. They are a correct gate whose result nobody read, which is
# ADR-0058's rule about replacing vigilance with a check applied to the checking itself. So the
# assembly becomes a script: it fixes its own working directory, runs every step, and exits
# non-zero if ANY step failed — never on the first, so one run reports everything rather than
# hiding nine failures behind the first.
#
# Usage:
#   scripts/prepush.sh            # lint, typecheck, unit tests, and all ten check:* gates
#   scripts/prepush.sh --checks   # the check:* gates only (fast; skips lint/typecheck/test)
#
# It deliberately does NOT run the e2e half. That needs a database and a browser, takes tens of
# minutes, and `scripts/e2e-local.sh` already owns it — see docs/TESTING.md "Before you push" for
# when it is required.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CHECKS_ONLY=0
[ "${1:-}" = "--checks" ] && CHECKS_ONLY=1

failed=()
warned=()
# **Three result states, not two** (`docs/specs/drift-gates/`, product-owner decision 2026-08-30).
#
#   0  ok    — clean.
#   2  WARN  — advisory. Printed loudly, does NOT fail the push.
#   *  FAIL  — blocking.
#
# The discriminator is written down because the tempting one ("how important is it?") has no stable
# answer: **exit 1 is for an obligation whose remedy is an edit to the file that failed; exit 2 is
# for one whose remedy is somebody's judgement.** A missed reconciliation pass is the second kind —
# blocking a release on a documentation chore is how a gate gets bypassed with `--no-verify`, and
# once bypassed it is bypassed always.
#
# **The honest weakness, recorded rather than designed away: a warning is ignorable, and that is
# exactly how `docs/TECH_DEBT.md` #220 happened.** Escalating to a failure after N ignored warnings
# was considered and refused — that is a blocking gate with extra steps, and it would arrive at the
# same bypass by a longer route.
#
# Note that a passing gate's output goes to a log and is never printed, so before this a warn-only
# `check:*` script was COMPLETELY SILENT. There is no design in which an advisory gate is visible
# without this branch.
#
# **`run_strict` exists because `tsc` uses exit 2 for type errors, and that collided with the
# advisory convention above — silently.** Measured 2026-09-01: `tsc --noEmit` exits **2** when it
# reports errors, turbo propagates it, and `pnpm typecheck` therefore fails a real type error with
# the exit code this script reads as "advisory, does not block". So from the day the three states
# landed until that measurement, **a failing typecheck printed a yellow WARN and let the push
# through**. `pnpm lint` and `pnpm test` were checked in the same pass and exit 1 correctly, so the
# hole was typecheck alone.
#
# The lesson is not "typecheck is important" — it is that a convention numbered 0/2/other collides
# with any tool that already uses those numbers for its own meanings, and the collision is invisible
# because the gate still prints something. So the three core gates declare that they are NEVER
# advisory rather than relying on the tools underneath them to avoid a number.
run_strict() {
  local label="$1"; shift
  "$@" >/tmp/prepush-last.log 2>&1
  local code=$?
  if [ $code -eq 0 ]; then
    printf '  \033[32mok\033[0m    %s\n' "$label"
  else
    printf '  \033[31mFAIL\033[0m  %s\n' "$label"
    tail -12 /tmp/prepush-last.log | sed 's/^/        /'
    failed+=("$label")
  fi
}

run() {
  local label="$1"; shift
  "$@" >/tmp/prepush-last.log 2>&1
  local code=$?
  if [ $code -eq 0 ]; then
    printf '  \033[32mok\033[0m    %s\n' "$label"
  elif [ $code -eq 2 ]; then
    printf '  \033[33mWARN\033[0m  %s\n' "$label"
    tail -12 /tmp/prepush-last.log | sed 's/^/        /'
    warned+=("$label")
  else
    printf '  \033[31mFAIL\033[0m  %s\n' "$label"
    tail -12 /tmp/prepush-last.log | sed 's/^/        /'
    failed+=("$label")
  fi
}

echo "Pre-push gate (docs/TESTING.md) — $(pwd)"
if [ "$CHECKS_ONLY" -eq 0 ]; then
  # Never advisory: each of these fails because of an edit to a file, which is exit 1's category —
  # and `typecheck` in particular reaches this line with tsc's exit 2. See `run_strict`.
  run_strict "lint" pnpm lint
  run_strict "typecheck" pnpm typecheck
  run_strict "test" pnpm test
fi
# **Derived from package.json, never listed here.** A hard-coded roster beside a set that grows is
# the ADR-0073 C4 defect: an eleventh `check:*` script lands and this gate silently stops covering
# the estate, with nothing failing. That is the same shape the scene-parity gate was rebuilt to
# avoid two commits earlier, so writing it into the tool that checks everything else would have
# been careless. Caught by review before it could bite.
mapfile -t gates < <(node -e '
  const s = require("./package.json").scripts ?? {};
  for (const k of Object.keys(s)) if (k.startsWith("check:")) console.log(k);
')
if [ ${#gates[@]} -eq 0 ]; then
  echo "No check:* scripts found in package.json — refusing to report success on nothing." >&2
  exit 1
fi
for gate in "${gates[@]}"; do
  run "$gate" pnpm "$gate"
done

echo
if [ ${#failed[@]} -eq 0 ]; then
  if [ ${#warned[@]} -eq 0 ]; then
    echo "All green."
  else
    # Named, not counted — "1 warning" is a number somebody scrolls past.
    printf '\033[33mAll green, with advisory findings: %s\033[0m\n' "${warned[*]}"
    echo "These do not block the push. They are obligations whose remedy is a judgement, not an edit."
  fi
  exit 0
fi
printf 'FAILED: %s\n' "${failed[*]}"
[ ${#warned[@]} -gt 0 ] && printf 'WARNED: %s\n' "${warned[*]}"
exit 1
