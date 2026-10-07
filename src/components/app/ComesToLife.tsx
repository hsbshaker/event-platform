import Image from "next/image";
import type { ShowcaseCard } from "./showcase";

/**
 * Below the landing's fold (docs/design-system.md §4.1): how a card comes to life, shown with one
 * real showcase card's own words, design name and description, and the card itself. The stages
 * are the ones the generation surface shows as they happen (§12.2); nothing here is selectable.
 */
export function ComesToLife({ card }: { card: ShowcaseCard }) {
  return (
    <section
      aria-labelledby="comes-to-life"
      className="mx-auto flex w-full max-w-(--width-wide) flex-col gap-10 px-4 py-20 sm:px-8 lg:py-24"
    >
      <div className="flex max-w-(--width-standard) flex-col gap-4">
        <h2 id="comes-to-life" className="text-display-md text-app-text">
          Watch it come to life.
        </h2>
        <p className="text-body-lg text-app-text-secondary">
          While your card is made you see the real work as it happens: your words, the design&apos;s
          name, then the card itself. Add the date and venue while you wait, or just watch.
        </p>
      </div>
      <ol className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <li className="surface-lit flex flex-col gap-3 rounded-2xl p-6 shadow-float">
          <h3 className="text-label-md text-app-text-secondary">Your words</h3>
          <p className="text-quote-lg text-app-text">“{card.prompt}”</p>
        </li>
        <li className="surface-lit flex flex-col gap-3 rounded-2xl p-6 shadow-float lg:mt-8">
          <h3 className="text-label-md text-app-text-secondary">The design</h3>
          <p className="text-heading-md text-app-text">{card.name}</p>
          <p className="text-body-md text-app-text-secondary">{card.description}</p>
        </li>
        <li className="surface-lit flex flex-col gap-4 rounded-2xl p-6 shadow-float lg:mt-16">
          <h3 className="text-label-md text-app-text-secondary">The card</h3>
          <Image
            src={card.src}
            alt={card.alt}
            width={card.width}
            height={card.height}
            sizes="(min-width: 1024px) 280px, 70vw"
            draggable={false}
            className="mx-auto block h-auto w-4/5 select-none"
          />
        </li>
      </ol>
    </section>
  );
}
