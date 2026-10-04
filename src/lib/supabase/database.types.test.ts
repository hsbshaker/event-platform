import { describe, expect, expectTypeOf, it } from "vitest";
import { ART_MODES, type ArtMode } from "@/lib/card/art-modes";
import { CARD_SHAPES, type CardShape } from "@/lib/card/shapes";
import type { Database } from "./database.types";

type Enums = Database["public"]["Enums"];

// The database enums mirror the versioned card code (supabase/migrations/
// 20261004000000_phase4_card_data.sql). Adding a shape or art mode is a layout-set version bump
// and must land in both places; `npm run typecheck` fails here when they drift.
describe("card enums in the database contract", () => {
  it("matches the card shapes and art modes", () => {
    expectTypeOf<Enums["card_shape"]>().toEqualTypeOf<CardShape>();
    expectTypeOf<Enums["card_art_mode"]>().toEqualTypeOf<ArtMode>();
    expect(CARD_SHAPES).toHaveLength(6);
    expect(ART_MODES).toHaveLength(4);
  });
});
