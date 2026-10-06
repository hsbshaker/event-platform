"use client";

import { useRef } from "react";
import { Envelope, EnvelopeStage, type EnvelopeProportion } from "@/components/app/Envelope";

/**
 * Development fixture for the browser test: a plain block stands in for the card. The envelope
 * sits on its dusk stage, as the reveal and Preview mount it, above the light page.
 */
export function EnvelopeFixture({
  proportion,
  sealed,
  failFirst,
  delayMs,
}: {
  proportion: EnvelopeProportion;
  sealed: boolean;
  failFirst: boolean;
  delayMs: number;
}) {
  const attempts = useRef(0);
  const onOpen =
    failFirst || delayMs > 0
      ? async () => {
          attempts.current += 1;
          await new Promise((r) => setTimeout(r, delayMs));
          if (failFirst && attempts.current === 1) throw new Error("fixture failure");
        }
      : undefined;

  return (
    <main className="mx-auto w-full max-w-(--width-standard) px-4 py-8">
      <EnvelopeStage>
        {sealed ? (
          <Envelope
            title="Maya & Jonas: Garden Supper"
            proportion={proportion}
            sealed
            sealedContent={<p className="text-center text-body-md">Event code goes here</p>}
          />
        ) : (
          <Envelope title="Maya & Jonas: Garden Supper" proportion={proportion} onOpen={onOpen}>
            <div className="flex h-full w-full items-center justify-center rounded-lg border border-app-border-strong bg-app-surface text-body-md text-app-text">
              Placeholder card content
            </div>
          </Envelope>
        )}
      </EnvelopeStage>
      <p className="mt-8 text-body-md">Page below the card</p>
    </main>
  );
}
