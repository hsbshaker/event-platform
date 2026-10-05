import { describe, expect, it } from "vitest";
import { eventPageContent, type EventPageSource } from "./page-content";
import { PROVISIONAL_VENUE } from "./provisional";

const now = new Date("2026-09-01T00:00:00Z");

const EMPTY: EventPageSource = {
  title: "Lemons & Linen",
  hosts: null,
  babyName: null,
  eventDate: null,
  startTime: null,
  endTime: null,
  venueName: null,
  address: null,
  rsvpDeadline: null,
  timezone: "America/New_York",
  description: null,
  promptFacts: null,
};

const FULL: EventPageSource = {
  ...EMPTY,
  hosts: "Alex & Sam",
  babyName: "Maya Lopez",
  eventDate: "2026-12-19",
  startTime: "13:00",
  endTime: "16:00:00",
  venueName: "Villa Rosa",
  address: "12 Rose Lane, Tucson",
  rsvpDeadline: "2026-12-06T17:00:00.000Z",
  description: "  Lunch in the garden.  ",
};

describe("eventPageContent", () => {
  it("shows real values, formatted as the card formats them, in both variants", () => {
    for (const variant of ["creation", "guest"] as const) {
      const content = eventPageContent(FULL, variant, now);
      expect(content.date).toEqual({ text: "Saturday, December 19", needsConfirming: false });
      expect(content.time).toEqual({ text: "1:00 pm – 4:00 pm", needsConfirming: false });
      expect(content.venue).toEqual({
        name: "Villa Rosa",
        address: "12 Rose Lane, Tucson",
        needsConfirming: false,
      });
      expect(content.hosts).toEqual({ text: "Alex & Sam", needsConfirming: false });
      expect(content.babyName).toEqual({ text: "Maya Lopez", needsConfirming: false });
      expect(content.rsvpBy).toEqual({ text: "RSVP by December 6", needsConfirming: false });
      expect(content.description).toBe("Lunch in the garden.");
      expect(content.title).toBe("Lemons & Linen");
    }
  });

  it("guest: a missing fact is absent, never a placeholder", () => {
    const content = eventPageContent(
      { ...EMPTY, promptFacts: { ...NO_FACTS, date: "Dec 19", venue: "Villa Rosa" } },
      "guest",
      now,
    );
    expect(content).toMatchObject({
      hosts: null,
      babyName: null,
      date: null,
      time: null,
      venue: null,
      rsvpBy: null,
      description: null,
    });
  });

  it("creation: missing date, time and venue are placeholders marked as needing confirming", () => {
    const content = eventPageContent(EMPTY, "creation", now);
    expect(content.date?.needsConfirming).toBe(true);
    expect(content.date?.text).toMatch(/^Saturday, /);
    expect(content.time).toEqual({ text: "1:00 pm", needsConfirming: true });
    expect(content.venue).toEqual({
      name: PROVISIONAL_VENUE,
      address: null,
      needsConfirming: true,
    });
    // Hosts and baby name are omitted rather than invented.
    expect(content.hosts).toBeNull();
    expect(content.babyName).toBeNull();
    // The default RSVP-by of the placeholder date is itself a stand-in.
    expect(content.rsvpBy?.needsConfirming).toBe(true);
  });

  it("creation: prompt-stated values show as written, marked, and the RSVP-by waits for a real date", () => {
    const content = eventPageContent(
      {
        ...EMPTY,
        promptFacts: {
          ...NO_FACTS,
          date: "Dec 19",
          time: "1pm",
          venue: "Villa Rosa",
          hosts: "Alex",
        },
      },
      "creation",
      now,
    );
    expect(content.date).toEqual({ text: "Dec 19", needsConfirming: true });
    expect(content.time).toEqual({ text: "1pm", needsConfirming: true });
    expect(content.venue?.name).toBe("Villa Rosa");
    expect(content.venue?.needsConfirming).toBe(true);
    expect(content.hosts).toEqual({ text: "Alex", needsConfirming: true });
    expect(content.rsvpBy).toBeNull();
  });

  it("a stored value always wins over what the prompt states", () => {
    const content = eventPageContent(
      { ...FULL, promptFacts: { ...NO_FACTS, date: "Jan 1", venue: "Elsewhere" } },
      "creation",
      now,
    );
    expect(content.date?.text).toBe("Saturday, December 19");
    expect(content.venue?.name).toBe("Villa Rosa");
  });

  it("an address with no venue name is real, shown as the address", () => {
    const content = eventPageContent(
      { ...EMPTY, address: "12 Rose Lane, Tucson" },
      "creation",
      now,
    );
    expect(content.venue).toEqual({
      name: null,
      address: "12 Rose Lane, Tucson",
      needsConfirming: false,
    });
  });

  it("a saved date with a default deadline is not marked", () => {
    const content = eventPageContent({ ...EMPTY, eventDate: "2026-12-19" }, "creation", now);
    expect(content.date?.needsConfirming).toBe(false);
    expect(content.rsvpBy?.needsConfirming).toBe(false);
  });

  it("blank strings count as missing", () => {
    const content = eventPageContent({ ...FULL, hosts: "  ", description: " " }, "guest", now);
    expect(content.hosts).toBeNull();
    expect(content.description).toBeNull();
  });
});

const NO_FACTS = {
  hosts: null,
  honoree: null,
  date: null,
  time: null,
  venue: null,
  location: null,
};
