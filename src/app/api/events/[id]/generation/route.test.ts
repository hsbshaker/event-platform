import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { COPYRIGHT_STEP_BACK_NOTICE, generationFailure } from "@/lib/generation/failure-copy";
import type { GenerationView } from "@/lib/generation/status.server";

/**
 * The wait surface's poll (`spec.md §7.10`, §27, §32 #42): owner and co-host only, the same plain
 * 404 for everyone else and for a malformed id, never cached, the host-facing failure when the
 * generation failed and the step-back note while it runs.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";

const view = vi.hoisted(() => vi.fn());
vi.mock("@/lib/generation/status.server", () => ({
  getGenerationView: (...args: unknown[]) => view(...args),
}));

const { GET } = await import("./route");

function generation(overrides: Partial<GenerationView> = {}): GenerationView {
  return {
    id: "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d",
    kind: "initial",
    status: "running",
    stage: "identity",
    artifacts: { identity: { creativeDirection: "A lemon grove" } },
    errorCode: null,
    cardDesignId: null,
    startedAt: "2026-10-05T12:00:00Z",
    ...overrides,
  };
}

async function get(id: string = EVENT, query = "") {
  const response = await GET(
    new NextRequest(`https://app.test/api/events/${id}/generation${query}`),
    { params: Promise.resolve({ id }) },
  );
  return { response, body: await response.json() };
}

beforeEach(() => {
  view.mockReset();
});

describe("GET /api/events/[id]/generation", () => {
  it("returns the latest generation's view, uncached", async () => {
    view.mockResolvedValue(generation());
    const { response, body } = await get();
    expect(view).toHaveBeenCalledWith(EVENT, {});
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ generation: { ...generation(), failure: null, notice: null } });
  });

  it("reads the generation a surface is waiting for, by id, else the latest", async () => {
    view.mockResolvedValue(generation());
    const asked = "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d";
    await get(EVENT, `?generation=${asked}`);
    expect(view).toHaveBeenLastCalledWith(EVENT, { generationId: asked });
    await get(EVENT);
    expect(view).toHaveBeenLastCalledWith(EVENT, {});
    // A malformed id reads as not found, before any read.
    view.mockClear();
    const { response } = await get(EVENT, "?generation=nope");
    expect(response.status).toBe(404);
    expect(view).not.toHaveBeenCalled();
  });

  it("returns null before the first generation", async () => {
    view.mockResolvedValue(null);
    const { response, body } = await get();
    expect(response.status).toBe(200);
    expect(body).toEqual({ generation: null });
  });

  it("answers the same plain 404 for a signed-out viewer, a non-member and a malformed id", async () => {
    const answers = [];
    for (const error of [new UnauthorizedError(), new ForbiddenError()]) {
      view.mockRejectedValueOnce(error);
      answers.push(await get());
    }
    answers.push(await get("not-an-event"));
    for (const { response, body } of answers) {
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body).toEqual({ error: "Not found" });
    }
    // A malformed id never reaches the database.
    expect(view).toHaveBeenCalledTimes(2);
  });

  it("lets any other error surface as a server error", async () => {
    view.mockRejectedValue(new Error("database down"));
    await expect(get()).rejects.toThrow("database down");
  });

  it("adds the host-facing failure when the generation failed", async () => {
    view.mockResolvedValue(generation({ status: "failed", errorCode: "artwork_invalid" }));
    const { body } = await get();
    expect(body.generation.failure).toEqual(generationFailure("artwork_invalid"));
    expect(body.generation.failure.retry).toBe(true);
    expect(body.generation.notice).toBeNull();
  });

  it("adds the copyright step-back note while the step-back runs, and only then", async () => {
    const artifacts = { notice: "provider_refusal" };
    view.mockResolvedValue(generation({ stage: "design", artifacts }));
    expect((await get()).body.generation.notice).toBe(COPYRIGHT_STEP_BACK_NOTICE);
    view.mockResolvedValue(
      generation({ status: "failed", errorCode: "provider_refusal", artifacts }),
    );
    const failed = (await get()).body.generation;
    expect(failed.notice).toBeNull();
    expect(failed.failure).toEqual(generationFailure("provider_refusal"));
    view.mockResolvedValue(
      generation({ status: "succeeded", stage: "done", cardDesignId: "d1", artifacts }),
    );
    expect((await get()).body.generation).toMatchObject({ notice: null, failure: null });
  });
});
