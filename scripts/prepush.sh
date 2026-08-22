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
run() {
  local label="$1"; shift
  if "$@" >/tmp/prepush-last.log 2>&1; then
    printf '  \033[32mok\033[0m    %s\n' "$label"
  else
    printf '  \033[31mFAIL\033[0m  %s\n' "$label"
    tail -12 /tmp/prepush-last.log | sed 's/^/        /'
    failed+=("$label")
  fi
}

echo "Pre-push gate (docs/TESTING.md) — $(pwd)"
if [ "$CHECKS_ONLY" -eq 0 ]; then
  run "lint" pnpm lint
  run "typecheck" pnpm typecheck
  run "test" pnpm test
fi
for gate in counts doc-links playbook build-contract claims nginx flags adr-coverage \
            surface-contract frontend-only; do
  run "check:$gate" pnpm "check:$gate"
done

echo
if [ ${#failed[@]} -eq 0 ]; then
  echo "All green."
  exit 0
fi
printf 'FAILED: %s\n' "${failed[*]}"
exit 1
