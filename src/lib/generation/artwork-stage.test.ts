import { deflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import { ArtworkAttemptBudget, runArtworkStage, type ArtworkStageDeps } from "./artwork-stage";
import type { ArtworkAssetStore } from "./artwork-store";
import { ArtworkBatchBudget } from "@/lib/ai/visual-art/spend";
import {
  STANDING_PROHIBITIONS,
  visualArtIntentSchema,
  VISUAL_ART_INTENT_VERSION,
  type VisualArtIntent,
} from "@/lib/ai/visual-art/contract";
import { ArtworkProviderError } from "@/lib/ai/visual-art/failure";
import type { ArtworkProvider } from "@/lib/ai/visual-art/provider";

/* ------------------------------------------------------------------------------ fixtures */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, body: Buffer) => {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), body])), body.length + 8);
  return out;
};

/** A real RGBA PNG of `size`, either see-through or wall-to-wall opaque. */
function png(size: number, opaque: boolean): Uint8Array {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      const at = row + 1 + x * 4;
      raw[at] = 0x65;
      raw[at + 1] = 0x70;
      raw[at + 2] = 0x4a;
      // A ring of subject with clear edges, unless the test wants an opaque rectangle.
      const d = Math.hypot(x - size / 2, y - size / 2) / (size * 0.4);
      raw[at + 3] = opaque ? 255 : d >= 1 ? 0 : 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const intent = (background: VisualArtIntent["background"] = "transparent"): VisualArtIntent =>
  visualArtIntentSchema.parse({
    version: VISUAL_ART_INTENT_VERSION,
    role: background === "transparent" ? "object" : "atmosphere",
    subject: "A grouping of garden produce and tender botanical growth, painted with restraint.",
    medium: "Hand-painted editorial illustration in gouache with fine natural line detail.",
    composition: "The artwork sits whole in a space of its own beside the event's words.",
    subjectWeight: "balanced",
    negativeSpace: "none",
    background,
    cropSafety: "tight",
    paletteRelationship: "harmonize",
    paletteHexes: ["#F3EAD7", "#65704A"],
    hostConstraints: ["Not childish."],
    prohibited: [...STANDING_PROHIBITIONS],
  });

function admin() {
  const rpc = vi.fn().mockResolvedValue({ data: "ok", error: null });
  return { admin: { rpc } as never, rpc };
}

function provider(behaviour: () => Promise<unknown> | unknown): ArtworkProvider {
  return {
    id: "test-provider",
    model: "test-model-2026-01-01",
    generateArtwork: vi.fn(async () => (await behaviour()) as never),
  };
}

const bytesProvider = (size = 1024, opaque = false) =>
  provider(() => ({
    payload: { kind: "bytes", mediaType: "image/png", bytes: png(size, opaque) },
    providerId: "test-provider",
    model: "test-model-2026-01-01",
    providerRequestId: "req_1",
    costUsd: 0.05,
  }));

function store(): ArtworkAssetStore & { puts: unknown[] } {
  const puts: unknown[] = [];
  return {
    id: "test-store",
    puts,
    async put({ key, bytes }) {
      puts.push({ key, size: bytes.byteLength });
      return {
        bucket: "b",
        path: `${key.resolvedSpecId}/${key.slotId}.png`,
        byteSize: bytes.byteLength,
      };
    },
  };
}

function deps(
  over: Partial<ArtworkStageDeps> = {},
): ArtworkStageDeps & { store: ReturnType<typeof store> } {
  const s = over.store ?? store();
  return {
    provider: over.provider ?? bytesProvider(),
    budget:
      over.budget ??
      ArtworkBatchBudget.open({ id: "b", batchCeilingUsd: 1.5, perRequestEstimateUsd: 0.25 }),
    attempts: over.attempts ?? new ArtworkAttemptBudget(8),
    store: s as ReturnType<typeof store>,
    ...(over.concurrency ? { concurrency: over.concurrency } : {}),
  };
}

const slots = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ slotId: `s${i}`, intent: intent() }));

const run = (d: ArtworkStageDeps, a: ReturnType<typeof admin>, n = 1) =>
  runArtworkStage(a.admin, { resolvedSpecId: "spec-1", slots: slots(n) }, d);

const rpcNames = (a: ReturnType<typeof admin>) => a.rpc.mock.calls.map(([name]) => name);

/* --------------------------------------------------------------------------------- tests */

describe("the happy path carries bytes from provider to slot", () => {
  it("records the request, stores the asset, then attaches it", async () => {
    const a = admin();
    const d = deps();
    const outcome = await run(d, a);

    expect(outcome.delivered).toBe(1);
    expect(outcome.slots[0].status).toBe("delivered");
    // Requested before asked for, so a crash mid-flight leaves a slot that says it was asked for.
    expect(rpcNames(a)).toEqual(["request_artwork_slot", "attach_artwork_asset"]);
    expect(d.store.puts).toHaveLength(1);
  });

  it("measures the asset from its pixels and attaches what it measured", async () => {
    const a = admin();
    await run(deps(), a);
    const attach = a.rpc.mock.calls.find(([n]) => n === "attach_artwork_asset")![1];
    expect(attach.p_width_px).toBe(1024);
    expect(attach.p_height_px).toBe(1024);
    expect(attach.p_content_type).toBe("image/png");
    expect(attach.p_has_alpha).toBe(true);
  });

  it("carries provider lineage on every call it makes", async () => {
    const a = admin();
    await run(deps(), a);
    for (const [, args] of a.rpc.mock.calls) {
      expect(args.p_provider).toBe("test-provider");
      expect(args.p_model).toBe("test-model-2026-01-01");
      expect(args.p_artwork_contract_version).toBe(VISUAL_ART_INTENT_VERSION);
    }
  });

  it("records what the call cost and how long it took, on every record made after it", async () => {
    // These exist only once the provider has answered, so the pre-flight `request_artwork_slot`
    // cannot carry them and every later record must. A slot attached without them reads as free,
    // which would make a batch that really spent money report a total of zero.
    const a = admin();
    await run(deps(), a);
    const call = (name: string) => a.rpc.mock.calls.find(([n]) => n === name)![1];

    // `requestArtworkSlot` does not carry them at all, which is the honest shape for a record
    // written before the call: absent, rather than a zero that reads like a measurement.
    expect(call("request_artwork_slot").p_cost_estimate_usd).toBeUndefined();
    expect(call("request_artwork_slot").p_latency_ms).toBeUndefined();

    const attach = call("attach_artwork_asset");
    expect(attach.p_cost_estimate_usd).toBeGreaterThan(0);
    expect(typeof attach.p_latency_ms).toBe("number");
  });

  it("keeps two slots of one concept apart, and addresses each by its own id", async () => {
    const a = admin();
    const d = deps();
    const outcome = await runArtworkStage(
      a.admin,
      { resolvedSpecId: "spec-1", slots: slots(2) },
      d,
    );
    expect(outcome.delivered).toBe(2);
    expect(d.store.puts.map((p) => (p as { key: { slotId: string } }).key.slotId)).toEqual([
      "s0",
      "s1",
    ]);
  });
});

describe("an asset is validated before it may attach", () => {
  it("refuses an opaque rectangle where transparency was required", async () => {
    // The documented image-model failure: a well-formed RGBA PNG that is opaque in every pixel.
    const a = admin();
    const outcome = await run(deps({ provider: bytesProvider(1024, true) }), a);
    expect(outcome.slots[0].status).toBe("failed");
    // The boundary's transparency check reaches it first for a PNG, which is why the stage's own
    // rectangle check is defence in depth rather than the only guard. What matters is that an
    // opaque asset never attaches to a slot that asked for a cut-out.
    expect(outcome.slots[0].failureKind).toBe("intent_violation");
    expect(rpcNames(a)).toContain("fail_artwork_slot");
    expect(rpcNames(a)).not.toContain("attach_artwork_asset");
  });

  it("refuses implausible dimensions", async () => {
    const a = admin();
    const outcome = await run(deps({ provider: bytesProvider(64) }), a);
    expect(outcome.slots[0].status).toBe("failed");
    expect(outcome.slots[0].detail).toMatch(/implausible dimensions 64x64/);
  });

  it("stores nothing it refused", async () => {
    const d = deps({ provider: bytesProvider(1024, true) });
    await run(d, admin());
    expect(d.store.puts).toHaveLength(0);
  });
});

describe("both bounds sit in front of the provider", () => {
  it("stops asking once the batch's attempts are spent, without spending money", async () => {
    const a = admin();
    const d = deps({ attempts: new ArtworkAttemptBudget(1) });
    const outcome = await runArtworkStage(
      a.admin,
      { resolvedSpecId: "spec-1", slots: slots(3) },
      d,
    );
    expect(outcome.delivered).toBe(1);
    expect(outcome.refused).toBe(2);
    expect(d.provider.generateArtwork).toHaveBeenCalledTimes(1);
    expect(outcome.slots.slice(1).map((s) => s.failureKind)).toEqual([
      "budget_refused",
      "budget_refused",
    ]);
  });

  it("stops asking once the ceiling is committed, and says so in the record", async () => {
    const a = admin();
    const d = deps({
      budget: ArtworkBatchBudget.open({
        id: "b",
        batchCeilingUsd: 0.25,
        perRequestEstimateUsd: 0.25,
      }),
    });
    const outcome = await runArtworkStage(
      a.admin,
      { resolvedSpecId: "spec-1", slots: slots(2) },
      d,
    );
    expect(outcome.delivered).toBe(1);
    expect(outcome.refused).toBe(1);
    expect(d.provider.generateArtwork).toHaveBeenCalledTimes(1);
  });

  it("counts an attempt even when the money is refused, so neither bound is bypassable", async () => {
    const attempts = new ArtworkAttemptBudget(8);
    const budget = ArtworkBatchBudget.open({
      id: "b",
      batchCeilingUsd: 0.25,
      perRequestEstimateUsd: 0.25,
    });
    // Commit the whole ceiling before the stage runs, so its reservation must be refused.
    expect(budget.reserve().ok).toBe(true);
    const d = deps({ attempts, budget });
    await run(d, admin());
    expect(attempts.spent).toBe(1);
    expect(d.provider.generateArtwork).not.toHaveBeenCalled();
  });

  it("refuses a budget whose per-request estimate exceeds its own ceiling", () => {
    // A configuration that could never afford one request is a mistake, not a very small budget.
    expect(() =>
      ArtworkBatchBudget.open({ id: "b", batchCeilingUsd: 0.1, perRequestEstimateUsd: 1 }),
    ).toThrow(TypeError);
  });

  it("refuses a negative or fractional attempt limit rather than rounding it", () => {
    expect(() => new ArtworkAttemptBudget(-1)).toThrow(TypeError);
    expect(() => new ArtworkAttemptBudget(1.5)).toThrow(TypeError);
  });
});

describe("failure is ordinary, and never spreads", () => {
  it("records a provider failure against its slot and returns a usable outcome", async () => {
    const a = admin();
    const outcome = await run(
      deps({
        provider: provider(() => {
          throw new ArtworkProviderError("content_refused", "declined on policy grounds");
        }),
      }),
      a,
    );
    expect(outcome.slots[0].status).toBe("failed");
    expect(outcome.slots[0].failureKind).toBe("content_refused");
    // The database records a coarser vocabulary than the boundary classifies with.
    const fail = a.rpc.mock.calls.find(([n]) => n === "fail_artwork_slot")![1];
    expect(fail.p_failure_kind).toBe("provider_refused");
  });

  it("lets one bad slot sit beside a good one in the same concept", async () => {
    const a = admin();
    let call = 0;
    const d = deps({
      provider: provider(() => {
        call += 1;
        if (call === 1) throw new ArtworkProviderError("content_refused", "no");
        return {
          payload: { kind: "bytes", mediaType: "image/png", bytes: png(1024, false) },
          providerId: "test-provider",
          model: "test-model-2026-01-01",
        };
      }),
    });
    const outcome = await runArtworkStage(
      a.admin,
      { resolvedSpecId: "spec-1", slots: slots(2) },
      d,
    );
    expect(outcome.failed).toBe(1);
    expect(outcome.delivered).toBe(1);
  });

  it("refuses a reference payload it cannot store or inspect", async () => {
    const a = admin();
    const outcome = await run(
      deps({
        provider: provider(() => ({
          payload: { kind: "url", mediaType: "image/png", url: "https://example.test/a.png" },
          providerId: "test-provider",
          model: "test-model-2026-01-01",
        })),
      }),
      a,
    );
    expect(outcome.slots[0].status).toBe("failed");
    expect(rpcNames(a)).not.toContain("attach_artwork_asset");
  });

  it("does nothing at all for a concept with no reserved slots", async () => {
    const a = admin();
    const d = deps();
    const outcome = await runArtworkStage(a.admin, { resolvedSpecId: "spec-1", slots: [] }, d);
    expect(outcome).toEqual({
      resolvedSpecId: "spec-1",
      slots: [],
      delivered: 0,
      failed: 0,
      refused: 0,
    });
    expect(a.rpc).not.toHaveBeenCalled();
    expect(d.provider.generateArtwork).not.toHaveBeenCalled();
  });
});
