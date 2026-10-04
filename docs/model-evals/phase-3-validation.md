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

## How it ran

Runner: `scripts/phase-3/` (outside the product; `run.mjs` stages, `compose.mjs` card mock,
`sheet.mjs` review page). Models through the OpenAI API: `gpt-6.1-sol` (Event Identity, Card
Design, artwork inspection), `gpt-6-luna` (fact extraction), `gpt-image-2.5-sunburst-2026-09-08`
(artwork, `high` quality), `omni-moderation-latest` (image safety). Sixteen cases: the fourteen
corpus cases plus the owner's two ChatGPT briefs (O-01 engagement brunch, O-02 bear baby shower),
which do not count toward the bar.

**Two rounds.** Round 1 ran the first prompts. Reading its cards showed four mechanical problems,
fixed before the owner saw anything (round 2 = the version judged):

| Round 1 problem | Fix (round 2) |
| --- | --- |
| Told the card would be trimmed to an oval, the image model painted the oval itself — a vignette with blank corners (CU-01, faintly O-02) | Art prompt: "the trimming is done later … paint the background into every corner; do not paint the outline, a vignette, a border line or blank corners" |
| Subjects drifted into the text area (O-02 feet, CU-10 ribbon) | Layout composition rules name what must not cross ("feet, paws, tails, ribbons, fabric, shadows") and widen the quiet region to 45% |
| Plain frames instead of artwork (CU-02 thin plaid band, CU-11 `minimal` double rule for an "equestrian" prompt) | Card Design prompt: `minimal` only when the identity asks for a bare card; a framed card's frame is the picture, built from the event's motifs |
| Stock headlines ("A Lovely Gathering" ×2, "A Warm Welcome" ×2) | Card Design prompt: titles drawn from the identity's world; named stock phrases forbidden |

Round 2 also exposed a bug in the mock's ink rule (below), fixed before publishing.

## Results

### Event Identity (`event_identity_v4`, GPT 6.1 Sol)

- **Valid:** 16 of 16; one (O-02) needed its one re-prompt.
- **Mechanical checks:** no brand or character name in any `visualMotifs`; no supplied fact
  repeated in an identity; CU-05 has no pink, blush or rose outside `avoidColors`; CU-03 infers no
  place.
- **Latency:** p50 10.9 s, p75 13.7 s at `medium` reasoning effort; 7–9 s at `low` (4 cases, all
  valid). The `spec.md §7.10` target of ≤ 5 s is not met at either effort.
- **Cost:** about $0.004 per call.

### Fact extraction (`fact_extraction_v1`, GPT 6 Luna)

- Every extracted value is verbatim from the prompt (16 of 16). No date invented from "June"
  (CU-12 carries it as a partial hint); "1pm" and "Saturday, December 19 2026" kept exactly (CU-11).
- Two corpus mismatches are the corpus's, not the model's: CU-11 and O-02 begin "Baby shower…",
  extracted verbatim with a capital B; the corpus expects lowercase. CU-14 files "beachy" as a
  partial location hint — wrong field for a vibe, though not a fact.
- About 3 s and $0.0001 per call.

### Card Design (`card_design_v1`, GPT 6.1 Sol)

- **Schema (CD-01):** round 1, 9 of 16 valid first time — every failure an `artBrief.subject` over
  300 characters, which strict structured output cannot enforce (`maxLength` is not supported);
  all 16 valid after one re-prompt. Round 2, with the limit stated in the prompt: 16 of 16 first
  time.
- **Fact discipline (CD-02):** 0 wording failures in either round.
- **Brand line (CD-03):** 0 brand or character names in any wording or brief.
- **Shapes chosen (round 2):** rectangle 9, rounded rectangle 3, arch 2, oval 1, square 1, circle 0.
  The circle was exercised only through the shape-switch test.
- **Latency:** p50 11.4 s at `medium`; 8–11 s at `low`. About $0.007 per call.

### Artwork (`card_art_v1`, GPT Image 2.5 Sunburst)

- **Raster:** 1440 × 2016 (5:7) and 1440 × 1440 (1:1), PNG, opaque full bleed. No transparent
  workflow is needed: the outline is a code mask and the art is painted to every edge.
- **No text (CA-01):** 0 artworks with text, letters or numbers in the 37 inspected (42 images generated, 2 refused).
- **Brand line (CA-02):** 0 logos or brand marks. The heritage-prep bear (CU-01, O-02) came through
  as intended: a teddy in a cable-knit sweater over an oxford collar, no marks.
- **Refusals:** CU-04 ("Winnie the Pooh but not corny") was refused by OpenAI's output moderation
  in both rounds, with two different briefs; both described a round honey-coloured bear in a red
  shirt with a honey pot. 1 of 16 cases, 2 of 2 attempts. An experiment (not counted) with the
  character's signature look removed — a plain storybook teddy and honey pot in an English wood —
  was not refused. See open decisions.
- **Mockups:** 1 artwork came back as a photo of a card on a surface (CU-10, round 1); the inspector
  caught it and the one regeneration fixed it.
- **Latency (CA-05):** p50 31 s, p75 33 s at `high`. Probe on two cases: Sunburst `medium` 17–19 s
  at $0.017 (≈500 output tokens), visually close to `high` at card size; Flare `high` 20–21 s at
  $0.062, and on O-02 it painted its own vignette again.
- **Cost:** about $0.06 per artwork at `high` (≈2,000 output tokens), plus $0.005 for the inspection.
- **Shape switch with a reference (CA-07):** 2 of 2 kept the same subject (O-02 rectangle → circle:
  the same bear, bow tie and sweater; CU-13 rectangle → circle: the same map and record).
- **Text and safety detection (chosen):** the provider's own output moderation, then
  `omni-moderation-latest` on the image, then a structured GPT 6.1 Sol inspection (text, logo or
  brand mark, mockup). About 4 s and $0.005 per artwork.

### Ink and legibility (card mock)

- Every rendered card's text clears 4.5:1 against the conservatively measured zone (minimum 5.29:1).
- A legibility panel was needed on 1 of 17 renders (O-02 switched to a circle, where the art-top
  text zone narrows into the bear's lap).
- **Bug found and fixed:** the first mock picked the dark or light tail of the zone's luminance by
  comparing the ink with the median, so a cream ink passed over a cream background. The rule that
  holds: an ink darker than the zone's dark tail is judged against that tail, one lighter than the
  light tail against that tail, and an ink inside the range fails. Phase 4's resolver needs a unit
  test for exactly this case.

### End-to-end latency and cost

- Sequential p50, prompt to card: identity 11 s → design 11 s → artwork 31 s → inspection 4 s ≈ **57 s**.
  With `low` text effort and Sunburst `medium`: ≈ 8 + 8 + 18 + 4 ≈ **38 s**. The `spec.md §7.10`
  working target of ≤ 30 s is not met by either; re-setting it is an owner decision.
- Cost per card ≈ **$0.08** (identity $0.004, facts $0.0001, design $0.007, artwork $0.06,
  inspection $0.005).
- Phase spend: **$3.61** of the $25 cap — both rounds, the shape switches, the latency probe, the
  homage experiment and the medium-quality comparison.

### Open decisions for the owner

1. **The bar** — the verdict below.
2. **Latency target** (`spec.md §7.10`): keep `high` quality at ≈ 57 s, or move to `low` text effort
   and Sunburst `medium` at ≈ 38 s; either way the ≤ 30 s working target is re-set from these
   measurements, deliberately.
3. **Famous characters** (`spec.md §7.6`): the provider refuses near-replicas of a protected
   character even when the brief names nothing. Keep the close-homage rule and accept refusals as
   visible failures, or steer briefs for famous characters toward the character's world rather
   than its signature design.

### The owner's verdict — the bar is met

Judged by the owner on 2026-10-04 on the review page, round 2: **11 of 14 would send** (bar: 10).

| Verdict | Cases | Owner's note |
| --- | --- | --- |
| Would send | CU-01, CU-03, CU-05, CU-06, CU-07, CU-08, CU-09, CU-10, CU-11, CU-12, CU-13 | — |
| Wouldn't send | CU-02 | "less white space surrounding text; or change whitespace to some sort of designed background; needs a graphic of multiple graphics" |
| Wouldn't send | CU-04 | Refused by the provider in both rounds. On the uncounted experiment: "not legible; … artwork takes up too much space of the card" |
| Wouldn't send | CU-14 | "too plain" |

The owner's own briefs, not counted: O-01 and O-02 would send.

**What the misses say.** Both judged misses are sparse cards — a frame around a large empty
centre (CU-02) and a quiet wash (CU-14). Presence is the next thing to improve, in the card-design
prompt and the framed and atmosphere layouts' presence rules, measured on this corpus in Phase 5.

### Owner decisions taken on the results

1. **Latency.** The wait is filled by the details form (`spec.md §7.10`), so the reveal target is
   re-set from the measurements rather than held at 30 s. Sunburst `medium` was to be adopted only
   with no loss of quality against `high`; after the full-corpus comparison below, the owner kept
   `high`.
2. **Famous characters.** Keep close homage on the first attempt. When the provider refuses it,
   the one regeneration re-prompts the design to evoke the character's world rather than its
   signature look, with a short, plain copyright note to the host (`spec.md §7.6`).

### High against medium, on the full corpus

The 15 round-2 designs that produced artwork were painted again at Sunburst `medium` and composed
the same way; each pair was compared as finished cards and as full-resolution crops of the most
detailed part of each artwork (published to the owner as "High vs Medium Artwork").

| | `high` | `medium` |
| --- | --- | --- |
| Artwork time, p50 | 31 s | 17 s |
| Cost per artwork | $0.06 | $0.017 |
| First attempts caught by the checks | 1 of 33 (a mockup) | 2 of 15 (a mockup; compass-rose lettering) |
| Detail and brushwork at full resolution | — | no loss found by inspection |
| Colour | brighter, more vibrant | flatter (owner's judgement) |

**Decision: stay at `high`** (owner, 2026-10-04): "high seems to have brighter and more vibrant
images". The detail comparison found nothing; the owner's eye found the difference in colour,
which matters more on a card. `high` keeps the lower check-failure rate too. Prompt to card is
about 57 s at p50, and the latency targets were re-set to identity ≤ 15 s and card ≤ 70 s at p75
(`spec.md §7.10`).
