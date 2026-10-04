import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

/**
 * The link-preview development fixture (`docs/card-system.md §6.4`): off unless
 * ENABLE_DEV_FIXTURES=1, and then a PNG of the card or the sealed envelope from fixture data.
 */

const request = (query: string) =>
  new NextRequest(`http://localhost/dev/link-preview${query ? `?${query}` : ""}`);

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_HTTP_ERROR_FALLBACK;404")
  );
}

/** PNG width and height from its header. */
function pngSize(bytes: Uint8Array): [number, number] {
  const view = Buffer.from(bytes);
  expect(view.subarray(1, 4).toString("latin1")).toBe("PNG");
  return [view.readUInt32BE(16), view.readUInt32BE(20)];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /dev/link-preview", () => {
  it("is not found unless dev fixtures are enabled", async () => {
    for (const value of [undefined, "", "0", "true"]) {
      vi.stubEnv("ENABLE_DEV_FIXTURES", value);
      const error = await GET(request("kind=envelope")).catch((e: unknown) => e);
      expect(isNotFound(error), String(value)).toBe(true);
    }
  });

  it("renders a public event's card as a 1200 × 630 PNG", async () => {
    vi.stubEnv("ENABLE_DEV_FIXTURES", "1");
    for (const query of [
      "kind=card&layout=art-top&shape=arch&pairing=hc_playfair_dmsans",
      "kind=card&layout=framed&shape=circle&pairing=soft_fraunces_manrope&panel=1",
    ]) {
      const response = await GET(request(query));
      expect(response.status, query).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("server-timing")).toMatch(/^preview;dur=\d/);
      expect(pngSize(new Uint8Array(await response.arrayBuffer()))).toEqual([1200, 630]);
    }
  }, 30_000);

  it("renders a private event's sealed envelope", async () => {
    vi.stubEnv("ENABLE_DEV_FIXTURES", "1");
    const response = await GET(request("kind=envelope&title=Garden%20Supper"));
    expect(response.status).toBe(200);
    expect(pngSize(new Uint8Array(await response.arrayBuffer()))).toEqual([1200, 630]);
  }, 30_000);

  it("refuses a title it cannot draw as unprocessable, not as a server error", async () => {
    vi.stubEnv("ENABLE_DEV_FIXTURES", "1");
    const response = await GET(request(`kind=envelope&title=${encodeURIComponent("Party 🎉")}`));
    expect(response.status).toBe(422);
  });

  it("refuses unknown fixture parameters", async () => {
    vi.stubEnv("ENABLE_DEV_FIXTURES", "1");
    for (const query of [
      "kind=poster",
      "kind=card&layout=nope",
      "kind=card&shape=hexagon",
      "kind=card&pairing=comic",
      "kind=card&layout=corners&shape=arch",
      `kind=envelope&title=${"x".repeat(201)}`,
    ]) {
      expect((await GET(request(query))).status, query).toBe(400);
    }
  });
});
