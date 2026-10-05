import { CsvError, parseCsv } from "./csv";
import { cleanName, deriveDisplayName, type NamedGuest } from "./display-name";
import { CSV_MAX_BYTES, CSV_MAX_ROWS, DISPLAY_NAME_MAX, GUEST_NAME_MAX } from "./limits";
import { normalizeEmail } from "./party";
import { normalizePhone } from "./phone";

/**
 * Turns a guest-list CSV into parties (`spec.md §12.1`, §12.2: "CSV import must not reject the
 * entire file because individual rows lack a phone. Import valid party data and flag
 * missing-phone parties as Needs phone"; §32 #35). Pure: the browser runs it for the preview, and
 * the server runs it again on the text it receives before anything is stored.
 *
 * Columns are matched by header, ignoring case, spacing and underscores:
 *
 * - **Name** — `name`, `guest`, `guest name`, `full name`; or `first name` with `last name`.
 *   Required: a file without one is refused, naming the columns it has.
 * - **Household** — `household`, `party`, `group`, `family`. Rows with the same value (ignoring
 *   case and spacing) are one party, named by it; a blank one makes the row its own party.
 * - **Phone** — `phone`, `mobile`, `cell`, `phone number`.
 * - **Email** — `email`, `e-mail`.
 * - **Child** and **Plus one** — `child`, `kid`, `is child`; `plus one`, `plus-one`, `+1`. Yes
 *   when the cell says yes, y, true, 1 or x.
 *
 * A party's phone is its first row's recognized phone and its email its first valid one; it may
 * bring a plus-one when any of its rows says so. Its main contact is its first adult (a party of
 * children only has its first row as the contact, counted as an adult). Rows without a name are
 * skipped; phones and emails we cannot use are left out. Each of those is reported by its row
 * number, counting the header as row 1. Nothing is matched against parties already on the list:
 * families share numbers.
 */

export interface PlannedParty {
  displayName: string;
  phone: string | null;
  email: string | null;
  plusOneAllowed: boolean;
  /** The main contact first, then the rest in file order. */
  people: NamedGuest[];
  /** The rows it came from. */
  rows: number[];
}

export interface ImportIssue {
  row: number;
  message: string;
}

export type ImportPlan =
  | {
      ok: true;
      parties: PlannedParty[];
      /** Named guests across the parties. */
      people: number;
      /** Parties that will need a phone. */
      needPhone: number;
      issues: ImportIssue[];
    }
  | { ok: false; error: string };

type Column = "name" | "first" | "last" | "household" | "phone" | "email" | "child" | "plusOne";

const ALIASES: Record<string, Column> = {
  name: "name",
  guest: "name",
  "guest name": "name",
  "full name": "name",
  "first name": "first",
  "last name": "last",
  household: "household",
  party: "household",
  group: "household",
  family: "household",
  phone: "phone",
  mobile: "phone",
  cell: "phone",
  "phone number": "phone",
  email: "email",
  "e-mail": "email",
  child: "child",
  kid: "child",
  "is child": "child",
  "plus one": "plusOne",
  "plus-one": "plusOne",
  "+1": "plusOne",
};

const TRUTHY = new Set(["yes", "y", "true", "1", "x"]);

/** The columns a sample file has, for "Download a sample CSV". */
export const SAMPLE_CSV =
  "Name,Household,Phone,Email,Child,Plus one\r\n" +
  "Guest One,Household One,(555) 201-0001,guest.one@example.com,,yes\r\n" +
  "Guest Two,Household One,,,yes,\r\n";

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function truthy(value: string | undefined): boolean {
  return value !== undefined && TRUTHY.has(value.trim().toLowerCase());
}

function quote(value: string): string {
  const v = value.trim();
  return `“${v.length > 40 ? `${v.slice(0, 40)}…` : v}”`;
}

const COUNT = new Intl.NumberFormat("en-US");

export function planImport(text: string): ImportPlan {
  if (new TextEncoder().encode(text).length > CSV_MAX_BYTES) {
    return { ok: false, error: "This file is larger than 1 MB. Split it into smaller files." };
  }
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (error) {
    if (error instanceof CsvError) {
      return {
        ok: false,
        error:
          "We couldn't read this file: a quoted value is never closed. Check it and try again.",
      };
    }
    throw error;
  }
  const blank = (record: string[]) => record.every((cell) => cell.trim() === "");
  const headerIndex = records.findIndex((record) => !blank(record));
  if (headerIndex === -1) {
    return { ok: false, error: "This file is empty. Add a header row and your guests." };
  }
  const header = records[headerIndex];

  const at: Partial<Record<Column, number>> = {};
  header.forEach((cell, index) => {
    const column = ALIASES[headerKey(cell)];
    if (column && at[column] === undefined) at[column] = index;
  });
  if (at.name === undefined && at.first === undefined) {
    const read = header.map((cell) => cell.trim()).filter(Boolean);
    return {
      ok: false,
      error:
        `We need a Name column (or First name and Last name). ` +
        `The columns we read are: ${read.join(", ")}.`,
    };
  }

  const rows = records
    .map((cells, index) => ({ cells, row: index + 1 }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => !blank(cells));
  if (rows.length > CSV_MAX_ROWS) {
    return {
      ok: false,
      error: `This file has more than ${COUNT.format(CSV_MAX_ROWS)} rows. Split it into smaller files.`,
    };
  }

  const cell = (cells: string[], column: Column) => {
    const index = at[column];
    return index === undefined ? "" : (cells[index] ?? "");
  };

  const issues: ImportIssue[] = [];
  type Draft = {
    household: string | null;
    rows: {
      row: number;
      name: string;
      child: boolean;
      phone: string;
      email: string;
      plusOne: boolean;
    }[];
  };
  const groups: Draft[] = [];
  const byHousehold = new Map<string, Draft>();

  for (const { cells, row } of rows) {
    const name =
      at.name !== undefined
        ? cleanName(cell(cells, "name"))
        : cleanName(`${cell(cells, "first")} ${cell(cells, "last")}`);
    if (name === "") {
      issues.push({ row, message: `Row ${row}: no name, so it was skipped.` });
      continue;
    }
    if (name.length > GUEST_NAME_MAX) {
      issues.push({
        row,
        message: `Row ${row}: the name is longer than ${GUEST_NAME_MAX} characters, so it was skipped.`,
      });
      continue;
    }
    const entry = {
      row,
      name,
      child: truthy(cell(cells, "child")),
      phone: cell(cells, "phone"),
      email: cell(cells, "email"),
      plusOne: truthy(cell(cells, "plusOne")),
    };
    const household = cleanName(cell(cells, "household"));
    if (household === "") {
      groups.push({ household: null, rows: [entry] });
      continue;
    }
    const key = household.toLowerCase();
    let group = byHousehold.get(key);
    if (!group) {
      group = { household, rows: [] };
      byHousehold.set(key, group);
      groups.push(group);
    }
    group.rows.push(entry);
  }

  const parties: PlannedParty[] = groups.map((group) => {
    let phone: string | null = null;
    let email: string | null = null;
    for (const entry of group.rows) {
      if (entry.phone.trim() !== "") {
        const normalized = normalizePhone(entry.phone);
        if (!normalized) {
          issues.push({
            row: entry.row,
            message: `Row ${entry.row}: ${quote(entry.phone)} isn't a US or Canadian mobile number, so it was left out.`,
          });
        } else {
          phone ??= normalized;
        }
      }
      if (entry.email.trim() !== "") {
        const normalized = normalizeEmail(entry.email);
        if (normalized === false) {
          issues.push({
            row: entry.row,
            message: `Row ${entry.row}: ${quote(entry.email)} isn't an email address, so it was left out.`,
          });
        } else if (normalized) {
          email ??= normalized;
        }
      }
    }

    const adultIndex = group.rows.findIndex((entry) => !entry.child);
    const mainIndex = adultIndex === -1 ? 0 : adultIndex;
    if (adultIndex === -1) {
      const main = group.rows[0];
      issues.push({
        row: main.row,
        message: `Row ${main.row}: ${main.name} is the only contact for a party of children, so they're counted as an adult.`,
      });
    }
    const ordered = [group.rows[mainIndex], ...group.rows.filter((_, i) => i !== mainIndex)];
    const people: NamedGuest[] = ordered.map((entry, i) => ({
      name: entry.name,
      type: i === 0 ? "adult" : entry.child ? "child" : "adult",
    }));

    let displayName = group.household ?? "";
    if (displayName.length > DISPLAY_NAME_MAX) {
      issues.push({
        row: group.rows[0].row,
        message: `Row ${group.rows[0].row}: the household name is longer than ${DISPLAY_NAME_MAX} characters, so the guests' names are used instead.`,
      });
      displayName = "";
    }
    return {
      displayName: displayName || deriveDisplayName(people),
      phone,
      email,
      plusOneAllowed: group.rows.some((entry) => entry.plusOne),
      people,
      rows: group.rows.map((entry) => entry.row),
    };
  });

  issues.sort((a, b) => a.row - b.row);
  return {
    ok: true,
    parties,
    people: parties.reduce((sum, party) => sum + party.people.length, 0),
    needPhone: parties.filter((party) => party.phone === null).length,
    issues,
  };
}
