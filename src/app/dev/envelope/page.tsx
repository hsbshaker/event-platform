import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EnvelopeFixture } from "./EnvelopeFixture";

/**
 * Development-only fixture for the envelope browser test. 404 unless ENABLE_DEV_FIXTURES=1,
 * read at request time so a production build never exposes it by accident.
 */
export default async function EnvelopeFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  return (
    <EnvelopeFixture
      proportion={one("proportion") === "square" ? "square" : "portrait"}
      sealed={one("sealed") === "1"}
      failFirst={one("failFirst") === "1"}
      delayMs={Number(one("delay")) || 0}
    />
  );
}
