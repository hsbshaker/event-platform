/**
 * The deterministic half of the creative-understanding rubric —
 * `docs/model-contracts.md §4.5`, corpus `docs/model-evals/creative-understanding.json`.
 *
 * §4.5 is explicit about how far this can go: "Four of the seven identity dimensions are
 * wholly or partly deterministic — fact discipline fully, and cliché avoidance,
 * clarification judgment and reference translation in their negative half, which is the
 * half that catches outright failures. ... A mechanical pass on 3–6 is necessary and never
 * sufficient."
 *
 * So this module decides one thing only: did the response commit an **outright failure**
 * that can be established without judgement. It does not score taste, and a clean run here
 * is not a Phase 4A pass — it is the precondition for a human being asked.
 *
 * Every check states its own verdict kind:
 *
 *   `pass` / `fail`   gating. The claim is established mechanically.
 *   `advisory`        real evidence, not decidable mechanically. Reported, never gating.
 *   `n/a`             the case does not exercise this check.
 *
 * Two checks are derived from the host's prompt rather than from the fixture
 * (`hostNegationRespected`, `factsGrounded`), so they would work on any prompt and are not
 * tuned to these fourteen.
 */
import type {
  ClarificationQuestion,
  EventIdentity,
  EventIdentityResult,
  SuppliedEventFacts,
} from "@/lib/ai/event-identity/contract";
import { CLARIFICATION_CEILING, SUPPLIED_FACT_FIELDS } from "@/lib/ai/event-identity/contract";

export type CheckStatus = "pass" | "fail" | "advisory" | "n/a";

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface CorpusCase {
  id: string;
  prompt: string;
  class: string[];
  facts: Record<string, string>;
  expectClarification: "no" | "likely" | "acceptable" | "expected";
  mustAvoid: string[];
  notes?: string;
}

export interface CaseEvaluation {
  caseId: string;
  checks: Check[];
  /** True when no gating check failed. Necessary, never sufficient (`§4.5`). */
  mechanicalPass: boolean;
}

/* ------------------------------------------------------------------ text utilities */

/**
 * Compare quotations the way a reader would, not the way a byte comparison would.
 *
 * Case is folded and internal whitespace collapsed, because "Baby shower" at the start of
 * a sentence and "baby shower" in the middle are the same quotation. Punctuation is *not*
 * folded: "Saturday, December 19 2026" and "Saturday, December 19, 2026" differ by a comma
 * the host did not write, and that difference is precisely what CU-11 exists to catch.
 */
function fold(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function quotesFrom(prompt: string, value: string): boolean {
  return fold(prompt).includes(fold(value));
}

/** Every string the identity exposes, for lexical scanning. */
function identityText(identity: EventIdentity): string {
  return JSON.stringify(identity);
}

function nonNullFacts(facts: SuppliedEventFacts): [string, string][] {
  return SUPPLIED_FACT_FIELDS.flatMap((field) => {
    const value = facts[field];
    return value === null ? [] : [[field, value] as [string, string]];
  });
}

/* ------------------------------------------------------------------ fact discipline */

/**
 * Rubric dimension 4, first half: supplied facts survive.
 *
 * Keyed by value rather than by field name. The corpus names facts as the case author saw
 * them (`location`, `venueHint`, `monthHint`) while the contract has a fixed field set, and
 * the requirement is that the host's words are *carried*, not that two vocabularies agree.
 * Which field received a value is reported separately as advisory.
 */
export function checkFactsPreserved(caseData: CorpusCase, facts: SuppliedEventFacts): Check {
  const supplied = Object.entries(caseData.facts);
  if (supplied.length === 0) {
    return { name: "factsPreserved", status: "n/a", detail: "the case supplies no facts" };
  }
  const carried = nonNullFacts(facts).map(([, value]) => fold(value));
  const missing = supplied.filter(([, value]) => !carried.includes(fold(value)));

  if (missing.length === 0) {
    return {
      name: "factsPreserved",
      status: "pass",
      detail: `all ${supplied.length} supplied fact(s) carried verbatim`,
    };
  }
  return {
    name: "factsPreserved",
    status: "fail",
    detail: missing
      .map(([key, value]) => `${key}="${value}" was not carried through verbatim`)
      .join("; "),
  };
}

/**
 * Rubric dimension 4, second half: nothing was invented.
 *
 * Derived from the prompt, not the fixture: every non-null fact must be quotable from the
 * host's own words. This is the check that catches both failure modes the doctrine names —
 * a fabricated venue, and a real value rewritten into a form the host never used.
 */
export function checkFactsGrounded(caseData: CorpusCase, facts: SuppliedEventFacts): Check {
  const present = nonNullFacts(facts);
  if (present.length === 0) {
    return {
      name: "factsGrounded",
      status: "pass",
      detail: "no facts claimed",
    };
  }
  const ungrounded = present.filter(([, value]) => !quotesFrom(caseData.prompt, value));
  if (ungrounded.length === 0) {
    return {
      name: "factsGrounded",
      status: "pass",
      detail: `all ${present.length} claimed fact(s) quotable from the prompt`,
    };
  }
  return {
    name: "factsGrounded",
    status: "fail",
    detail: ungrounded
      .map(([field, value]) => `${field}="${value}" does not appear in the host's words`)
      .join("; "),
  };
}

/** Which contract field received each supplied fact. Reported for the reviewer, never gating. */
export function reportFactFieldMapping(caseData: CorpusCase, facts: SuppliedEventFacts): Check {
  const supplied = Object.entries(caseData.facts);
  if (supplied.length === 0) {
    return { name: "factFieldMapping", status: "n/a", detail: "the case supplies no facts" };
  }
  const byValue = new Map(nonNullFacts(facts).map(([field, value]) => [fold(value), field]));
  const mapping = supplied.map(
    ([key, value]) => `${key} -> ${byValue.get(fold(value)) ?? "(not carried)"}`,
  );
  return { name: "factFieldMapping", status: "advisory", detail: mapping.join("; ") };
}

/**
 * A fact the corpus did not list, carried anyway.
 *
 * `checkFactsGrounded` asks only whether a value is quotable, and `checkFactsPreserved` walks
 * corpus to response — so a value the host never offered as a fact slips through both if it
 * happens to appear in their sentence. `honoreeName: "our son"` is quotable from CU-11 and is
 * exactly what the prompt forbids: "a relationship ('for our son') is not a name".
 *
 * Advisory rather than gating: the corpus lists the facts a case is *about*, not every fact a
 * correct extractor may legitimately find, so a surplus is evidence for the reviewer and not
 * proof of invention.
 */
export function reportSurplusFacts(caseData: CorpusCase, facts: SuppliedEventFacts): Check {
  const expected = new Set(Object.values(caseData.facts).map(fold));
  const surplus = nonNullFacts(facts).filter(([, value]) => !expected.has(fold(value)));
  if (surplus.length === 0) {
    return { name: "surplusFacts", status: "pass", detail: "no fact beyond those supplied" };
  }
  return {
    name: "surplusFacts",
    status: "advisory",
    detail: `carried but not listed by the case: ${surplus.map(([f, v]) => `${f}="${v}"`).join("; ")}`,
  };
}

/* ------------------------------------------------------------------ negative constraints */

const NEGATION_PATTERNS = [
  /\bno\s+([a-z][a-z-]{2,})\b/gi,
  /\bnot\s+([a-z][a-z-]{3,})\b/gi,
  /\bwithout\s+([a-z][a-z-]{2,})\b/gi,
  /\bavoid(?:ing)?\s+([a-z][a-z-]{2,})\b/gi,
];

/** Words that follow a negation without being the thing negated. */
const NEGATION_STOPWORDS = new Set([
  "the",
  "and",
  "but",
  "too",
  "very",
  "really",
  "quite",
  "sure",
  "one",
  "idea",
  "more",
  "less",
  "just",
  "only",
]);

export function negatedTerms(prompt: string): string[] {
  const found = new Set<string>();
  for (const pattern of NEGATION_PATTERNS) {
    for (const match of prompt.matchAll(pattern)) {
      const term = match[1].toLowerCase();
      if (!NEGATION_STOPWORDS.has(term)) found.add(term);
    }
  }
  return [...found];
}

/**
 * Rubric dimension 3's negative half, derived from the prompt rather than the corpus.
 *
 * When the host negates something ("no pink", "not corny", "without balloons"), the
 * negated term must not reappear as a positive part of the creative brief. It may appear
 * in `avoidColors` or `designConstraints` — that is the brief recording the constraint,
 * which is correct and expected — but anywhere else it is the identity proposing the thing
 * the host excluded.
 *
 * `spec.md §7.6b` and the prompt both state the rule this enforces: an exclusion is
 * absolute, and "no X" never means "less X".
 */
/** Negation cues that turn a mention into a restatement of the constraint, not a proposal. */
const NEGATION_CUE =
  /\b(no|not|never|without|avoid|avoiding|free of|nothing|rather than|instead of)\b[\s\w-]{0,24}$/;

/**
 * A term is only a violation when the brief *proposes* it.
 *
 * "never childish", "without tipping into cheesy" and "nothing pink-adjacent" are the brief
 * doing its job: carrying the host's exclusion in prose. Gating on a bare token match would
 * fail a good answer for honouring the constraint out loud, which is the opposite of what
 * this check is for.
 */
function proposesPositively(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const match of haystack.matchAll(new RegExp(`\\b${escaped}\\b`, "g"))) {
    const before = haystack.slice(Math.max(0, match.index - 40), match.index);
    if (!NEGATION_CUE.test(before)) return true;
  }
  return false;
}

export function checkHostNegationRespected(caseData: CorpusCase, identity: EventIdentity): Check {
  const terms = negatedTerms(caseData.prompt);
  if (terms.length === 0) {
    return { name: "hostNegationRespected", status: "n/a", detail: "no negation in the prompt" };
  }

  const positive = { ...identity, paletteIntent: { ...identity.paletteIntent } } as Partial<
    EventIdentity & { paletteIntent: Partial<EventIdentity["paletteIntent"]> }
  >;
  // Where a constraint is *supposed* to be recorded.
  delete (positive as { designConstraints?: unknown }).designConstraints;
  delete (positive.paletteIntent as { avoidColors?: unknown }).avoidColors;
  const haystack = fold(JSON.stringify(positive));

  const violations = terms.filter((term) => proposesPositively(haystack, term));

  if (violations.length === 0) {
    return {
      name: "hostNegationRespected",
      status: "pass",
      detail: `negated term(s) [${terms.join(", ")}] absent from the positive brief`,
    };
  }
  return {
    name: "hostNegationRespected",
    status: "fail",
    detail: `host negated [${violations.join(", ")}] but the positive brief still proposes it`,
  };
}

/** An exclusion the model itself recorded must not also appear as a wanted color. */
export function checkExclusionSelfConsistency(identity: EventIdentity): Check {
  const { avoidColors, requiredColors, preferredColors } = identity.paletteIntent;
  if (avoidColors.length === 0) {
    return { name: "exclusionSelfConsistency", status: "n/a", detail: "no colors excluded" };
  }
  const wanted = [...requiredColors, ...preferredColors].map(fold);
  const contradictions = avoidColors.filter((avoided) =>
    wanted.some((want) => want.includes(fold(avoided)) || fold(avoided).includes(want)),
  );
  if (contradictions.length === 0) {
    return {
      name: "exclusionSelfConsistency",
      status: "pass",
      detail: `${avoidColors.length} exclusion(s), none contradicted`,
    };
  }
  return {
    name: "exclusionSelfConsistency",
    status: "fail",
    detail: `excluded and also wanted: ${contradictions.join(", ")}`,
  };
}

/**
 * Proper nouns inside a `mustAvoid` entry: "Polo Bear", "Ralph Lauren", "Disney",
 * "Winnie-the-Pooh", "Positano", "Amalfi".
 *
 * Corpus entries are written as lowercase prose, so a capitalised token is a named thing
 * rather than a sentence start — which makes this extraction deterministic and safe to gate
 * on. An entry whose prohibition is a matter of taste ("cartoon or novelty treatments")
 * yields no probes and is reported as not mechanically checkable, which is the honest
 * answer rather than a guess.
 */
export interface Probes {
  /** Multi-word names. A match is a reproduction, and gates. */
  gating: string[];
  /** Single words. Reported, never gating — see below. */
  advisory: string[];
}

export function properNounProbes(mustAvoid: string): Probes {
  const gating = new Set<string>();
  const advisory = new Set<string>();

  for (const match of mustAvoid.matchAll(/\b([A-Z][\w'-]*(?:[- ][A-Z][\w'-]*)*)\b/g)) {
    const sequence = match[1].trim();
    if (sequence.length < 3) continue;
    // A multi-word name in the identity is the named thing itself.
    if (/[-\s]/.test(sequence)) gating.add(sequence);
    else advisory.add(sequence);
    // Each word on its own too, but only as advisory. "the Disney Winnie-the-Pooh character
    // design" names two things and reaching for either is the forbidden move — yet a lone
    // token cannot tell that move apart from the translation we asked for. "Polo Bear"
    // yields "polo", and "restrained polo-field linework" is exactly the original visual
    // language `spec.md §7.6` wants from a heritage-prep prompt. Gating on it would fail a
    // brief for succeeding.
    for (const part of sequence.split(" ")) {
      if (part.length >= 3 && !gating.has(part)) advisory.add(part);
    }
  }
  return { gating: [...gating], advisory: [...advisory] };
}

/**
 * Entries about *inferring a fact* are not identity-scan material.
 *
 * CU-03 forbids "inferring Positano ... as a fact". The real failure is a fabricated
 * `localityText`, which `checkFactsGrounded` already catches. Scanning `identity` for the
 * place name instead condemns "Amalfi-coast lemon groves" in `creativeDirection` — which
 * `spec.md §7.5` and `product-doctrine.md §5` explicitly license as aesthetic inference.
 */
function isFactProhibition(entry: string): boolean {
  return /\bas a fact\b|\binferring\b|\binfer\b/i.test(entry);
}

/**
 * The artifacts that make a named reference a reproduction rather than a reference.
 *
 * This is the character-versus-house distinction, and it decides whether naming the thing is
 * itself the offence. "Polo Bear" and "Winnie-the-Pooh" cannot be translated while named, so
 * the name gates. "Ralph Lauren" and "Disney" are pointers `spec.md §7.6` explicitly licenses
 * as shorthand — a `creativeDirection` reading "Ralph Lauren heritage prep, translated for a
 * nursery" is the most natural correct answer to a prompt that is literally "Ralph Lauren but
 * baby", and failing it would be failing a brief for succeeding.
 *
 * So when the corpus entry forbids an *artifact* of the house rather than the house, the bare
 * name is advisory, and gating needs the artifact word to appear in the identity too.
 */
const REPRODUCTION_ARTIFACT =
  /\b(logos?|wordmarks?|crests?|trademarks?|likenesse?s?|campaigns?|mascots?)\b/i;

/**
 * Word-boundary containment, so "Bear" does not match "bearing".
 *
 * Hyphens and spaces are normalized on both sides first: the corpus writes
 * "Winnie-the-Pooh" and an identity proposing the character writes "Winnie the Pooh", and a
 * probe that cannot span that difference is a probe that never fires on the one case it
 * exists for.
 */
function spaced(value: string): string {
  return fold(value).replace(/[-\s]+/g, " ");
}

function mentions(haystack: string, probe: string): boolean {
  const escaped = spaced(probe).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(spaced(haystack));
}

export function checkMustAvoid(caseData: CorpusCase, identity: EventIdentity): Check[] {
  if (caseData.mustAvoid.length === 0) {
    return [{ name: "mustAvoid", status: "n/a", detail: "the case forbids nothing explicitly" }];
  }
  const haystack = fold(identityText(identity));
  const hits: string[] = [];
  const echoes: string[] = [];
  const unprobeable: string[] = [];

  for (const entry of caseData.mustAvoid) {
    if (isFactProhibition(entry)) {
      unprobeable.push(`${entry} [fact discipline — see factsGrounded]`);
      continue;
    }
    const { gating, advisory } = properNounProbes(entry);
    if (gating.length === 0 && advisory.length === 0) {
      unprobeable.push(entry);
      continue;
    }
    // An entry that forbids the house's artwork rather than the house itself only gates when
    // the identity reaches for that artwork; naming the reference stays a licensed shorthand.
    const namesArtifact = REPRODUCTION_ARTIFACT.test(entry);
    const identityReachesForArtifact = REPRODUCTION_ARTIFACT.test(haystack);
    for (const probe of gating) {
      if (!mentions(haystack, probe)) continue;
      if (namesArtifact && !identityReachesForArtifact) {
        echoes.push(`"${probe}" named as a reference, no reproduction artifact (from: ${entry})`);
        continue;
      }
      hits.push(`"${probe}" (from: ${entry})`);
    }
    for (const probe of advisory) {
      if (mentions(haystack, probe)) echoes.push(`"${probe}" (from: ${entry})`);
    }
  }

  const checks: Check[] = [
    hits.length === 0
      ? {
          name: "mustAvoidNamedThings",
          status: "pass",
          detail: "no forbidden named thing appears in the identity",
        }
      : { name: "mustAvoidNamedThings", status: "fail", detail: hits.join("; ") },
  ];

  if (echoes.length > 0) {
    checks.push({
      name: "mustAvoidNameEchoes",
      status: "advisory",
      detail: `a word from a forbidden name appears; translation or reproduction is a judgement: ${echoes.join("; ")}`,
    });
  }
  if (unprobeable.length > 0) {
    checks.push({
      name: "mustAvoidTasteJudgements",
      status: "advisory",
      detail: `not mechanically checkable, for the qualitative reviewer: ${unprobeable.join("; ")}`,
    });
  }
  return checks;
}

/* ------------------------------------------------------------------ clarification */

/**
 * Logistics a clarification may never ask for (`spec.md §7.6b #6`).
 *
 * Phrases rather than bare words, so "where should the emphasis sit" is not mistaken for
 * "where is the event". A miss here is caught by the qualitative reviewer; a false positive
 * would wrongly condemn a good question, which is the worse error.
 */
const LOGISTICS_PATTERNS: [string, RegExp][] = [
  ["date", /\b(what|which|the)\s+(date|day|month)\b|\bwhen\s+(is|will|are|does|do)\b/i],
  // "what time of day should the palette evoke" is a question about light, not about the
  // schedule, and it is a natural creative question. The logistics reading is excluded by
  // lookahead rather than by adding "of day" as a category, because a false positive
  // wrongly condemns a good question and a miss is caught by the qualitative reviewer.
  ["time", /\b(what|which)\s+time\b(?!\s+of\s+day)|\bstart(ing)?\s+time\b/i],
  [
    "venue",
    /\b(what|which|the|a|any|your)\s+(venue|location)\b|\bwhere\s+(is|will|are|does|do)\b|\bvenue in mind\b/i,
  ],
  ["address", /\baddress\b/i],
  ["rsvp", /\brsvp\b|\bdeadline\b/i],
  [
    "guests",
    /\bhow (many|large|big)\b|\bguest (count|list)\b|\bhow many\s+(people|guests|are coming)\b/i,
  ],
  ["budget", /\bbudget\b/i],
  // Doctrine §5 classes a dress code as a fact about the event, not a taste question, and
  // indoors/outdoors and season are inferences CU-03 forbids being made at all.
  ["dressCode", /\bdress code\b|\bblack[- ]tie\b.*\?|\bhow formal (is|will)\b/i],
  ["setting", /\bindoors?\b|\boutdoors?\b/i],
  ["season", /\bwhat season\b|\bwhich season\b|\btime of year\b/i],
];

export function logisticsCategories(question: string): string[] {
  return LOGISTICS_PATTERNS.filter(([, pattern]) => pattern.test(question)).map(([name]) => name);
}

export function checkClarification(
  caseData: CorpusCase,
  questions: ClarificationQuestion[],
  needed: boolean,
): Check[] {
  const checks: Check[] = [];
  const count = questions.length;

  checks.push(
    count <= CLARIFICATION_CEILING
      ? { name: "clarificationCeiling", status: "pass", detail: `${count} question(s)` }
      : {
          name: "clarificationCeiling",
          status: "fail",
          detail: `${count} question(s) exceeds the ceiling of ${CLARIFICATION_CEILING}`,
        },
  );

  checks.push(
    needed === count > 0
      ? { name: "clarificationFlagAgrees", status: "pass", detail: `needed=${needed}, ${count}` }
      : {
          name: "clarificationFlagAgrees",
          status: "fail",
          detail: `needed=${needed} but ${count} question(s) returned`,
        },
  );

  // Only `"no"` is a mechanical expectation. "likely", "acceptable" and "expected" are the
  // corpus author's judgement about a judgement call, and gating on them would be scoring
  // taste (`§4.5`) — except that "expected" with zero questions is worth surfacing.
  if (caseData.expectClarification === "no") {
    checks.push(
      count === 0
        ? { name: "clarificationExpectation", status: "pass", detail: "asked nothing, as required" }
        : {
            name: "clarificationExpectation",
            status: "fail",
            detail: `the prompt was sufficient; ${count} question(s) is over-asking`,
          },
    );
  } else {
    checks.push({
      name: "clarificationExpectation",
      status: "advisory",
      detail: `corpus expects "${caseData.expectClarification}"; model asked ${count}. Whether the question earned its place is a qualitative judgement`,
    });
  }

  if (count === 0) {
    checks.push({ name: "clarificationNotLogistics", status: "n/a", detail: "no questions" });
    checks.push({ name: "clarificationOffersDefer", status: "n/a", detail: "no questions" });
    return checks;
  }

  const logistics = questions.flatMap((q) => {
    const categories = logisticsCategories(q.question);
    return categories.length > 0 ? [`"${q.question}" asks ${categories.join("/")}`] : [];
  });
  checks.push(
    logistics.length === 0
      ? {
          name: "clarificationNotLogistics",
          status: "pass",
          detail: "no question asks for an operational field",
        }
      : { name: "clarificationNotLogistics", status: "fail", detail: logistics.join("; ") },
  );

  const missingDefer = questions.flatMap((q) =>
    q.options.filter((o) => o.isDefer).length === 1 ? [] : [`"${q.question}"`],
  );
  checks.push(
    missingDefer.length === 0
      ? {
          name: "clarificationOffersDefer",
          status: "pass",
          detail: "every question offers exactly one defer option",
        }
      : {
          name: "clarificationOffersDefer",
          status: "fail",
          detail: `no single defer option on: ${missingDefer.join("; ")}`,
        },
  );

  return checks;
}

/* ------------------------------------------------------------------ entry point */

export function evaluateCase(caseData: CorpusCase, result: EventIdentityResult): CaseEvaluation {
  const checks: Check[] = [
    checkFactsPreserved(caseData, result.suppliedFacts),
    checkFactsGrounded(caseData, result.suppliedFacts),
    reportFactFieldMapping(caseData, result.suppliedFacts),
    reportSurplusFacts(caseData, result.suppliedFacts),
    checkHostNegationRespected(caseData, result.identity),
    checkExclusionSelfConsistency(result.identity),
    ...checkMustAvoid(caseData, result.identity),
    ...checkClarification(caseData, result.clarification.questions, result.clarification.needed),
  ];
  return {
    caseId: caseData.id,
    checks,
    mechanicalPass: checks.every((c) => c.status !== "fail"),
  };
}
