-- The cover layouts (card_layouts_v5; docs/card-system.md §2.3; owner decisions 2026-10-06): a
-- full-bleed scene with the words set in a calm band of it, words on top or below. The layout set
-- is product code (src/lib/card/layouts.ts); the enum only lets a design that chose one be stored.
alter type public.card_layout add value if not exists 'cover-top';
alter type public.card_layout add value if not exists 'cover-bottom';
