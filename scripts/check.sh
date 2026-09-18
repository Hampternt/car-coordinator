#!/usr/bin/env bash
# The fast ITEM gate for car-coordinator — run after every item, before
# its commit.
#
# The workflow gates in two tiers (~/.claude/CLAUDE.md §Quality gates):
#   item gate — this script: static syntax over the shipped JS. Instant.
#   pack gate — `npm test` (scripts/smoke.mjs, Playwright): drives the real
#               app in a browser. Run before a pack's review and
#               walkthrough; nothing merges without it.
#
# This app is plain HTML/CSS/JS with no build step, so nothing type-checks
# it and nothing catches a syntax error until the page is opened and the
# script silently fails to parse. `node --check` is the cheapest thing
# that does, and it is the only compile-time safety this stack has.
#
# Two things this can NOT vouch for:
#   * logic — the day plan, clash detection, share encode/decode and
#     storage are all runtime behaviour. Touched those? Run `npm test`.
#   * the Tauri shell — src-tauri/ is Rust and is not checked here; it
#     changes rarely. Touched it? Also run:
#       cargo check --manifest-path src-tauri/Cargo.toml
#
# Exit 0 = every shipped script parses. On failure every file is still
# checked, so one run shows every problem.

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

if ! command -v node >/dev/null 2>&1; then
  printf 'CHECK FAILED: node is not on PATH\n'
  exit 1
fi

bad=0

printf '=== node --check (shipped app)\n'
for f in docs/*.js; do
  [[ -e "$f" ]] || continue
  if node --check "$f" 2>&1; then
    printf 'ok   %s\n' "$f"
  else
    printf 'FAIL %s\n' "$f"
    bad=1
  fi
done

printf '\n=== node --check (build and test scripts)\n'
for f in scripts/*.mjs; do
  [[ -e "$f" ]] || continue
  if node --check "$f" 2>&1; then
    printf 'ok   %s\n' "$f"
  else
    printf 'FAIL %s\n' "$f"
    bad=1
  fi
done

printf '\n'
if (( bad == 0 )); then
  printf 'CHECK OK — every shipped script parses. (Logic touched? Run npm test.)\n'
  exit 0
fi

printf 'CHECK FAILED: one or more scripts do not parse.\n'
exit 1
