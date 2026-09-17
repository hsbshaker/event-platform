#!/usr/bin/env bash
# The ONLY sanctioned way for the T21 author to run tests.
#
# WHY THIS EXISTS
# `src/lib/ai/evals/design-intent.test.ts` reads and hashes
# `docs/model-evals/design-intent-validation.json` — the corpus invalidated at T19B, which the
# T21 author must never read. T19B added that test deliberately, to prove the file is preserved
# byte for byte. Running the full unit suite therefore breaches the zero-read condition, and
# that is how the first T21 candidate was contaminated.
#
# TWO MEASURED FACTS THIS SCRIPT ENCODES
#  1. `vitest --exclude "**/design-intent.test.ts"` does NOT drop it: the run still reported
#     87 files, the same as the full suite. Do not trust that flag.
#  2. `git ls-files -- 'tests/unit/**/*.test.ts'` silently misses the nine files that sit
#     directly in tests/unit/ (git pathspec, not vitest's glob) — including model-contract.test.ts,
#     which T21 needs. A subset that quietly omits tests is its own hazard.
#
# So the list is the EXACT set vitest's `unit` project globs, minus the one forbidden file,
# enumerated from the git index and passed as explicit inputs — excluded before any content
# reader starts, never filtered afterwards.
set -euo pipefail
FORBIDDEN="src/lib/ai/evals/design-intent.test.ts"
# `git ls-files` (run from the repository root) alone lists the INDEX, so a NEW untracked test file is invisible to it and
# silently never runs — which is exactly what happened on the first clean pass: four new test
# files were excluded from the aggregate and the floor below could not notice, because the
# tracked baseline alone clears it. `--cached --others --exclude-standard` is index + untracked,
# honouring .gitignore, which is the working tree vitest would actually glob.
mapfile -t FILES < <(git ls-files --cached --others --exclude-standard \
  | grep -E '^(src/.*|tests/unit/.*)\.test\.ts$' | sort -u | grep -vxF "$FORBIDDEN")
for f in "${FILES[@]}"; do
  [[ "$f" == "$FORBIDDEN" ]] && { echo "REFUSING: forbidden test present in input list"; exit 2; }
done
if [[ ${#FILES[@]} -lt 80 ]]; then
  echo "REFUSING: only ${#FILES[@]} test files found; expected 86+. The enumeration is wrong," >&2
  echo "and a silently reduced suite hides failures. Fix the list, do not lower this floor." >&2
  exit 2
fi
echo "running ${#FILES[@]} test files; ${FORBIDDEN} excluded at input"
exec npx vitest run --project unit "${FILES[@]}" "$@"
