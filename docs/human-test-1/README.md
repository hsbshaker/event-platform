# Human design-quality test #1 (calibration)

**Protocol:** `proof-b/human-test-form.md` (frozen Phase B methodology). Five reviewers, two
blinded grayscale sheets, forty screens each (20 model-authored, 20 hand-authored library),
same session, both widths. **Bar:** median reviewer rates ≥ 70% of model screens 4 or 5; model
screens form their own groups; no model group larger than 3. **This run is calibration**
against the hand-authored library (`docs/CHANGELOG-v6.md`, open condition 2); it informs the
production prompt/model choice. The launch gate is human test #2 on the frozen production
stack (Phase 10).

**Blinding:** the sheets are `sheets/human-test-1280-gray-unlabeled.png` and
`sheets/human-test-390-gray-unlabeled.png`, taken verbatim from the frozen proof branch
`proof/phase-b` (`b74ccab`). Reviewers must never see `proof-b/human-test-key.txt` or
`proof-b/human-test-items.json`; the review page does not reference either.

## How to run it

1. Open `docs/human-test-1/review.html` in a browser (double-click the file, or serve the
   folder). It shows the desktop sheet, then the phone sheet, then the two questions.
2. Send **only** `review.html` and the `sheets/` folder to each of five reviewers (zip those
   two, or host them anywhere static). Do not send this README, `responses/` or anything from
   `proof-b/`: reviewers must not be told how the sheet is composed. Each reviewer works alone,
   without seeing others' answers.
3. Each reviewer clicks **Download my results (JSON)** (or **Copy**) and sends you the file.
   Save the files as `docs/human-test-1/responses/<name>.json`.
4. Score:

   ```bash
   node scripts/human-test/score.mjs docs/human-test-1/responses/*.json
   ```

   This merges the responses into `docs/human-test-1/results.json` and runs the frozen
   scorer `proof-b/score-human.js` against the key; the output is written to
   `docs/human-test-1/score.json` (`summary.pass`, per-reviewer rates, grouping stats).
5. Return `score.json`. Record the outcome in `docs/development-plan.md` (Phase 0 row) and
   the calibration notes in `docs/CHANGELOG-v6.md`; do not change the ≥ 70% bar.

Note for scoring: `proof-b/human-test-form.md` states three pass clauses; the frozen
`score-human.js` enforces the median ≥ 70% rate and the ≤ 3 model-group size, and reports
mixed groups without applying them. The wrapper applies the third clause too (per reviewer, at
least one group made only of model screens; median over reviewers) and records the combined
result as `verdict.pass`, with the scorer's own value kept as `verdict.scorerPass`. The scorer
itself is not modified. The wrapper refuses any reviewer count other than five.

Status: **prepared, not run** until reviewer files exist in `responses/`.
