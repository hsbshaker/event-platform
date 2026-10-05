import { describe, expect, it } from "vitest";

import { CsvError, parseCsv } from "./csv";

/** The guest import's CSV reader (RFC 4180), shared by the browser preview and the server. */

describe("parseCsv", () => {
  it("reads plain records", () => {
    expect(parseCsv("name,phone\nAna,512\nLuis,416\n")).toEqual([
      ["name", "phone"],
      ["Ana", "512"],
      ["Luis", "416"],
    ]);
  });

  it("reads CRLF, LF and lone CR line breaks, with or without a final one", () => {
    expect(parseCsv("a,b\r\nc,d\re,f\ng,h")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
      ["g", "h"],
    ]);
    expect(parseCsv("a,b\r\n")).toEqual([["a", "b"]]);
  });

  it("drops a byte-order mark", () => {
    const rows = parseCsv("﻿Name,Phone\nAna,1");
    expect(rows[0]).toEqual(["Name", "Phone"]);
  });

  it("keeps commas, line breaks and escaped quotes inside quotes", () => {
    expect(
      parseCsv('name,notes\n"Garcia, Ana","Line one\r\nline two"\n"Ana ""Nana"" Diaz",x'),
    ).toEqual([
      ["name", "notes"],
      ["Garcia, Ana", "Line one\r\nline two"],
      ['Ana "Nana" Diaz', "x"],
    ]);
  });

  it("keeps empty fields and blank records", () => {
    expect(parseCsv("a,,c\n\n,,\n")).toEqual([["a", "", "c"], [""], ["", "", ""]]);
    expect(parseCsv('""')).toEqual([[""]]);
  });

  it("is lenient where spreadsheets are sloppy", () => {
    // Text after a closing quote stays in the field; a quote mid-field is a character.
    expect(parseCsv('"Ana" Garcia,5"10')).toEqual([["Ana Garcia", '5"10']]);
  });

  it("refuses a quoted value that never closes", () => {
    expect(() => parseCsv('name\n"Ana, 512')).toThrow(CsvError);
  });

  it("reads nothing from an empty text", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("﻿")).toEqual([]);
  });
});
