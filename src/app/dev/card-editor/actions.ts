"use server";

import { boxesToStore } from "@/lib/card/customization";
import type { TextBox } from "@/lib/card/text-box";
import { parseEditorBoxes, parseStoredBoxes } from "@/lib/card/text-box-schema";
import { cardFontMetrics } from "@/lib/card/text/card-fonts.server";

import { DEV_CARD_DEFINITIONS, isDevCardName } from "./fixture.server";

/**
 * Development-only save for `/dev/card-editor`: the server's own save path without the database
 * (`saveCardCustomization`'s core) — `parseEditorBoxes`, then `boxesToStore` with the previous
 * stored boxes and the card's saved content, then `parseStoredBoxes` on the result, which is what
 * the card is drawn from. No model call, no write. Refuses unless ENABLE_DEV_FIXTURES=1.
 */
export type DevSaveResult =
  | { ok: true; boxes: TextBox[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveDevBoxes(input: {
  card: string;
  previous: unknown;
  boxes: unknown;
}): Promise<DevSaveResult> {
  if (process.env.ENABLE_DEV_FIXTURES !== "1") return { ok: false, error: "Not enabled." };
  if (!isDevCardName(input.card)) return { ok: false, error: "Unknown card." };
  const saved = DEV_CARD_DEFINITIONS[input.card].content;

  const incoming = parseEditorBoxes(input.boxes);
  if (!incoming.ok) {
    return { ok: false, error: "Check the boxes.", fieldErrors: incoming.fieldErrors };
  }
  const previous = parseStoredBoxes(input.previous);
  if (!previous.ok) return { ok: false, error: `Unreadable previous boxes: ${previous.issues}` };

  const metrics = await cardFontMetrics(incoming.boxes.map((b) => b.font));
  const stored = boxesToStore({
    previous: previous.boxes,
    incoming: incoming.boxes,
    saved,
    metrics,
  });
  if (!stored.ok) return { ok: false, error: "Refused.", fieldErrors: stored.fieldErrors };

  const readBack = parseStoredBoxes(stored.boxes);
  if (!readBack.ok) return { ok: false, error: `Stored boxes unreadable: ${readBack.issues}` };
  return { ok: true, boxes: readBack.boxes };
}
