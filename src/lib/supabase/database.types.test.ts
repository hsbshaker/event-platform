import { describe, expect, expectTypeOf, it } from "vitest";
import type { ModelOperation as ProviderOperation } from "@/lib/ai/provider";
import { ART_MODES, type ArtMode } from "@/lib/card/art-modes";
import { CARD_LAYOUT_IDS, type CardLayoutId } from "@/lib/card/layouts";
import { CARD_SHAPES, type CardShape } from "@/lib/card/shapes";
import type { Database } from "./database.types";

type Enums = Database["public"]["Enums"];

// The database enums mirror the versioned card code (supabase/migrations/
// 20261004000000_phase4_card_data.sql). Adding a shape, layout or art mode is a layout-set version bump
// and must land in both places; `npm run typecheck` fails here when they drift.
describe("card enums in the database contract", () => {
  it("matches the card shapes, layouts and art modes", () => {
    expectTypeOf<Enums["card_shape"]>().toEqualTypeOf<CardShape>();
    expectTypeOf<Enums["card_layout"]>().toEqualTypeOf<CardLayoutId>();
    expectTypeOf<Enums["card_art_mode"]>().toEqualTypeOf<ArtMode>();
    expect(CARD_SHAPES).toHaveLength(6);
    expect(CARD_LAYOUT_IDS).toHaveLength(5);
    expect(ART_MODES).toHaveLength(4);
  });
});

describe("model operations in the database contract", () => {
  it("records every operation the provider performs", () => {
    expectTypeOf<ProviderOperation>().toExtend<Enums["model_operation"]>();
  });
});
