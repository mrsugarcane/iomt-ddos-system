#!/bin/sh
# Runs each *.test.js file in its own Node process.
#
# Why not `node --test tests/`? Running multiple test files in a single
# `node --test` invocation was observed to hang indefinitely on this Node
# version when one of the files uses the experimental node:sqlite module —
# each file passes instantly on its own, but combining files deadlocks.
# Isolating each file into its own process sidesteps the issue entirely and
# is arguably better practice anyway (no shared module-level state leaking
# between test files, e.g. the rate limiter's in-memory window map).

set -e
cd "$(dirname "$0")"

FAILED=0
for f in tests/*.test.js; do
  echo "── running $f ──"
  if ! node --test "$f"; then
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "One or more test files failed."
  exit 1
fi
echo "All test files passed."
