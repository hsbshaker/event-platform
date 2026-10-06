import Image from "next/image";
import type { CSSProperties } from "react";
import { cx } from "./cx";
import type { ShowcaseCard } from "./showcase";

/**
 * The landing's string of lights and its showcase cards (docs/design-system.md §4.1, §19.1).
 *
 * The cards are pictures, not choices: static exports of real cards generated for sample events,
 * each captioned with the words that produced it. Nothing here is a link, a button or focusable,
 * and nothing offers a card as a starting point (spec.md §32 #6). Desktop hangs up to four beside
 * the composer's column and drops them before they would crowd it; a phone shows one, above the
 * headline (`ShowcaseHanging`).
 */

/** The string's path in a 1440 × 160 box; only its width stretches, so a point's height holds. */
const STRING_PATH = "M-10 40 C 300 150, 520 150, 720 96 S 1140 30, 1450 70";
/** The string's top on the page (px from the hero's top). */
const STRING_TOP = 70;

/** Where each card hangs: its centre across the hero, where it meets the string, string length. */
interface Hang {
  centre: number;
  /** The string's height at `centre`, in the path's box (computed from STRING_PATH). */
  attach: number;
  drop: number;
  width: number;
  /** Shown from this breakpoint up; inner cards need the widest screens. */
  from: "lg" | "xl";
}

const HANGS: readonly Hang[] = [
  { centre: 0.06, attach: 72, drop: 58, width: 140, from: "lg" },
  { centre: 0.18, attach: 113, drop: 105, width: 150, from: "xl" },
  { centre: 0.82, attach: 47, drop: 93, width: 150, from: "xl" },
  { centre: 0.94, attach: 59, drop: 38, width: 140, from: "lg" },
];

/** Bulbs along the string: their place across the hero and the string's height there. */
const BULBS: readonly [number, number][] = [
  [0.03, 58],
  [0.13, 98],
  [0.25, 127],
  [0.37, 128],
  [0.5, 96],
  [0.6, 65],
  [0.7, 50],
  [0.86, 50],
  [0.97, 64],
];

export function ShowcaseFestoon({ cards }: { cards: readonly ShowcaseCard[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-full lg:block">
      <svg
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-x-0 h-40 w-full"
        style={{ top: STRING_TOP }}
      >
        <path
          d={STRING_PATH}
          fill="none"
          stroke="var(--dusk-line)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {BULBS.map(([x, y]) => (
        <span
          key={x}
          aria-hidden="true"
          className="festoon-bulb absolute"
          style={{ left: `${x * 100}%`, top: STRING_TOP + y } as CSSProperties}
        />
      ))}
      {cards.slice(0, HANGS.length).map((card, i) => {
        const hang = HANGS[i];
        return (
          <figure
            key={card.id}
            className={cx(
              "absolute isolate m-0 flex-col items-center",
              hang.from === "xl" ? "hidden xl:flex" : "flex",
            )}
            style={{
              left: `calc(${hang.centre * 100}% - ${hang.width / 2}px)`,
              top: STRING_TOP + hang.attach,
              width: hang.width,
            }}
          >
            <span
              aria-hidden="true"
              className="w-px bg-dusk-line/70"
              style={{ height: hang.drop }}
            />
            <ShowcaseImage card={card} width={hang.width} />
            <figcaption className="mt-4 max-w-44 text-center text-quote-sm text-dusk-text-secondary">
              “{card.prompt}”
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/** The phone's single card, in the flow above the headline (§4.1: never past the first viewport). */
export function ShowcaseHanging({ card }: { card: ShowcaseCard | undefined }) {
  if (!card) return null;
  return (
    <figure className="relative isolate mx-auto mb-2 flex w-36 flex-col items-center lg:hidden">
      <span aria-hidden="true" className="h-6 w-px bg-dusk-line/70" />
      <ShowcaseImage card={card} width={144} />
      <figcaption className="mt-3 text-center text-quote-sm text-dusk-text-secondary">
        “{card.prompt}”
      </figcaption>
    </figure>
  );
}

function ShowcaseImage({ card, width }: { card: ShowcaseCard; width: number }) {
  return (
    <span className="relative block w-full">
      <span aria-hidden="true" className="dusk-pool showcase-pool rounded-pill" />
      <Image
        src={card.src}
        alt={card.alt}
        width={card.width}
        height={card.height}
        sizes={`${width}px`}
        // Above the fold on the landing: never wait for a scroll to load.
        loading="eager"
        draggable={false}
        className="showcase-card block h-auto w-full select-none"
      />
    </span>
  );
}
