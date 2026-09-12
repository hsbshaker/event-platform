# Phase A.1 critique — written after rendering the sixteen and the sixty

Renders: `heroes-1280-gray.png`, `heroes-390-gray.png`, `sheet-*.png` (sixteen), `gate2-*.png` (sixty). Numbers in `a1-collision.json`, `gate2-stats.json`, `gate2-nocap-stats.json`, `gate2-raw-stats.json`.

## Did the expanded vocabulary hold together?

Yes. Sixteen hand-composed and sixty seeded pages, one page system each, no combination that looked wrong at either width after three recipe-level fixes. Nothing needed a per-site override; the harness still has no site branches.

## Did the admission rule work?

Yes, and it was the right rule. Poster and masthead, the two Phase A collisions, now each produce three silhouettes, and on the sixteen-site sheets 03 versus 11 (band below versus band rail) and 04 versus 12 (rail right versus band top) no longer read as the same template. The sixteen have a maximum similarity of .55 and nothing at .60. On the sixty, the variant term is what allowed the selector to accept the same hero more than once without producing an obvious repeat.

## The four new heroes

- **Date rail**: strong. The tall ruled column with a giant numeral is the most editorial thing in the set, and its mobile transform (column becomes a header row) survives well.
- **Ticket**: strong, and too strong for its own good. It is the most memorable object in the vocabulary, which means it is also the fastest to be recognized as a repeat. Deserves a tighter batch cap than other heroes.
- **Numeral**: strong once the title was made secondary. At full display size the title fought the numeral and, at monumental, overran the screen.
- **Rule grid**: the quietest of the four. `cells` versus `columns` is a real silhouette difference, but on a light continuous plan it can read as "the masthead with more rules". Fine as a member of twelve; would be a weak member of eight.

## The fifth RSVP shell

`rsvp_wide_heading` is the most visible RSVP variation at desktop: an accent band the width of the section with the form pushed into a narrow right column. Inside a framed surface it stays inside the frame, which reads as intended. Mobile convergence remains and is accepted.

## What Gate 2 changed in my understanding

1. Sixty sites cannot have sixty different first screens from 27 silhouettes; they can have about 25. That is a vocabulary size question, and the right way to grow it is more heroes with variants, not more parameters.
2. The silhouette cap belongs in the batch planner, not in the signature. The signature is pairwise; "how many times has this silhouette appeared in this batch" is a batch property.
3. Half the sites needed a contrast repair, which says the composition fields are not independent and the compiler should not sample them as if they were.
4. Corner cases appear at sixty that never appear at twelve. The generator-plus-harness pair is a regression test and should be kept.

## Verdict

A.1 holds together coherently, the admission rule fixed the Phase A collisions, and Gate 2 passes on its criteria with the findings above. Canonical docs can now be updated: hero admission rule, structural/cosmetic split, revised signature with per-mode computation, contentFit on recipes, compatibility rules on recipes, silhouette cap in the batch planner, and the plan/contrast derivation change.
