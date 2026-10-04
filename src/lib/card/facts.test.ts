import { describe, expect, it } from "vitest";

import {
  CARD_FACT_MAX_LENGTH,
  addressFirstLine,
  cardContent,
  cardVenue,
  formatCardDate,
  formatCardRsvpBy,
  formatCardTime,
} from "./facts";

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
