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
  /** The outer pair shows from `lg`, narrower until `xl`; the inner pair needs `xl`. */
  outer: boolean;
}

/*
 * Placed so that from 1024px up no card or caption leaves the screen or reaches the composer's
 * column (`--width-standard`, centred): at 1024 an outer card spans 17–137px and its caption
 * 5–149px, against the composer's 168px.
 */
const HANGS: readonly Hang[] = [
  { centre: 0.075, attach: 78, drop: 52, outer: true },
  { centre: 0.19, attach: 116, drop: 100, outer: false },
  { centre: 0.81, attach: 47, drop: 92, outer: false },
  { centre: 0.925, attach: 57, drop: 40, outer: true },
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
              "absolute isolate m-0 -translate-x-1/2 flex-col items-center",
              hang.outer ? "flex w-30 xl:w-35" : "hidden w-35 xl:flex",
            )}
            style={{ left: `${hang.centre * 100}%`, top: STRING_TOP + hang.attach }}
          >
            <span
              aria-hidden="true"
              className="w-px bg-dusk-line/70"
              style={{ height: hang.drop }}
            />
            <ShowcaseImage card={card} width={140} />
            <figcaption
              className={cx(
                "mt-4 text-center text-quote-sm text-dusk-text-secondary",
                hang.outer ? "max-w-36 xl:max-w-44" : "max-w-44",
              )}
            >
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
        draggable={false}
        className="showcase-card block h-auto w-full select-none"
      />
    </span>
  );
}
