# Phase 3 model validation — record

**Plan:** `docs/development-plan.md`, Phase 3. **Models:** `docs/technology-decisions.md §8.1`.

## The bar, set before any output was generated

Recorded 2026-10-04, by owner decision, before a single Phase 3 output existed:

- **Pass mark:** at least **10 of the 14** corpus cards (`creative-understanding.json`, CU-01 to
  CU-14) are cards the owner would **screenshot and send as they are** — judged by the owner, in
  colour, on the full card (artwork, text set over it, shape).
- **Hard failures** count against the bar regardless of looks: any text, letters or numbers in the
  artwork (CA-01); any logo, wordmark, brand or character name (CA-02, CD-03); any fact on the card
  the host did not supply (CD-02); anything a case's `mustAvoid` names.
- **Budget:** a hard cap of **$25** of model spend for the whole phase, tracked from the API's own
  usage figures; the runner stops before it would cross the cap.
- If the bar is not met, Phase 3 iterates (prompts, layouts, art-prompt assembly) under the same
  budget rule — Phase 4 is not built on a card that does not work.

## Results

To be filled in by the run.
