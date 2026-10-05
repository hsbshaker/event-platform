"use client";

import { useState } from "react";

import { DesignsList } from "@/app/events/[id]/DesignsList";
import type { ChooseOutcome } from "@/app/events/[id]/direction/NewCardActions";
import type { RevealedCard } from "@/lib/generation/reveal.server";

/**
 * The designs list on its own, with a stubbed `Choose this direction`: it answers `choose` and,
 * when ok, marks the chosen design active in place (what the page's refresh does).
 */
export function DesignsFixture({
  designs: initial,
  published,
  choose,
}: {
  designs: RevealedCard[];
  published: boolean;
  choose: string;
}) {
  const [designs, setDesigns] = useState(initial);

  async function stub(): Promise<ChooseOutcome> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (choose === "published" || choose === "not_found") return { ok: false, reason: choose };
    if (choose === "fail") throw new Error("offline");
    return { ok: true };
  }

  return (
    <main className="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col items-center gap-6 px-4 py-10 lg:py-14">
      <DesignsList
        eventId="00000000-0000-4000-8000-000000000000"
        designs={designs}
        published={published}
        choose={stub}
        onChosen={(designId) =>
          setDesigns((all) => all.map((d) => ({ ...d, active: d.designId === designId })))
        }
      />
    </main>
  );
}
