/**
 * A small RFC 4180 CSV reader for the guest import (`spec.md §12.1` "CSV import"). Pure and
 * dependency-free, so the browser's preview and the server's import read a file identically; the
 * server always re-reads the text it is sent and never trusts the browser's reading.
 *
 * - fields are separated by commas and records by CRLF, LF or a lone CR;
 * - a field in double quotes may hold commas, line breaks and `""` (one quote);
 * - a leading byte-order mark is dropped;
 * - a final line break does not make an empty record.
 *
 * Lenient where spreadsheets are sloppy: text after a closing quote is kept as part of the field,
 * and a quote inside an unquoted field is an ordinary character. A quoted field still open at the
 * end of the text is an error, since everything after its opening quote would otherwise be one
 * field.
 */

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  // Whether the current record has begun (so a trailing line break makes no empty record).
  let started = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
    started = false;
  };

  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
      started = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      endField();
      started = true;
      i += 1;
      continue;
    }
    if (c === "\r" || c === "\n") {
      endRecord();
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += c;
    started = true;
    i += 1;
  }
  if (quoted) throw new CsvError("A quoted value is never closed.");
  if (started) endRecord();
  return records;
}
