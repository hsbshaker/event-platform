/**
 * The frozen Phase 4G QA prompt.
 *
 * Committed **before** the run, on its own, so that git history is the evidence that it was not
 * adjusted after anyone saw an output. That is the whole reason it is a module rather than a string
 * typed into the harness: a prompt edited in the same commit as a result is a prompt nobody can
 * prove was frozen.
 *
 * It is a real host's words, not an eval case. Phase 4G starts where a host starts — at the raw
 * request — rather than from the `EventIdentity` fixture the 4D and 4E smokes replayed. So this
 * exercises interpretation itself: the identity call, the clarification decision, and whatever the
 * real policy does with a prompt that is specific about taste and vague about logistics.
 *
 * Deliberately **not** the locally-grown baby shower, and deliberately not drawn from any spent
 * model-eval set. Reusing either would measure recall of something the pipeline has already been
 * tuned against.
 *
 * What it asks of the system, none of which is hinted to any stage:
 *
 * - a named aesthetic world to translate rather than copy (`spec.md §7.6` — old-world Mediterranean
 *   garden, not a reproduction of anyone's work);
 * - three explicit exclusions, which are host constraints and must survive to every downstream call
 *   verbatim (not nautical, not cartoonish, not overly formal);
 * - a palette the host names in their own words (warm ivory, faded blue) that the compiler must
 *   turn into semantic roles rather than use raw (`spec.md §32 #26`);
 * - facts that are present (November, afternoon, at home, ~60 people, a boy) beside facts that are
 *   absent (date, time, address, RSVP deadline, names), which `spec.md §7.5` forbids inventing and
 *   `§7.10` forbids blocking on.
 */
export const MEDITERRANEAN_SHOWER_PROMPT =
  "My sister is having a baby boy in November and we're doing an afternoon shower at home. " +
  "She loves old-world Mediterranean gardens — lemons, tiled courtyards, climbing greenery, " +
  "warm ivory and faded blue. I want it elegant and relaxed, not nautical, not cartoonish, " +
  "and not overly formal. Around 60 people.";
