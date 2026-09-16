import { afterEach, describe, expect, it } from "vitest";

import { databaseUrl } from "../db/harness";

/**
 * The test harness may only ever point at a scratch database.
 *
 * `tests/db` drops `public`, `auth` and `extensions` before every run. Against a real project that
 * destroys every table, every row and every auth user, with no undo — and for most of this
 * repository's life nothing checked. A connection string for a live database put into
 * `TEST_DATABASE_URL` would have been accepted in silence.
 *
 * These cases are the shapes that actually turn up: the Supabase direct host, both poolers, and a
 * plain remote. Each one is a database somebody cares about.
 */

const ORIGINAL = process.env.TEST_DATABASE_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = ORIGINAL;
});

describe("the db harness refuses anything but loopback", () => {
  it.each([
    ["a Supabase direct host", "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres"],
    [
      "a Supabase session pooler",
      "postgresql://postgres.abcdefgh:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    ],
    [
      "a Supabase transaction pooler",
      "postgresql://postgres.abcdefgh:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    ],
    ["a plain remote host", "postgres://user:pw@db.example.com:5432/app"],
    ["a private network address", "postgres://user:pw@10.0.0.5:5432/app"],
    // The host is what matters, not what the userinfo happens to spell.
    ["localhost hidden in the username", "postgres://localhost:pw@db.example.com:5432/app"],
  ])("refuses %s", (_label, url) => {
    process.env.TEST_DATABASE_URL = url;
    expect(() => databaseUrl()).toThrow(/refuses to run against/);
  });

  it.each([
    ["127.0.0.1", "postgres://postgres:postgres@127.0.0.1:54322/postgres"],
    ["localhost", "postgres://postgres:postgres@localhost:54322/postgres"],
    ["another 127/8 address", "postgres://postgres:postgres@127.0.0.2:54322/postgres"],
    ["IPv6 loopback", "postgres://postgres:postgres@[::1]:54322/postgres"],
  ])("allows %s", (_label, url) => {
    process.env.TEST_DATABASE_URL = url;
    expect(databaseUrl()).toBe(url);
  });

  it("still requires the variable at all", () => {
    delete process.env.TEST_DATABASE_URL;
    expect(() => databaseUrl()).toThrow(/TEST_DATABASE_URL is required/);
  });

  it("refuses a value that is not a URL rather than passing it through", () => {
    process.env.TEST_DATABASE_URL = "not a url";
    expect(() => databaseUrl()).toThrow(/not a valid URL/);
  });

  it("names the right alternative, so the error is actionable", () => {
    process.env.TEST_DATABASE_URL = "postgres://u:p@db.abcdefgh.supabase.co:5432/postgres";
    expect(() => databaseUrl()).toThrow(/apply supabase\/migrations directly/);
  });
});
