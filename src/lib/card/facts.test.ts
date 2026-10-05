import { describe, expect, it } from "vitest";

import {
  CARD_FACT_MAX_LENGTH,
  addressFirstLine,
  cardContent,
  cardContentWithPlaceholders,
  cardVenue,
  effectiveCardTitle,
  formatCardDate,
  formatCardRsvpBy,
  formatCardTime,
  parsePromptFacts,
  promptFactCandidates,
  revealCardContent,
  type PromptFacts,
} from "./facts";
import { CARD_SLOT_IDS } from "./slots";

const pad = (n: number) => String(n).padStart(2, "0");

/** Every calendar day of a leap year and a common year. */
function everyDate(): string[] {
  const out: string[] = [];
  for (const year of [2027, 2028]) {
    for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 86_400_000) {
      const d = new Date(t);
      out.push(`${year}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
    }
  }
  return out;
}

/** Every minute of the day, as stored (`HH:MM`). */
function everyTime(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h += 1) for (let m = 0; m < 60; m += 1) out.push(`${pad(h)}:${pad(m)}`);
  return out;
}

describe("formatCardDate", () => {
  it("gives the weekday, month and day without the year", () => {
    expect(formatCardDate("2026-06-06")).toBe("Saturday, June 6");
    expect(formatCardDate("2026-09-30")).toBe("Wednesday, September 30");
    expect(formatCardDate("2028-02-29")).toBe("Tuesday, February 29");
  });

  it("refuses what is not a stored calendar date", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-6-6", "June 6", "", "2026-06-06T00:00"]) {
      expect(() => formatCardDate(bad), bad).toThrow();
    }
  });

  it(`is at most ${CARD_FACT_MAX_LENGTH.date} characters`, () => {
    const lengths = everyDate().map((d) => formatCardDate(d).length);
    expect(Math.max(...lengths)).toBe(CARD_FACT_MAX_LENGTH.date);
  });
});

describe("formatCardTime", () => {
  it("gives a twelve-hour time with am or pm, and an end time after an en dash", () => {
    expect(formatCardTime("13:00")).toBe("1:00 pm");
    expect(formatCardTime("13:00:00", "16:00:00")).toBe("1:00 pm – 4:00 pm");
    expect(formatCardTime("00:05")).toBe("12:05 am");
    expect(formatCardTime("12:00")).toBe("12:00 pm");
    expect(formatCardTime("11:59", null)).toBe("11:59 am");
    expect(formatCardTime("22:30", "23:45")).toBe("10:30 pm – 11:45 pm");
  });

  it("refuses what is not a stored time", () => {
    for (const bad of ["24:00", "1:00", "13:60", "1 pm", ""]) {
      expect(() => formatCardTime(bad), bad).toThrow();
    }
    expect(() => formatCardTime("13:00", "4pm")).toThrow();
  });

  it(`is at most ${CARD_FACT_MAX_LENGTH.time} characters`, () => {
    const longestClock = Math.max(...everyTime().map((t) => formatCardTime(t).length));
    // A start and an end at their longest.
    expect(longestClock * 2 + " – ".length).toBe(CARD_FACT_MAX_LENGTH.time);
    expect(formatCardTime("22:00", "23:00")).toHaveLength(CARD_FACT_MAX_LENGTH.time);
  });
});

describe("formatCardRsvpBy", () => {
  it("gives the deadline's date in the event's timezone", () => {
    // 11:59 pm in Los Angeles on May 30 is May 31 in UTC.
    expect(formatCardRsvpBy("2026-05-31T06:59:00Z", "America/Los_Angeles")).toBe("RSVP by May 30");
    expect(formatCardRsvpBy(new Date("2026-05-31T06:59:00Z"), "UTC")).toBe("RSVP by May 31");
    expect(formatCardRsvpBy("2026-09-16T23:59:00+10:00", "Australia/Sydney")).toBe(
      "RSVP by September 16",
    );
  });

  it("refuses an invalid instant or timezone", () => {
    expect(() => formatCardRsvpBy("not a date", "UTC")).toThrow();
    expect(() => formatCardRsvpBy("2026-05-30T12:00:00Z", "Mars/Olympus")).toThrow();
  });

  it(`is at most ${CARD_FACT_MAX_LENGTH.rsvpBy} characters`, () => {
    const lengths = everyDate().map((d) => formatCardRsvpBy(`${d}T12:00:00Z`, "UTC").length);
    expect(Math.max(...lengths)).toBe(CARD_FACT_MAX_LENGTH.rsvpBy);
  });
});

describe("the card's venue", () => {
  it("is the venue name, else the address's first line", () => {
    expect(cardVenue("The Willow House", "12 Elm St, Austin, TX")).toBe("The Willow House");
    expect(cardVenue("  ", "12 Elm St, Austin, TX 78701")).toBe("12 Elm St");
    expect(cardVenue(null, "Flat 3\n12  Elm   St\nAustin")).toBe("Flat 3");
    expect(cardVenue(null, " , 12 Elm St")).toBe("12 Elm St");
    expect(cardVenue(undefined, null)).toBeNull();
    expect(addressFirstLine("   ")).toBeNull();
  });
});

describe("cardContent", () => {
  const full = {
    title: "  A Little Wild One ",
    invitationLine: " Please join us for a baby shower ",
    babyName: " Zoë ",
    hosts: " Hosted by Maya & Tom ",
    eventDate: "2026-06-06",
    startTime: "13:00:00",
    endTime: "16:00",
    venueName: " The Willow House ",
    address: "12 Elm St, Austin",
    rsvpDeadline: "2026-05-30T12:00:00Z",
    timezone: "America/Chicago",
  };

  it("formats the facts, trims every string and takes the venue from the card's rule", () => {
    expect(cardContent(full)).toEqual({
      title: "A Little Wild One",
      invitationLine: "Please join us for a baby shower",
      babyName: "Zoë",
      hosts: "Hosted by Maya & Tom",
      date: "Saturday, June 6",
      time: "1:00 pm \u2013 4:00 pm",
      venue: "The Willow House",
      rsvpBy: "RSVP by May 30",
    });
    expect(cardContent({ ...full, venueName: "  " }).venue).toBe("12 Elm St");
  });

  it("gives null for every missing fact", () => {
    const none = {
      title: null,
      invitationLine: undefined,
      babyName: "  ",
      hosts: "",
      eventDate: null,
      startTime: null,
      endTime: "16:00",
      venueName: null,
      address: null,
      rsvpDeadline: null,
      timezone: null,
    };
    expect(cardContent(none)).toEqual({
      title: null,
      invitationLine: null,
      babyName: null,
      hosts: null,
      date: null,
      time: null,
      venue: null,
      rsvpBy: null,
    });
    expect(cardContent({ ...full, timezone: null }).rsvpBy).toBeNull();
    expect(cardContent({ ...full, endTime: null }).time).toBe("1:00 pm");
  });

  it("keeps the formatted facts within CARD_FACT_MAX_LENGTH", () => {
    const worst = cardContent({
      ...full,
      eventDate: "2026-09-30",
      startTime: "22:00",
      endTime: "23:00",
      rsvpDeadline: "2026-09-30T12:00:00Z",
      timezone: "UTC",
    });
    expect(worst.date).toHaveLength(CARD_FACT_MAX_LENGTH.date);
    expect(worst.time).toHaveLength(CARD_FACT_MAX_LENGTH.time);
    expect(worst.rsvpBy).toHaveLength(CARD_FACT_MAX_LENGTH.rsvpBy);
  });

  it("refuses a stored value that is not valid rather than guessing", () => {
    expect(() => cardContent({ ...full, eventDate: "June 6" })).toThrow();
  });
});

describe("revealCardContent (spec.md §7.3: the words the card shows right after generation)", () => {
  const wording = {
    title: "A Little Wild One",
    invitationLine: "Please join us for a baby shower",
  };
  const nothing = {
    babyName: null,
    hosts: null,
    eventDate: null,
    startTime: null,
    endTime: null,
    venueName: null,
    address: null,
    rsvpDeadline: null,
    timezone: null,
  };
  const stored = {
    babyName: "Zoë",
    hosts: "Hosted by Maya & Tom",
    eventDate: "2026-06-06",
    startTime: "13:00:00",
    endTime: "16:00",
    venueName: "The Willow House",
    address: "12 Elm St, Austin",
    rsvpDeadline: "2026-05-30T12:00:00Z",
    timezone: "America/Chicago",
  };
  const stated: PromptFacts = {
    hosts: "Ana and Leo",
    honoree: "Maya Lopez",
    date: "December 19",
    time: "2pm",
    venue: "Villa Rosa",
    location: "Positano, Italy",
  };
  const none: PromptFacts = {
    hosts: null,
    honoree: null,
    date: null,
    time: null,
    venue: null,
    location: null,
  };
  const now = new Date("2026-10-05T12:00:00Z");
  const fitsAll = () => true;

  it("shows the Creation Mode placeholders for a missing date, time and venue, unconfirmed", () => {
    for (const promptFacts of [null, none]) {
      expect(
        revealCardContent({ wording, event: nothing, promptFacts, fits: fitsAll, now }),
      ).toEqual({
        content: {
          title: "A Little Wild One",
          invitationLine: "Please join us for a baby shower",
          babyName: null,
          hosts: null,
          // Twelve weeks out (Monday, December 28), then the Saturday after.
          date: "Saturday, January 2",
          time: "1:00 pm",
          venue: "Venue to be announced",
          rsvpBy: null,
        },
        unconfirmed: ["date", "time", "venue"],
      });
    }
  });

  it("shows the event's stored facts as cardContent formats them, confirmed", () => {
    const result = revealCardContent({
      wording,
      event: stored,
      promptFacts: null,
      fits: fitsAll,
      now,
    });
    expect(result).toEqual({ content: cardContent({ ...stored, ...wording }), unconfirmed: [] });
    // The address's first line stands in for a missing venue name, before any placeholder.
    const street = { ...nothing, address: "12 Elm St, Austin" };
    const { content, unconfirmed } = revealCardContent({
      wording,
      event: street,
      promptFacts: null,
      fits: fitsAll,
      now,
    });
    expect(content.venue).toBe("12 Elm St");
    expect(unconfirmed).not.toContain("venue");
  });

  it("shows each fact the prompt states as the host wrote it, unconfirmed (owner, 2026-10-04)", () => {
    expect(
      revealCardContent({ wording, event: nothing, promptFacts: stated, fits: fitsAll, now }),
    ).toEqual({
      content: {
        title: "A Little Wild One",
        invitationLine: "Please join us for a baby shower",
        babyName: "Maya Lopez",
        hosts: "Ana and Leo",
        date: "December 19",
        time: "2pm",
        venue: "Villa Rosa",
        rsvpBy: null,
      },
      unconfirmed: ["babyName", "hosts", "date", "time", "venue"],
    });
  });

  it("never lets a prompt fact replace a stored fact, the title, or the RSVP-by", () => {
    const facts = { ...stated, title: "Maya's Garden Party", eventType: "baby shower" };
    const result = revealCardContent({
      wording,
      event: stored,
      promptFacts: facts as PromptFacts,
      fits: fitsAll,
      now,
    });
    expect(result).toEqual({ content: cardContent({ ...stored, ...wording }), unconfirmed: [] });
    // One stored fact, the rest stated: only the stated ones are unconfirmed.
    const partly = revealCardContent({
      wording,
      event: { ...nothing, hosts: "Hosted by Maya & Tom" },
      promptFacts: stated,
      fits: fitsAll,
      now,
    });
    expect(partly.content.hosts).toBe("Hosted by Maya & Tom");
    expect(partly.content.title).toBe("A Little Wild One");
    expect(partly.unconfirmed).toEqual(["babyName", "date", "time", "venue"]);
  });

  it("takes the location's first line for the venue only when the prompt states no venue", () => {
    const venueOf = (facts: PromptFacts) =>
      revealCardContent({ wording, event: nothing, promptFacts: facts, fits: fitsAll, now }).content
        .venue;
    expect(venueOf(stated)).toBe("Villa Rosa");
    expect(venueOf({ ...stated, venue: null })).toBe("Positano");
    expect(venueOf({ ...stated, venue: "  " })).toBe("Positano");
    expect(venueOf({ ...none, location: "12 Via Roma\nRome" })).toBe("12 Via Roma");
    // A stored address is the host's venue: the prompt's location never replaces it.
    const { content, unconfirmed } = revealCardContent({
      wording,
      event: { ...nothing, address: "4 Oak Lane, Leeds" },
      promptFacts: { ...none, location: "Positano" },
      fits: fitsAll,
      now,
    });
    expect(content.venue).toBe("4 Oak Lane");
    expect(unconfirmed).toEqual(["date", "time"]);
  });

  it("sets a stated value on one line, as written otherwise", () => {
    const { content } = revealCardContent({
      wording,
      event: nothing,
      promptFacts: { ...none, venue: "  Villa\n  Rosa ", hosts: "Ana  &  Leo" },
      fits: fitsAll,
      now,
    });
    expect(content.venue).toBe("Villa Rosa");
    expect(content.hosts).toBe("Ana & Leo");
  });

  it("shows a stated value only when the slot's entry check accepts it", () => {
    const { content, unconfirmed } = revealCardContent({
      wording,
      event: nothing,
      promptFacts: {
        location: null,
        // Characters the card cannot draw.
        hosts: "Ana & Leo 🎈",
        // Over the baby name's 40 characters.
        honoree: "Maximiliana Augustina Montgomery-Whitworthington",
        // Over the date slot's 23 characters.
        date: "the first Saturday in December",
        // Over the time slot's 19 characters.
        time: "Afternoonteatimeforeveryoneandmore",
        venue: "Villa Rosa",
      },
      fits: fitsAll,
      now,
    });
    expect(content).toMatchObject({
      hosts: null,
      babyName: null,
      date: "Saturday, January 2",
      time: "1:00 pm",
      venue: "Villa Rosa",
    });
    // The placeholders and the accepted value are unconfirmed; the refused hosts are absent.
    expect(unconfirmed).toEqual(["date", "time", "venue"]);
  });

  it("asks the fit check about each candidate only, and shows only what it accepts", () => {
    const asked: [string, string][] = [];
    const { content, unconfirmed } = revealCardContent({
      wording,
      event: { ...nothing, eventDate: "2026-12-19" },
      promptFacts: stated,
      fits: (slot, value) => {
        asked.push([slot, value]);
        return slot !== "venue" && slot !== "hosts";
      },
      now,
    });
    expect(asked).toEqual([
      ["babyName", "Maya Lopez"],
      ["hosts", "Ana and Leo"],
      ["time", "2pm"],
      ["venue", "Villa Rosa"],
    ]);
    expect(content).toMatchObject({
      babyName: "Maya Lopez",
      hosts: null,
      date: "Saturday, December 19",
      time: "2pm",
      venue: "Venue to be announced",
    });
    expect(unconfirmed).toEqual(["babyName", "time", "venue"]);
  });

  it("fills only the slots the layout defines", () => {
    const slots = CARD_SLOT_IDS.filter((slot) => slot !== "babyName");
    const { content, unconfirmed } = revealCardContent({
      wording,
      event: nothing,
      promptFacts: stated,
      slots,
      fits: fitsAll,
      now,
    });
    expect(content.babyName).toBeNull();
    expect(unconfirmed).not.toContain("babyName");
  });

  it("is what cardContentWithPlaceholders gives, without the marks", () => {
    for (const [event, promptFacts] of [
      [nothing, null],
      [nothing, stated],
      [stored, stated],
    ] as const) {
      const input = { wording, event, promptFacts, fits: fitsAll, now };
      expect(cardContentWithPlaceholders(input)).toEqual(revealCardContent(input).content);
    }
  });
});

describe("promptFactCandidates", () => {
  it("maps hosts, honoree, date, time and venue (else location) to their slots", () => {
    expect(
      promptFactCandidates({
        event: {
          babyName: null,
          hosts: null,
          eventDate: null,
          startTime: null,
          endTime: null,
          venueName: null,
          address: null,
          rsvpDeadline: null,
          timezone: null,
        },
        promptFacts: {
          hosts: "Ana",
          honoree: "Maya",
          date: "June 6",
          time: "noon",
          venue: null,
          location: "Austin, TX",
        },
      }),
    ).toEqual({ babyName: "Maya", hosts: "Ana", date: "June 6", time: "noon", venue: "Austin" });
  });

  it("gives nothing without prompt facts", () => {
    expect(
      promptFactCandidates({
        event: {
          babyName: null,
          hosts: null,
          eventDate: null,
          startTime: null,
          endTime: null,
          venueName: null,
          address: null,
          rsvpDeadline: null,
          timezone: null,
        },
        promptFacts: null,
      }),
    ).toEqual({});
  });
});

describe("parsePromptFacts", () => {
  it("reads the stored column's string fields and nothing else", () => {
    expect(parsePromptFacts(null)).toBeNull();
    expect(parsePromptFacts("June 6")).toBeNull();
    expect(parsePromptFacts([])).toBeNull();
    expect(
      parsePromptFacts({
        eventType: "baby shower",
        title: "Garden Party",
        hosts: "Ana",
        honoree: 7,
        date: "June 6",
        time: null,
        venue: { name: "x" },
        partial: [{ field: "time", text: "afternoon" }],
      }),
    ).toEqual({
      hosts: "Ana",
      honoree: null,
      date: "June 6",
      time: null,
      venue: null,
      location: null,
    });
  });
});

describe("effectiveCardTitle (spec.md §20.2)", () => {
  it("is the event's title when the host gave one, else the design's", () => {
    expect(effectiveCardTitle("  Maya's Shower ", "Lemons & Linen")).toBe("Maya's Shower");
    expect(effectiveCardTitle(" ", "Lemons & Linen")).toBe("Lemons & Linen");
    expect(effectiveCardTitle(null, "Lemons & Linen")).toBe("Lemons & Linen");
  });
});
