import { describe, expect, it } from "vitest";

import { allRows } from "./guests.server";

/**
 * Reading a guest list never drops rows: `allRows` pages until an empty page, however many rows a
 * response is capped at (a project's PostgREST `max_rows` may sit below the page size asked for).
 */

function source(total: number, cap: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { page, calls };
}

describe("allRows", () => {
  it("reads more than one full page", async () => {
    const { page } = source(1001, 1000);
    expect(await allRows(page)).toHaveLength(1001);
  });

  it("reads every row when the server caps responses below the page size", async () => {
    const { page, calls } = source(2500, 400);
    const rows = await allRows(page);
    expect(rows).toEqual(Array.from({ length: 2500 }, (_, i) => i));
    // Each request starts where the last one ended.
    expect(calls.map(([from]) => from).slice(0, 3)).toEqual([0, 400, 800]);
  });

  it("returns nothing for an empty list, and throws a read error", async () => {
    expect(await allRows(source(0, 1000).page)).toEqual([]);
    await expect(
      allRows(async () => ({ data: null, error: { message: "unavailable" } })),
    ).rejects.toMatchObject({ message: "unavailable" });
  });
});
