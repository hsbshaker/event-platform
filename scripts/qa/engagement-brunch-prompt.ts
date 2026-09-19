/**
 * The frozen Phase-4 QA deployment prompt.
 *
 * Committed on its own, before the smoke that submits it, so git history is the evidence it was
 * not adjusted after anyone saw an output. A prompt edited in the same commit as a result is a
 * prompt nobody can prove was frozen.
 *
 * It is deliberately **not** the Mediterranean shower from the 4G evidence, and not drawn from any
 * eval set: this run exists to prove the *deployed runtime*, and reusing a prompt the pipeline has
 * already answered would confuse a runtime result with a recall result.
 *
 * What it asks of the system, none of it hinted to any stage: a named aesthetic register to
 * translate rather than copy; a palette in the host's own words; three explicit exclusions that
 * must survive verbatim to every downstream call; and facts that are present (spring, ~45 people,
 * a garden venue, brunch) sitting beside facts that are absent (date, time, address, names), which
 * `spec.md §7.5` forbids inventing and `§7.10` forbids blocking on.
 */
export const ENGAGEMENT_BRUNCH_PROMPT =
  "Planning a spring engagement brunch for about 45 people at a garden venue. We want it " +
  "romantic and fresh with soft florals, citrus, warm cream, sage and a little terracotta. " +
  "Elegant but relaxed — not rustic farmhouse, not overly formal, and definitely not generic " +
  "wedding-template vibes.";
