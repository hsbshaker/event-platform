Reviewer JSON files go here, one per reviewer.

`node scripts/human-test/score-stored.mjs --write` writes them from the responses reviewers
submitted at `/human-test-1`, then scores them. A reviewer who had to use the page's
"Having trouble submitting?" fallback sends a file instead; save it here under the same
naming and score with `scripts/human-test/score.mjs` directly. Either way the file contents
are the same shape.
