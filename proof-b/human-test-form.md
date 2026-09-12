# Design-quality review (five reviewers)

Show each reviewer `human-test-1280-gray-unlabeled.png`, then separately `human-test-390-gray-unlabeled.png`. Do not show `human-test-key.txt`.

1. **Template grouping.** Group any screens that feel like the same underlying template or layout skeleton. Ignore color (the sheet is grayscale on purpose) and ignore type choice unless it is the only difference. A screen with a unique layout is its own group.
2. **Design quality.** Rate each screen 1 to 5: 5 = a designer clearly composed this; 1 = an accident or a broken layout. Consider hierarchy, balance, whitespace, legibility, one clear dominant object.

Record per reviewer: the groups (lists of screen numbers) and the ratings. Score with `node score-human.js <results.json>`, which applies the key.

Pass: median reviewer rates ≥ 70% of the model screens 4 or 5; model screens are not all sorted into groups that also contain library screens (they must form groups of their own); no group of model screens larger than 3.
