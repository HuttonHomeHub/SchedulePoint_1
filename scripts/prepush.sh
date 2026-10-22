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
#   scripts/prepush.sh            # lint, typecheck, unit tests, and every root check:* gate
#   scripts/prepush.sh --checks   # the check:* gates only (skips lint/typecheck/test). One gate,
#                                 # check:web-bundle, builds the web app: ~17 s cold, ~1.5 s on a
#                                 # turbo cache hit (ADR-0160).
#   scripts/prepush.sh --push [git-push-args...]
#                                 # the full gate, then `git push <args>` ONLY if no gate FAILed
#                                 # (`pnpm prepush:push`). Refuses, before running anything, a dirty
#                                 # tree or a push `git push --dry-run` rejects; refuses after the
#                                 # run if HEAD moved or the tree went dirty; and refuses `--checks`.
#
# **Why the push lives in here** (`docs/TECH_DEBT.md` #280, closed). This script has always exited
# 0/1 correctly; what failed was the call site: `pnpm prepush 2>&1 | tail -5 && git push` pushed on
# a red gate, because a pipeline's status is its LAST stage's and `tail` succeeded. With the push
# inside the script and after the check, no pipe at the call site can carry a push past a failure.
# Advisory WARN still pushes, exactly as it passes today. A husky pre-push hook was refused: it
# would cost every push the full run and `--no-verify` bypasses it.
#
# It deliberately does NOT run the e2e half. That needs a database and a browser, takes tens of
# minutes, and `scripts/e2e-local.sh` already owns it — see docs/TESTING.md "Before you push" for
# when it is required.
#
# **A gate's finding either blocks (FAIL) or is declared advisory (WARN, and only for a name in
# ADVISORY_GATES below). There is no third, print-but-pass state** (ADR-0164). `run()` below sends a
# PASSING gate's output to a log and prints only `ok`, so a gate that exits 0 while printing a
# finding is invisible here by construction — which is exactly what `pnpm lint` did before
# ADR-0164 armed `--max-warnings=0` on every workspace: a warning passed silently, and four real
# staleness defects shipped under it before anyone read one. `check:claims`' `note: … registered
# but no longer cited` line was the same defect outside lint; it is a failing finding now (#410).
#
# **A non-passing gate shows its finding, not its last 12 lines** (`docs/TECH_DEBT.md` #276): a
# finding early in a long log, or a `✗ <case>` more than eleven cases from a chained suite's end,
# used to scroll off and force a re-run of the gate alone. `show_log` prints a short log whole and a
# long one as its marker lines plus its tail, capped so a failing `pnpm test` cannot flood the screen.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CHECKS_ONLY=0
PUSH=0
PUSH_ARGS=()
if [ "${1:-}" = "--checks" ]; then
  CHECKS_ONLY=1
  shift
fi
if [ "${1:-}" = "--push" ]; then
  if [ "$CHECKS_ONLY" -eq 1 ]; then
    echo "Refusing: --checks with --push would push on the check:* gates alone, skipping lint, typecheck and test." >&2
    exit 1
  fi
  PUSH=1
  shift
  PUSH_ARGS=("$@")
fi

if [ "$PUSH" -eq 1 ]; then
  # Before the six-minute run, not after it: a dirty tree means the gates would validate content the
  # push does not carry, and a push `--dry-run` rejects (no upstream, bad ref) would end the run in
  # an error the first second could have reported.
  if [ -n "$(git status --porcelain)" ]; then
    echo "Refusing to run prepush:push: the working tree is dirty, so the gates would validate content the push does not carry. Commit or stash first." >&2
    exit 1
  fi
  # Needs a reachable remote (offline is a refusal) and may prompt for credentials once, up front.
  if ! dry_err="$(git push --dry-run ${PUSH_ARGS[@]+"${PUSH_ARGS[@]}"} 2>&1 >/dev/null)"; then
    echo "Refusing to run prepush:push: \`git push --dry-run ${PUSH_ARGS[*]:-}\` fails. Fix the push arguments or upstream first." >&2
    printf '%s\n' "$dry_err" | sed 's/^/  git: /' >&2
    exit 1
  fi
  start_head="$(git rev-parse HEAD)"
  start_ref="$(git symbolic-ref -q HEAD || echo detached)"
fi

failed=()
warned=()
# One log per RUN, not one fixed path: two prepush gates running at once (builders do) used to share
# `/tmp/prepush-last.log`, so a FAIL could print the other run's last 12 lines (docs/TECH_DEBT.md
# #414). Removed on every exit; INT/TERM go through `exit` so the EXIT trap always runs.
log="$(mktemp "${TMPDIR:-/tmp}/prepush.XXXXXX")"
trap 'rm -f "$log"' EXIT
trap 'exit 130' INT TERM
# **Three result states, not two** (`docs/specs/drift-gates/`, product-owner decision 2026-08-30).
#
#   0  ok    — clean.
#   2  WARN  — advisory, and ONLY for a gate named in ADVISORY_GATES below. Printed loudly, does
#              NOT fail the push.
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
# **Exit 2 alone was never enough, because `tsc` uses it for type errors.** Measured 2026-09-01:
# `tsc --noEmit` exits **2** when it reports errors, turbo propagates it, and `pnpm typecheck`
# therefore failed a real type error with the exit code this script read as "advisory, does not
# block". So from the day the three states landed until that measurement, **a failing typecheck
# printed a yellow WARN and let the push through**. `pnpm lint` and `pnpm test` were checked in the
# same pass and exit 1 correctly, so the hole was typecheck alone — which is why nobody noticed. A
# gate that goes quiet is conspicuous; one that goes yellow looks like it is working.
#
# The lesson is not "typecheck is important" — it is that a convention numbered 0/2/other collides
# with any tool that already uses those numbers for its own meanings, and the collision is invisible
# because the gate still prints something. The first fix marked three gates "never advisory", which
# fixes the three somebody thought of; the list below inverts the default instead, so the next
# collision blocks rather than whispers.
#
# **ADVISORY_GATES — advisory is a DECLARATION, not a number any tool can reach** (#235).
#
# The 0/2/other convention above collided with `tsc`, which uses exit 2 for "I reported type
# errors", so a broken typecheck printed a yellow WARN and let the push through from the day the
# three states landed until 2026-09-01. That was patched by marking three gates "never advisory" —
# which fixes the three we thought of and leaves the default on the dangerous side for everything
# else. A future non-node gate can still pick 2 for its own reasons and be silently downgraded.
#
# So the default is inverted: **a non-zero exit blocks unless the gate is named here.** The residual
# risk does not disappear, it becomes harmless — an unanticipated exit 2 now blocks, which is the
# safe direction, and the only cost is a gate that has to be added to this list on the day it is
# genuinely made advisory.
#
# Measured 2026-09-02: all thirteen `check:*` scripts are `node scripts/*.mjs`, and `report()` in
# `scripts/lib/doc-register.mjs` is the ONLY producer of exit 2 — `check-reconcile-due.mjs` is its
# only caller. `scripts/check-advisory-agreement.mjs` asserts that both ways and reads this list from
# this file rather than restating it, so the two cannot drift.
ADVISORY_GATES=("check:reconcile-due")

is_advisory() {
  local needle="$1"
  for g in "${ADVISORY_GATES[@]}"; do [ "$g" = "$needle" ] && return 0; done
  return 1
}

# A log this short is printed whole: the chained suites (`check:doc-register` is ~110 lines) are
# where the reader most wants everything.
LOG_WHOLE_MAX=200
# Beyond that, at most this many marker lines (each with the line after it, where the suites and
# `tsc` put the reason), so a log made of findings still prints a bounded amount.
LOG_MATCH_MAX=40
# And always the end of the log, where a summary lives.
LOG_TAIL=30
# No printed line is wider than this: a minified bundle or a JSON blob in one line is not a finding.
LOG_LINE_MAX=300

# Indents, drops a trailing CR (CRLF output, progress redraws) and cuts a line at LOG_LINE_MAX.
clip_log() {
  awk -v max="$LOG_LINE_MAX" '{
    sub(/\r$/, "")
    if (length($0) > max) $0 = substr($0, 1, max) "…"
    print "        " $0
  }'
}

# Prints the log of a non-passing gate. The footer names `pnpm <label>` because every label is also
# the script that reproduces it, which is why no log path is printed: the log is per run, overwritten
# by the next gate and removed on exit, so a path would point at the wrong file or none.
show_log() {
  local label="$1" total matches shown
  total="$(awk 'END { print NR }' "$log")"
  if [ "$total" -le "$LOG_WHOLE_MAX" ]; then
    clip_log <"$log"
    return
  fi
  # Strong markers take the slots first; `error` fills what is left, because a passing test that
  # asserts on an Error would otherwise use all of them before the real finding. Printed in log order.
  matches="$(awk -v limit="$((total - LOG_TAIL))" -v max="$LOG_MATCH_MAX" '
    FNR == NR {
      if (NR > limit) next
      if ($0 ~ /✗|×|FAIL|ERR_/) { if (strong < max) { strong++; picked[NR] = 1 } }
      else if ($0 ~ /[Ee]rror/) { if (weak < max) { weak++; weakAt[weak] = NR } }
      next
    }
    FNR == 1 { for (i = 1; i <= weak && i <= max - strong; i++) picked[weakAt[i]] = 1 }
    FNR > limit { exit }
    picked[FNR] { printf "%d: %s\n", FNR, $0; pending = 1; next }
    pending { printf "%d: %s\n", FNR, $0; pending = 0 }
  ' "$log" "$log")"
  shown="$LOG_TAIL"
  if [ -n "$matches" ]; then
    shown=$((shown + $(printf '%s\n' "$matches" | awk 'END { print NR }')))
    printf '%s\n' "$matches" | clip_log
  fi
  printf '        …\n'
  tail -n "$LOG_TAIL" "$log" | clip_log
  printf '        showing %s of %s lines; run `pnpm %s` for all of it\n' "$shown" "$total" "$label"
}

run() {
  local label="$1"; shift
  "$@" >"$log" 2>&1
  local code=$?
  if [ $code -eq 0 ]; then
    printf '  \033[32mok\033[0m    %s\n' "$label"
  elif [ $code -eq 2 ] && is_advisory "$label"; then
    printf '  \033[33mWARN\033[0m  %s\n' "$label"
    show_log "$label"
    warned+=("$label")
  else
    printf '  \033[31mFAIL\033[0m  %s\n' "$label"
    show_log "$label"
    failed+=("$label")
  fi
}

echo "Pre-push gate (docs/TESTING.md) — $(pwd)"
if [ "$CHECKS_ONLY" -eq 0 ]; then
  # These are not in ADVISORY_GATES, so `run` blocks on any non-zero exit — including tsc's 2,
  # which is the collision that made `run_strict` necessary before the default was inverted.
  run "lint" pnpm lint
  run "typecheck" pnpm typecheck
  run "test" pnpm test
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
  if [ "$PUSH" -eq 1 ]; then
    if [ "$(git rev-parse HEAD)" != "$start_head" ] || [ "$(git symbolic-ref -q HEAD || echo detached)" != "$start_ref" ] || [ -n "$(git status --porcelain)" ]; then
      echo "NOT PUSHED: HEAD or the checked-out branch moved, or the working tree changed during the run, so the gates did not check what would be pushed." >&2
      exit 1
    fi
    echo "Pushing: git push ${PUSH_ARGS[*]:-}"
    # exec skips the EXIT trap, so the log is removed here.
    rm -f "$log"
    exec git push ${PUSH_ARGS[@]+"${PUSH_ARGS[@]}"}
  fi
  exit 0
fi
printf 'FAILED: %s\n' "${failed[*]}"
[ ${#warned[@]} -gt 0 ] && printf 'WARNED: %s\n' "${warned[*]}"
[ "$PUSH" -eq 1 ] && echo "NOT PUSHED: a gate failed."
exit 1
