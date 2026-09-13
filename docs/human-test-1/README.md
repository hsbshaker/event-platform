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
`proof-b/human-test-items.json`; the review page does not reference either. The survey is now
hosted, so this is enforced mechanically as well: `scripts/human-test/publish-review.mjs`
publishes an allowlist of exactly three files and
`tests/unit/human-test-blinding.test.ts` fails if anything reachable at the public URL names the
key, the item manifest, a classification, a threshold or a score.

## How to run it

The survey is an online page. Reviewers open one link, answer, and tap **Submit feedback**;
nothing is downloaded, emailed or pasted.

1. Send five reviewers the deployment's `/human-test-1` link. That is all they need — no
   account, no sign-in, no instructions beyond what the page says. Each reviewer works alone,
   without seeing others' answers. Do not send this README, `responses/` or anything from
   `proof-b/`: reviewers must not be told how the sheet is composed, and nothing at the public
   URL tells them.
2. Each response is stored in `human_test_1_responses`. On load the page asks the server for an
   opaque reviewer capability — invisible to the reviewer, no account, no sign-in — and the row a
   submission writes is named by that capability, not by anything the browser chose. Submission is
   therefore idempotent per session: a double tap or a retry does not create a second reviewer, a
   reviewer who reloads and corrects an answer replaces their own row, and nobody can address
   somebody else's. The capability expires, but renewing it keeps the same row, so a reviewer who
   comes back the next day to fix a rating still corrects their own response rather than adding
   another. Two rows for one name mean two separate sessions, and `score-stored.mjs`
   refuses to choose between them for you.
3. Check what has arrived, then score:

   ```bash
   node scripts/human-test/score-stored.mjs            # list stored responses
   node scripts/human-test/score-stored.mjs --write    # save the five and score them
   ```

   `--write` writes the five payloads to `docs/human-test-1/responses/*.json` in the same shape
   the page has always produced, then runs `scripts/human-test/score.mjs` unchanged. That merges
   them into `docs/human-test-1/results.json` and runs the frozen scorer `proof-b/score-human.js`
   against the key; the output is written to `docs/human-test-1/score.json` (`summary.pass`,
   per-reviewer rates, grouping stats). It refuses any reviewer count other than five; pass
   `--id <id>` five times to choose explicitly.
4. Return `score.json`. Record the outcome in `docs/development-plan.md` (Phase 0 row) and
   the calibration notes in `docs/CHANGELOG-v6.md`; do not change the ≥ 70% bar.

`docs/human-test-1/review.html` remains the source of truth for the questionnaire;
`public/human-test-1/` is a verbatim published copy and is regenerated with
`node scripts/human-test/publish-review.mjs`. Editing one without the other fails CI.
Reviewers who cannot submit can still use **Having trouble submitting?** on the page, which
produces exactly the same response — save the file as
`docs/human-test-1/responses/<name>.json` and score with `scripts/human-test/score.mjs`
directly.

**Verifying the deployed flow.** Set `HUMAN_TEST_1_TEST_SECRET` in the deployment and send the
`x-human-test-mode` header with a submission; it is stored in `human_test_1_test_responses`, a
separate table `score-stored.mjs` never reads. Nothing a public client can put in a request body
selects that table, so a synthetic submission cannot reach the real five.

The header is a claim that must be *authorized*, and it fails closed: if the secret is unset,
malformed, or does not match, the request is refused and written nowhere. It is never quietly
downgraded to a real review — which is the failure that would put an operator's verification
answers among the five reviewers. Obtain a capability first (`POST /api/human-test-1/session`,
same-origin) and send it as `capability` in the submission body.

If the very first submission returns 500 while everything else looks healthy, PostgREST is
serving a schema cache that predates the tables. The migration now issues
`notify pgrst, 'reload schema'` itself; if you apply the SQL some other way, run that notify.

Two requests are worth making, both against the synthetic table:

1. one complete submission — expect `{ ok: true, submissionId }` and one row;
2. the same `submissionKey` again with one rating changed — expect the same `submissionId`, still
   one row, the new rating, and the original `id` and `created_at`.

The second is the one that matters. It is the only place the whole correction path runs against a
real PostgREST: `src/lib/human-test/store.test.ts` pins the request the client builds and
`tests/db/human-test-1.test.ts` proves what Postgres does with it, but nothing in the repository
joins the two.

Note for scoring: `proof-b/human-test-form.md` states three pass clauses; the frozen
`score-human.js` enforces the median ≥ 70% rate and the ≤ 3 model-group size, and reports
mixed groups without applying them. The wrapper applies the third clause too (per reviewer, at
least one group made only of model screens; median over reviewers) and records the combined
result as `verdict.pass`, with the scorer's own value kept as `verdict.scorerPass`. The scorer
itself is not modified. The wrapper refuses any reviewer count other than five.

Status: **prepared, not run** until five reviewers have submitted at `/human-test-1`.
