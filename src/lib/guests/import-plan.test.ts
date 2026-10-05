import { describe, expect, it } from "vitest";

import { CSV_MAX_ROWS } from "./limits";
import { SAMPLE_CSV, decodeCsv, planImport, type ImportPlan } from "./import-plan";

/**
 * The guest import's grouping (`spec.md §12.1`, §12.2; `spec.md §31` — RSVP: "CSV with missing
 * phone rows imports and flags Needs phone."; §32 #35).
 */

function ok(plan: ImportPlan) {
  if (!plan.ok) throw new Error(`expected a plan, got: ${plan.error}`);
  return plan;
}

describe("planImport", () => {
  it("imports rows without a phone as parties that need one", () => {
    const plan = ok(
      planImport("Name,Phone\r\nAna Garcia,512-555-0123\r\nLuis Diaz,\r\nMia Chen,\r\n"),
    );
    expect(plan.parties.map((p) => [p.displayName, p.phone])).toEqual([
      ["Ana Garcia", "+15125550123"],
      ["Luis Diaz", null],
      ["Mia Chen", null],
    ]);
    expect(plan.needPhone).toBe(2);
    expect(plan.people).toBe(3);
    expect(plan.issues).toEqual([]);
  });

  it("groups rows by household, ignoring case and spacing, named by its first spelling", () => {
    const plan = ok(
      planImport(
        [
          "Guest Name,Household,Mobile,E-mail,Kid,Plus-One",
          "Ana Garcia,The Garcias,,ANA@Example.com ,,",
          "Luis Garcia, the  garcias ,(416) 555-0199,,,",
          "Mia Garcia,THE GARCIAS,,,yes,",
          "Sam Lee,,,,,x",
          "Jo Park,Parks,,,,",
        ].join("\n"),
      ),
    );
    expect(plan.parties).toHaveLength(3);
    const [garcias, lee, park] = plan.parties;
    expect(garcias).toEqual({
      displayName: "The Garcias",
      phone: "+14165550199",
      email: "ana@example.com",
      plusOneAllowed: false,
      people: [
        { name: "Ana Garcia", type: "adult" },
        { name: "Luis Garcia", type: "adult" },
        { name: "Mia Garcia", type: "child" },
      ],
      rows: [2, 3, 4],
    });
    expect(lee).toMatchObject({ displayName: "Sam Lee", plusOneAllowed: true, rows: [5] });
    expect(park).toMatchObject({ displayName: "Parks", rows: [6] });
  });

  it("gives each row with a blank household its own party", () => {
    const plan = ok(planImport("name,household\nAna Garcia,\nLuis Garcia,  \n"));
    expect(plan.parties.map((p) => p.displayName)).toEqual(["Ana Garcia", "Luis Garcia"]);
  });

  it("derives the name on the invitation when there is no household column", () => {
    const plan = ok(planImport("First Name,Last_Name\nAna,Garcia\n"));
    expect(plan.parties[0].displayName).toBe("Ana Garcia");
    expect(plan.parties[0].people).toEqual([{ name: "Ana Garcia", type: "adult" }]);
  });

  it("makes the first adult the main contact, and the first child of a children-only party an adult", () => {
    const plan = ok(
      planImport(
        [
          "name,family,child",
          "Mia Garcia,G,yes",
          "Ana Garcia,G,",
          "Leo Diaz,D,true",
          "Ivy Diaz,D,1",
        ].join("\n"),
      ),
    );
    expect(plan.parties[0].people).toEqual([
      { name: "Ana Garcia", type: "adult" },
      { name: "Mia Garcia", type: "child" },
    ]);
    expect(plan.parties[1].people).toEqual([
      { name: "Leo Diaz", type: "adult" },
      { name: "Ivy Diaz", type: "child" },
    ]);
    expect(plan.issues).toEqual([
      {
        row: 4,
        message:
          "Row 4: Leo Diaz is the only contact for a party of children, so they're counted as an adult.",
      },
    ]);
  });

  it("uses a party's first recognized phone and reports the ones it leaves out", () => {
    const plan = ok(
      planImport(
        [
          "name,group,cell",
          "Ana Garcia,G,555-12",
          "Luis Garcia,G,512 555 0123",
          "Mia Chen,,+44 20 7946 0958",
        ].join("\n"),
      ),
    );
    expect(plan.parties.map((p) => p.phone)).toEqual(["+15125550123", null]);
    expect(plan.needPhone).toBe(1);
    expect(plan.issues.map((i) => i.row)).toEqual([2, 4]);
    expect(plan.issues[0].message).toBe(
      "Row 2: “555-12” isn't a US or Canadian mobile number, so it was left out.",
    );
  });

  it("skips rows without a name, leaves out bad emails, and ignores blank rows", () => {
    const plan = ok(planImport("name,email\n,a@example.com\n\nAna Garcia,not-an-email\n,,\n"));
    expect(plan.parties).toHaveLength(1);
    expect(plan.parties[0].email).toBeNull();
    expect(plan.issues).toEqual([
      { row: 2, message: "Row 2: no name, so it was skipped." },
      { row: 4, message: "Row 4: “not-an-email” isn't an email address, so it was left out." },
    ]);
  });

  it("reads quotes, commas and line breaks inside fields, CRLF and a byte-order mark", () => {
    const plan = ok(
      planImport('﻿Name,Household\r\n"Garcia, Ana","The ""Big"" Garcias"\r\n"Luis\r\nGarcia",\r\n'),
    );
    expect(plan.parties.map((p) => p.displayName)).toEqual(['The "Big" Garcias', "Luis Garcia"]);
    expect(plan.parties[0].people[0].name).toBe("Garcia, Ana");
  });

  it("refuses a file without a name column, naming the columns it read", () => {
    const plan = planImport("Who,Phone Number\nAna,5125550123\n");
    expect(plan).toEqual({
      ok: false,
      error:
        "We need a Name column (or First name and Last name). The columns we read are: Who, Phone Number.",
    });
  });

  it("refuses an empty file, an unclosed quote, too many rows and too many bytes", () => {
    expect(planImport("").ok).toBe(false);
    expect(planImport("\n\n").ok).toBe(false);
    expect(planImport('name\n"Ana').ok).toBe(false);
    const rows = Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) => `Guest ${i}`).join("\n");
    const tooMany = planImport(`name\n${rows}`);
    expect(tooMany).toEqual({
      ok: false,
      error: "This file has more than 2,000 rows. Split it into smaller files.",
    });
    expect(ok(planImport(`name\n${rows.split("\n").slice(1).join("\n")}`)).parties).toHaveLength(
      CSV_MAX_ROWS,
    );
    expect(planImport(`name\n${"a".repeat(1024 * 1024)}`).ok).toBe(false);
  });

  it("reads its own sample file", () => {
    const plan = ok(planImport(SAMPLE_CSV));
    expect(plan.parties).toEqual([
      {
        displayName: "Household One",
        phone: "+15552010001",
        email: "guest.one@example.com",
        plusOneAllowed: true,
        people: [
          { name: "Guest One", type: "adult" },
          { name: "Guest Two", type: "child" },
        ],
        rows: [2, 3],
      },
    ]);
  });
});

describe("planImport — columns and encodings", () => {
  it("names the columns it did not read, so a phone column under another name is not lost", () => {
    const plan = ok(planImport("Name,Phone #,Notes\r\nAna Garcia,512-555-0123,Vegetarian\r\n"));
    expect(plan.ignoredColumns).toEqual(["Phone #", "Notes"]);
    expect(plan.needPhone).toBe(1);
  });

  it("reads the phone and email headers spreadsheets commonly use", () => {
    const plan = ok(
      planImport("Name,Cell Phone,Email Address\r\nAna Garcia,512-555-0123,ana@example.com\r\n"),
    );
    expect(plan.ignoredColumns).toEqual([]);
    expect(plan.parties[0]).toMatchObject({ phone: "+15125550123", email: "ana@example.com" });
  });

  it("refuses text with characters that could not be read rather than storing them", () => {
    expect(planImport("Name\r\nGarc�a\r\n")).toMatchObject({
      ok: false,
      error: expect.stringContaining("Save it as CSV UTF-8"),
    });
  });
});

describe("decodeCsv", () => {
  it("reads UTF-8", () => {
    expect(decodeCsv(new TextEncoder().encode("Name\nGarcía\n"))).toBe("Name\nGarcía\n");
  });

  it("reads a Windows-1252 file, as Excel on Windows saves CSV", () => {
    // "García" in Windows-1252: í is 0xED, which is not valid UTF-8 on its own.
    const bytes = new Uint8Array([
      0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x47, 0x61, 0x72, 0x63, 0xed, 0x61,
    ]);
    const text = decodeCsv(bytes);
    expect(text).toBe("Name\nGarcía");
    expect(ok(planImport(text)).parties[0].people[0].name).toBe("García");
  });
});
