# Independent qualitative review — Phase 4A baseline run

**Reviewer:** OpenAI Astra, in a fresh conversation, given only `blind-review.md` and the blind
prompt recorded below.
**Subject:** the fourteen `creative_understanding_v1` briefs produced by `gpt-5.6-sol` /
`event_identity_v3` at implementation `ba34c5e`, run `2026-09-14T14:02:55Z`.
**Verdict:** **Phase 4A does not pass the qualitative gate.** Remediation required before Phase 4B.

## Provenance of this document

This is the review **as relayed by the product owner**, not a verbatim transcript of Astra's
output. The findings, the four failure modes, the named cases and the verdict are theirs; the
arrangement is ours. Where a claim is attributed to Astra it is their finding, and where this
document says *we verified* it is a check we ran afterwards against `run.json`.

If the raw transcript is added later it belongs beside this file rather than replacing it.

The review was blind: the reviewer saw the fourteen prompts and the fourteen briefs, and nothing
else — no corpus expectations, no `mustAvoid` lists, no class labels, no mechanical results, no
indication which cases were contested. That blinding was verified against the generated artifact
before it was sent.

## What worked

Several briefs demonstrate real understanding rather than keyword matching:

- **CU-01** — a strong translation of a named fashion house into original heritage qualities.
- **CU-11** — dependable handling of the fully specified preppy/equestrian brief.
- **CU-12** — understood the *social* meaning of "at my mum's house", not just the venue string.
- **CU-13** — strong potential for a distinctive jazz-and-cartography synthesis.

The gate did not fail for want of capability. It failed on a systematic misuse of authority.

## Failure mode 1 — creative suggestions become fake host constraints

**The most important finding.** The model routinely converts its own taste decisions into
constraints attributed to the host. Examples the reviewer cited: *"no literal characters"*,
*"no sentimentality"*, *"no dominant animal pattern"*, avoiding baby blue, *"never literal or
themed"*, and suppressing recognisable subject matter because it might read as corny or cheesy.

Those are often reasonable creative proposals. They are not things the host prohibited.

> "no pink" is a host constraint. "Use literal imagery sparingly" is a creative recommendation.
> They must never carry the same semantic authority.

A downstream designer or compiler must not reject an otherwise excellent idea because Event
Identity represented the model's taste as a client prohibition.

**We verified the scale afterwards.** Classifying all 55 `designConstraints` the run produced:
roughly 12 are traceable to the host, 4 are platform rules about logos and trademarks, and about
**39 are model taste**. Seven in ten. This is not leakage at the margin — model taste is the
dominant content of the field.

The sharpest instance is CU-02. The host wrote *"for a boy"*; the brief returned
*"Do not rely on an obvious gender-coded baby-blue palette."* The host's words vanished from the
recorded facts and reappeared, inverted, as a fabricated prohibition.

## Failure mode 2 — an overly strong house taste

Across cases the model gravitates to warm quiet neutrals, restrained accents, abstraction, tactile
paper, tasteful serif typography, reduced literal imagery, and a standing equation of
sophistication with restraint. Sometimes that is correct. Sometimes it **replaces the assignment**.

> A literal lemon, horse, character, shell, teacup, animal pattern, bright colour or affectionate
> illustration can be sophisticated if the *execution* is sophisticated. Cliché is usually an
> execution problem, not inherently a subject-matter problem.

**Where we disagree, partially.** A meaningful share of this is prompt-induced rather than a model
disposition. `event_identity_v3 §9` is titled "Originality and **restraint**"; three of its four
rules prohibit literal subject matter, and it instructs *"the distance between the obvious reading
and the good one is the assignment. Take the harder reading."* The CU-02 chain is traceable: the
prompt says "do not infer stereotypical gender palettes", and the model escalated *don't infer it*
into *prohibit it*. That is better news than an inherent bias, because it is fixable where it was
caused.

## Failure mode 3 — zero clarifications is not calibrated

The run asked **no questions on any of the fourteen cases**. The reviewer identified places where
one high-value question could materially change the result: CU-04 (recognisable characters versus
literary allusion), CU-07 (which traditions are personally meaningful), CU-13 (what the father
actually loves about jazz and maps), CU-14 (serene coastal versus colourful social beach energy).

At the same time CU-10 — explicit delegation — must **not** produce a question. Asking a host who
said "surprise me" to supply the aesthetic is a failure.

The target is therefore not "ask more". It is: ask only when several materially different creative
worlds are live, the choice cannot reasonably be inferred, and choosing wrong would substantially
change the experience. Otherwise decide. This stays subordinate to the product principle that
**AI removes decisions rather than creating them**.

**We note a mechanical consequence.** Because nothing was ever asked, the deterministic half of
rubric dimension 5 — the logistics filter and the structural `isDefer` requirement — has never
executed against a real question. We have no evidence those checks work.

## Failure mode 4 — describing originality instead of supplying it

CU-10 is the clearest case. "Unexpected contrast", "visual wit", "asymmetry", "something surreal",
"surprising but refined" describe the *property* of originality; they are not a creative idea. When
the host delegates creative control, the brief must make an actual organizing bet a designer can
visualise.

## Failure mode 5 — supplied-fact and context gaps

The reviewer flagged two, and asked that they be verified rather than assumed. We verified both:

- **CU-08 — a true bug.** The prompt is the single phrase "luxury safari", which states no event
  type at all; the brief recorded `eventType: "luxury safari"`. A theme was promoted to an event
  type. The `surplusFacts` advisory caught it, non-gating.
- **CU-02 / CU-11 — a field-coverage gap, not an extraction bug.** `honoreeName` is specified as
  "who the event is for, **as written**", and the prompt states explicitly that *"a relationship
  ('for our son') is not a name"*. The model returned `null` because it did exactly what it was
  told. The gap is ours: host-supplied human context has no home in `suppliedFacts`, so it is
  dropped — and then, as CU-02 shows, resurfaces as invented constraint. The consequence is worse
  than the reviewer described; the mechanism is different.

## Consequences

1. Phase 4A does not pass. PR #12 is not merged. Phase 4B is blocked.
2. This run, its mechanical report, its blind artifact and this review are the **immutable Phase 4A
   baseline**. None of them is rewritten.
3. The fourteen cases are now a **regression suite**, not fresh evidence: every output has been
   inspected and discussed. Any future run against them is labelled a regression re-run.
4. Fresh evaluation requires a **new blinded holdout**, authored and frozen before remediation.
5. The `hostConstraints` / `creativeGuidance` authority split, the honoree-context field, the
   prompt's originality section and the clarification rule are the approved remediation. The
   decisions are recorded in `spec.md §7.5`, `§7.6b` and `docs/model-contracts.md §4.1`.

## The blind prompt used

> I'd like an independent creative review.
>
> Attached are fourteen cases. In each, someone describes an event they're planning in their own
> words, and a system has produced a structured creative brief in response — the creative world it
> places the event in, palette and typographic territory, motifs, textures, the constraints it
> believes it was given, any facts it recorded, and any questions it would ask before designing.
>
> **The question is: did the system actually understand the assignment?**
>
> Judge them however you think is right. I'm interested in your reading, not a score against a
> rubric — but if it helps, the things I can't measure mechanically are whether it caught what the
> person actually meant rather than keyword-matching them; whether the associations it reached for
> are specific and useful to a designer rather than generic; whether anything reads as cliché,
> over-literal, or like it took the obvious route where a better one existed; and whether a strong
> human event designer reading one of these would know what job they'd been handed.
>
> Please go case by case, and tell me which are strongest and weakest and why. If something is
> subtly wrong rather than obviously wrong, that's the most useful thing you can tell me.
>
> Don't look anything up about the system, and don't ask me what the expected answers were — I want
> your unprimed read.
