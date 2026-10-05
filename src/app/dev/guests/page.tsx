import { notFound } from "next/navigation";
import { connection } from "next/server";

import { GuestsFixture } from "./GuestsFixture";

/**
 * Development-only fixture for the guest workspace (`docs/screen-spec.md` `guests-workspace`), no
 * database. 404 unless ENABLE_DEV_FIXTURES=1, read at request time.
 *
 * - `?data=some|empty` (default `some`): three parties (Ready, Needs phone, No phone available),
 *   or none;
 * - `&published=1`: published, so each party has `Copy personal link` and `Rotate link`.
 *
 * `Close` goes back to the Creation Mode fixture with the same `published`.
 */
export default async function GuestsFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const published = one("published") === "1";
  return (
    <GuestsFixture
      data={one("data") === "empty" ? "empty" : "some"}
      published={published}
      closeHref={`/dev/creation${published ? "?published=1" : ""}`}
    />
  );
}
