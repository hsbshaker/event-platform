/**
 * The landing's showcase cards (docs/design-system.md §4.1): real cards the product generated for
 * sample events the platform owns (`scripts/showcase/sample-events.json`), drawn by the production
 * card component and exported as static images (`scripts/showcase/export.mjs`). Each caption is
 * its sample event's prompt, verbatim; the names, dates and venues on the cards are sample facts.
 *
 * The set is chosen by the platform and changes only deliberately. It is never personalised and
 * never drawn from hosts' events, and a card is never offered as a starting point (spec.md §32 #6).
 */
export interface ShowcaseCard {
  /** The sample event's id in `scripts/showcase/sample-events.json`. */
  id: string;
  /** The exported image under `public/`. */
  src: string;
  width: number;
  height: number;
  /** Describes the card for screen readers; the caption is visible text. */
  alt: string;
  /** The sample event's prompt, shown verbatim as the caption. */
  prompt: string;
  /** The design's stored name and description, as the generation surface shows them. */
  name: string;
  description: string;
}

const WOODLAND: ShowcaseCard = {
  id: "S-01",
  src: "/showcase/woodland-baby-shower.webp",
  width: 720,
  height: 1008,
  alt: "Invitation card in an arch: a spotted fawn asleep on moss and ferns beneath the title Little One of the Woods, a baby shower hosted by Hannah and Leo at Fernwood Lodge.",
  prompt: "baby shower for our little one, woodland animals, cozy and sweet but not cartoonish",
  name: "Woodland Little One",
  description:
    "A softly spotted fawn rests in a fern-lined woodland nest, bringing quiet tenderness to the celebration.",
};

const BALLOONS: ShowcaseCard = {
  id: "S-02",
  src: "/showcase/balloon-first-birthday.webp",
  width: 720,
  height: 1008,
  alt: "Invitation card: a striped fabric hot air balloon over layered green hills in paper collage beneath the title Little Balloon Dreams, a birthday celebration hosted by the Alvarez family.",
  prompt: "first birthday, hot air balloons drifting over green hills, soft and dreamy",
  name: "Balloon Daydream",
  description:
    "Soft fabric balloons float over layered green hills in a luminous, dreamlike collage.",
};

const ROSES: ShowcaseCard = {
  id: "S-06",
  src: "/showcase/roses-bridal-shower.webp",
  width: 720,
  height: 1008,
  alt: "Invitation card in an arch: a porcelain teacup filled with blush roses beneath the title Roses & Tea, a bridal shower hosted by Sofia's bridesmaids at The Glasshouse.",
  prompt: "bridal shower, garden tea party, blush roses and sage",
  name: "Roses in Porcelain",
  description:
    "A porcelain teacup brimming with blush roses brings garden romance to a refined botanical collage.",
};

const KELP: ShowcaseCard = {
  id: "S-08",
  src: "/showcase/kelp-forest-graduation.webp",
  width: 720,
  height: 1008,
  alt: "Invitation card: a border of kelp, fish and starfish around the title Depths of Discovery, a graduation party hosted by the Okafor family at Lakeside Clubhouse.",
  prompt: "graduation party, she's off to study marine biology",
  name: "Kelp Forest Discovery",
  description:
    "A living kelp-forest border brings marine wonder and fresh possibility to a graduation celebration.",
};

const FISHING: ShowcaseCard = {
  id: "S-09",
  src: "/showcase/fishing-retirement.webp",
  width: 720,
  height: 1008,
  alt: "Invitation card: a fishing float resting on a still lake at dawn beneath the title Let the Days Drift, a retirement party hosted by the Brennan kids at Pine Lake Lodge.",
  prompt: "Dad's retirement party, he's finally going fishing every day",
  name: "Days Afloat",
  description:
    "A classic fishing float rests on quiet water, celebrating the pleasure of unhurried days.",
};

/** Hung left to right; the outer two show from `lg`, the inner two only from `xl`. */
export const SHOWCASE: readonly ShowcaseCard[] = [WOODLAND, BALLOONS, ROSES, KELP];

/** The one card a phone shows, above the headline. */
export const SHOWCASE_PHONE: ShowcaseCard = WOODLAND;

/** The card whose words, design and image tell "Watch it come to life". */
export const SHOWCASE_STORY: ShowcaseCard = FISHING;
