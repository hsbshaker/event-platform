# Event Platform Documentation — Revision 7

The product is an AI-designed **invitation card** — generated artwork with real text set over it,
opened from an envelope — above a standard event page with details, RSVP and registry
(`CHANGELOG-v7.md`). The Revision 6 website architecture and its evidence were retired and deleted;
git history is their archive (last at commit `e86e7e9`).

## Source-of-truth order

0. **`product-doctrine.md`** — what the product promises and the creative bar it must clear. Read
   first, before any creative or product decision; it states intent rather than requirements and
   never overrides a document below it. Its §14 lists the questions still open.
1. **`../spec.md`** — product/business/architecture requirements, acceptance criteria (§31) and
   guardrails (§32).
2. **`technology-decisions.md`** — locked MVP stack; do not relitigate.
3. **`design-system.md`** — application UX, interaction, visual tokens, responsive/motion/
   accessibility system, the house-style guest page, and the boundary around the card.
4. **`card-system.md`** — the invitation card: layouts, art modes, text slots, ink and legibility,
   text fit, the envelope, persistence and versioning.
5. **`model-contracts.md`** — Event Identity, fact extraction, Card Design and Card Art contracts;
   prompts in `model-prompts/`, schemas in `model-schemas/`, the creative-understanding corpus in
   `model-evals/`.
6. **`e2e-workflow.md`** — canonical owner/co-host and guest journeys.
7. **`screen-spec.md`** — screen/surface-level behavior.
8. **`CHANGELOG-v7.md`** — what Revision 7 changed and why, and the owner's decisions.
9. **`development-plan.md`** — the build sequence and its exit conditions; orders the work,
   defines no requirements.

When documents conflict, use the highest source in the list unless a lower document is explicitly
called out by the higher source as authoritative for implementation detail. The doctrine is read
first and ranks last.

## History

Superseded documents are not kept in this folder. Use git history; do not recreate old revisions
here or patch them to look current.
