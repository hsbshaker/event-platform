import { describe, expect, it } from "vitest";
import { inferTimezoneFromVenue, resolveEventTimezone, validateTimezone } from "./timezone";

describe("inferTimezoneFromVenue", () => {
  it("returns none for empty/unmatched input", () => {
    expect(inferTimezoneFromVenue(null)).toEqual({
      timezone: null,
      confidence: "none",
      matched: null,
    });
    expect(inferTimezoneFromVenue("")).toEqual({
      timezone: null,
      confidence: "none",
      matched: null,
    });
    expect(inferTimezoneFromVenue("123 Nowhere Ave, Antarctica Base")).toEqual({
      timezone: null,
      confidence: "none",
      matched: null,
    });
  });

  it("matches an unambiguous state abbreviation with high confidence", () => {
    const result = inferTimezoneFromVenue("123 Main St, Austin, TX");
    expect(result.confidence).toBe("high");
    expect(result.timezone).toBe("America/Chicago");
  });

  it("matches an unambiguous full state name with high confidence", () => {
    const result = inferTimezoneFromVenue("Somewhere in California");
    expect(result).toEqual({
      timezone: "America/Los_Angeles",
      confidence: "high",
      matched: "California",
    });
  });

  it("returns low confidence with no zone for an ambiguous split-timezone state", () => {
    const result = inferTimezoneFromVenue("A farm in rural Michigan");
    expect(result.confidence).toBe("low");
    expect(result.timezone).toBeNull();
  });

  it("disambiguates a split-timezone state via an unambiguous city", () => {
    expect(inferTimezoneFromVenue("The Phoenix Convention Center, Phoenix, Arizona")).toEqual({
      timezone: "America/Phoenix",
      confidence: "high",
      matched: "Phoenix",
    });
    expect(inferTimezoneFromVenue("Downtown Indianapolis reception hall")).toEqual({
      timezone: "America/Indiana/Indianapolis",
      confidence: "high",
      matched: "Indianapolis",
    });
    expect(inferTimezoneFromVenue("A garden venue in El Paso")).toEqual({
      timezone: "America/Denver",
      confidence: "high",
      matched: "El Paso",
    });
  });

  it("resolves the Florida panhandle city to Central while the rest of Florida is ambiguous", () => {
    expect(inferTimezoneFromVenue("Pensacola Bay Center")).toEqual({
      timezone: "America/Chicago",
      confidence: "high",
      matched: "Pensacola",
    });
    expect(inferTimezoneFromVenue("Miami Beach Convention Center, Florida")).toEqual({
      timezone: "America/New_York",
      confidence: "high",
      matched: "Miami",
    });
    expect(inferTimezoneFromVenue("A venue somewhere in Florida")).toEqual({
      timezone: null,
      confidence: "low",
      matched: "Florida",
    });
  });

  it("matches Canadian provinces", () => {
    expect(inferTimezoneFromVenue("A hall in British Columbia, Canada")).toEqual({
      timezone: "America/Vancouver",
      confidence: "high",
      matched: "British Columbia",
    });
    // Ontario is split (most of it Eastern, a sliver Central) so stays ambiguous.
    expect(inferTimezoneFromVenue("A backyard in Ontario")).toEqual({
      timezone: null,
      confidence: "low",
      matched: "Ontario",
    });
  });

  it("matches well-known world cities and countries", () => {
    expect(inferTimezoneFromVenue("A rooftop in Tokyo, Japan")).toEqual({
      timezone: "Asia/Tokyo",
      confidence: "high",
      matched: "Tokyo",
    });
    expect(inferTimezoneFromVenue("Somewhere in France")).toEqual({
      timezone: "Europe/Paris",
      confidence: "high",
      matched: "France",
    });
  });

  it("lets an explicitly named state beat a same-named city in another state", () => {
    // Maine's Portland, not Oregon's.
    expect(inferTimezoneFromVenue("Portland, ME")).toEqual({
      timezone: "America/New_York",
      confidence: "high",
      matched: "Maine",
    });
    // New York's Lincoln Center, not Nebraska's Lincoln.
    expect(inferTimezoneFromVenue("Lincoln Center, New York, NY")).toEqual({
      timezone: "America/New_York",
      confidence: "high",
      matched: "New York",
    });
    // Texas's Jacksonville, not Florida's.
    expect(inferTimezoneFromVenue("Jacksonville, TX")).toEqual({
      timezone: "America/Chicago",
      confidence: "high",
      matched: "Texas",
    });
  });

  it("reports the named state when a colliding city in another state agrees on the zone", () => {
    // Massachusetts's Lexington, not Kentucky's. Both are Eastern, so only the reported
    // label tells the two apart.
    expect(inferTimezoneFromVenue("Lexington, MA")).toEqual({
      timezone: "America/New_York",
      confidence: "high",
      matched: "Massachusetts",
    });
  });

  it("lets a city inside the named region override that region's own zone", () => {
    // El Paso is Mountain inside otherwise-Central Texas: an in-state exception, not a
    // cross-state collision, so the city wins however the state is written (or omitted).
    for (const venue of ["El Paso, TX", "El Paso, Texas", "El Paso"]) {
      expect(inferTimezoneFromVenue(venue)).toEqual({
        timezone: "America/Denver",
        confidence: "high",
        matched: "El Paso",
      });
    }
  });

  it("resolves Washington, D.C. in each punctuation form without colliding with the state", () => {
    for (const venue of [
      "Washington, D.C.",
      "Washington DC",
      "Washington, D.C",
      "Washington, DC",
    ]) {
      expect(inferTimezoneFromVenue(venue)).toEqual({
        timezone: "America/New_York",
        confidence: "high",
        matched: "Washington, DC",
      });
    }
    // The state of Washington still resolves to Pacific.
    expect(inferTimezoneFromVenue("A lodge in Washington")).toEqual({
      timezone: "America/Los_Angeles",
      confidence: "high",
      matched: "Washington",
    });
  });

  it("uses the city table to disambiguate a split-timezone state", () => {
    const cases: [string, string, string][] = [
      ["Portland, OR", "America/Los_Angeles", "Portland"],
      ["Portland, Oregon", "America/Los_Angeles", "Portland"],
      ["Miami, FL", "America/New_York", "Miami"],
      ["Pensacola, FL", "America/Chicago", "Pensacola"],
      ["Memphis, TN", "America/Chicago", "Memphis"],
      ["Knoxville, TN", "America/New_York", "Knoxville"],
      ["Rapid City, SD", "America/Denver", "Rapid City"],
      // Kansas City straddles the KS/MO line; both sides are Central.
      ["Kansas City, MO", "America/Chicago", "Kansas City"],
    ];
    for (const [venue, timezone, matched] of cases) {
      expect(inferTimezoneFromVenue(venue)).toEqual({ timezone, confidence: "high", matched });
    }
  });

  it("falls back to the city table alone when no state or region is named", () => {
    expect(inferTimezoneFromVenue("Phoenix")).toEqual({
      timezone: "America/Phoenix",
      confidence: "high",
      matched: "Phoenix",
    });
    expect(inferTimezoneFromVenue("Miami")).toEqual({
      timezone: "America/New_York",
      confidence: "high",
      matched: "Miami",
    });
  });

  it("stays low confidence when an ambiguous region has no disambiguating city", () => {
    expect(inferTimezoneFromVenue("A wedding barn in Oregon")).toEqual({
      timezone: null,
      confidence: "low",
      matched: "Oregon",
    });
    expect(inferTimezoneFromVenue("A ranch in Nebraska")).toEqual({
      timezone: null,
      confidence: "low",
      matched: "Nebraska",
    });
  });

  it("resolves Toronto inside otherwise-ambiguous Ontario", () => {
    for (const venue of ["Toronto, Ontario", "Toronto, ON", "Toronto"]) {
      expect(inferTimezoneFromVenue(venue)).toEqual({
        timezone: "America/Toronto",
        confidence: "high",
        matched: "Toronto",
      });
    }
    // The province on its own still has no single zone.
    expect(inferTimezoneFromVenue("A cabin in Ontario, Canada")).toEqual({
      timezone: null,
      confidence: "low",
      matched: "Ontario",
    });
  });

  it("does not let a split-zone country outrank a city inside it", () => {
    const cases: [string, string, string][] = [
      ["Sydney, Australia", "Australia/Sydney", "Sydney"],
      ["Perth, Australia", "Australia/Perth", "Perth"],
      ["Brisbane, Australia", "Australia/Brisbane", "Brisbane"],
      ["Melbourne, Australia", "Australia/Melbourne", "Melbourne"],
      ["Toronto, Canada", "America/Toronto", "Toronto"],
      ["Vancouver, Canada", "America/Vancouver", "Vancouver"],
      ["Montreal, Canada", "America/Toronto", "Montreal"],
      ["Sao Paulo, Brazil", "America/Sao_Paulo", "Sao Paulo"],
    ];
    for (const [venue, timezone, matched] of cases) {
      expect(inferTimezoneFromVenue(venue)).toEqual({ timezone, confidence: "high", matched });
    }
    // The city still stands on its own with no country named.
    expect(inferTimezoneFromVenue("An opera house in Sydney")).toEqual({
      timezone: "Australia/Sydney",
      confidence: "high",
      matched: "Sydney",
    });
  });

  it("still returns no zone for a split-zone country named on its own", () => {
    const cases: [string, string][] = [
      ["A beach wedding in Australia", "Australia"],
      ["A lodge somewhere in Canada", "Canada"],
      ["A rooftop in Brazil", "Brazil"],
      ["A hall in the United States", "United States"],
    ];
    for (const [venue, matched] of cases) {
      expect(inferTimezoneFromVenue(venue)).toEqual({ timezone: null, confidence: "low", matched });
    }
  });

  it("prefers a named region to a same-named city in a country tier below it", () => {
    // Sydney, Nova Scotia is a real place, and the province is named, so Australia's
    // Sydney must not win.
    expect(inferTimezoneFromVenue("Sydney, Nova Scotia")).toEqual({
      timezone: "America/Halifax",
      confidence: "high",
      matched: "Nova Scotia",
    });
  });

  it("does not read an all-caps English word as a state or country code", () => {
    // All-caps venue text is ordinary, and IN, LA, OK, ME, HI and US are English words.
    // Reading one as a code produced a high-confidence wrong zone, which is written
    // straight to the event's stored timezone.
    for (const venue of [
      "DINNER IN LA",
      "THE LOFT IN DOWNTOWN SEATTLE",
      "JOIN US OK",
      "CALL ME FOR THE ADDRESS",
      "ALOHA HI EVERYONE",
    ]) {
      expect(inferTimezoneFromVenue(venue)).toEqual({
        timezone: null,
        confidence: "none",
        matched: null,
      });
    }
  });

  it("reads a code after a comma or immediately before a postal code", () => {
    expect(inferTimezoneFromVenue("Austin TX 78701")).toEqual({
      timezone: "America/Chicago",
      confidence: "high",
      matched: "Texas",
    });
    expect(inferTimezoneFromVenue("Toronto ON M5V 2T6")).toEqual({
      timezone: "America/Toronto",
      confidence: "high",
      matched: "Toronto",
    });
    // With neither signal nothing separates a code from an ordinary word, so the text
    // resolves to nothing rather than to a guess.
    expect(inferTimezoneFromVenue("Austin TX")).toEqual({
      timezone: null,
      confidence: "none",
      matched: null,
    });
  });

  it("refuses to choose between two codes of the same length that disagree", () => {
    expect(inferTimezoneFromVenue("Texarkana, TX, AR")).toEqual({
      timezone: null,
      confidence: "none",
      matched: null,
    });
  });

  it("does not match a substring inside an unrelated word (word-boundary safe)", () => {
    // "in" (Indiana's abbreviation) must not match inside "Kingston" or "Increase".
    const result = inferTimezoneFromVenue("Kingston Hall, Increase Ave");
    expect(result.confidence).toBe("none");
  });
});

describe("validateTimezone", () => {
  it("accepts a real IANA zone", () => {
    expect(validateTimezone("America/New_York")).toBe(true);
    expect(validateTimezone("Asia/Kolkata")).toBe(true);
  });

  it("rejects an invalid zone", () => {
    expect(validateTimezone("Not/AZone")).toBe(false);
  });

  it("rejects null/undefined/empty", () => {
    expect(validateTimezone(null)).toBe(false);
    expect(validateTimezone(undefined)).toBe(false);
    expect(validateTimezone("")).toBe(false);
  });
});

describe("resolveEventTimezone", () => {
  it("prefers a high-confidence venue inference over the browser timezone", () => {
    const result = resolveEventTimezone({
      venueText: "A hall in Austin, Texas",
      browserTimezone: "America/Los_Angeles",
    });
    expect(result).toBe("America/Chicago");
  });

  it("falls back to a valid browser timezone when venue inference is low/none", () => {
    const result = resolveEventTimezone({
      venueText: "A backyard in Michigan",
      browserTimezone: "America/Los_Angeles",
    });
    expect(result).toBe("America/Los_Angeles");
  });

  it("returns null (ask) when neither source resolves", () => {
    const result = resolveEventTimezone({ venueText: null, browserTimezone: "Not/AZone" });
    expect(result).toBeNull();
  });

  it("returns null (ask) when both venue and browser timezone are unavailable", () => {
    const result = resolveEventTimezone({ venueText: null, browserTimezone: null });
    expect(result).toBeNull();
  });
});
