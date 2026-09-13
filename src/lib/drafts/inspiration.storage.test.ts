import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The order in which an inspiration asset's row and its private object are written and
 * removed (spec.md §7.2, §27).
 *
 * The row is the only record of the object key, so the two are never allowed to disagree in
 * the direction that cannot be repaired: an object no row names is unreachable forever, while
 * a row pointing at a missing object is cleared by the next purge run. The database side of
 * this is proven against real Postgres in tests/db/phase2.test.ts; what is proven here is
 * which call this module makes first and what it does when one of them fails.
 */

const getDraft = vi.fn();
const enforceRateLimit = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
const rpc = vi.fn();
const deleteRows = vi.fn();
/** Every Storage/database call the module makes, in order. */
let calls: string[] = [];

vi.mock("./store", () => ({ getDraft: () => getDraft() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: unknown) => {
      calls.push(`rpc:${name}`);
      return rpc(name, args);
    },
    storage: {
      from: () => ({
        upload: (key: string, bytes: Uint8Array, options: unknown) => {
          calls.push(`upload:${key}`);
          return upload(key, bytes, options);
        },
        remove: (keys: string[]) => {
          calls.push(`remove:${keys.join(",")}`);
          return remove(keys);
        },
      }),
    },
    from: () => ({
      delete: () => ({
        eq: () => ({
          eq: () => ({
            select: () => {
              calls.push("delete-row");
              return deleteRows();
            },
          }),
        }),
      }),
    }),
  }),
}));

const {
  addInspirationToDraft,
  InspirationRejected,
  MAX_FILES_PER_DRAFT,
  removeInspirationFromDraft,
} = await import("./inspiration");

const ASSET = {
  id: "asset-1",
  storageKey: "drafts/draft-1/asset-1.png",
  mimeType: "image/png",
  sizeBytes: 10,
  createdAt: "2026-09-13T00:00:00.000Z",
};

const DRAFT = {
  id: "draft-1",
  prompt: "A spring garden baby shower",
  composerState: null,
  expiresAt: "2026-09-14T00:00:00.000Z",
  inspiration: [ASSET],
};

function png(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function file() {
  return { name: "mood.png", type: "image/png", bytes: png() };
}

beforeEach(() => {
  calls = [];
  getDraft.mockResolvedValue(DRAFT);
  enforceRateLimit.mockResolvedValue(undefined);
  upload.mockResolvedValue({ data: { path: "x" }, error: null });
  remove.mockResolvedValue({ data: [], error: null });
  deleteRows.mockResolvedValue({ data: [{ id: ASSET.id }], error: null });
  rpc.mockResolvedValue({
    data: [
      {
        outcome: "attached",
        asset_id: "asset-2",
        attached_event_id: null,
        asset_created_at: "2026-09-13T01:00:00.000Z",
      },
    ],
    error: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("removing an inspiration asset", () => {
  it("removes the object before the row it is named by", async () => {
    await expect(removeInspirationFromDraft(ASSET.id)).resolves.toBe(true);
    expect(calls).toEqual([`remove:${ASSET.storageKey}`, "delete-row"]);
  });

  it("surfaces a Storage failure instead of deleting the row that names the object", async () => {
    remove.mockResolvedValue({ data: null, error: new Error("storage unavailable") });
    await expect(removeInspirationFromDraft(ASSET.id)).rejects.toThrow("storage unavailable");
    expect(calls).toEqual([`remove:${ASSET.storageKey}`]);
    expect(deleteRows).not.toHaveBeenCalled();
  });

  it("reports failure when the row was not this draft's to delete", async () => {
    // A claim re-parented the asset to the event between the read and the delete, so the
    // conditional delete matches nothing. That is not a removal, and is not reported as one.
    deleteRows.mockResolvedValue({ data: [], error: null });
    await expect(removeInspirationFromDraft(ASSET.id)).resolves.toBe(false);
  });

  it("surfaces a database failure rather than reporting a removal", async () => {
    deleteRows.mockResolvedValue({ data: null, error: new Error("deadlock detected") });
    await expect(removeInspirationFromDraft(ASSET.id)).rejects.toThrow("deadlock detected");
  });

  it("touches nothing for an asset this browser's draft does not hold", async () => {
    await expect(removeInspirationFromDraft("someone-elses-asset")).resolves.toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("adding an inspiration asset", () => {
  it("stores the object and takes the row the database gave it", async () => {
    const asset = await addInspirationToDraft(file());
    expect(asset.id).toBe("asset-2");
    expect(asset.storageKey).toMatch(/^drafts\/draft-1\/.+\.png$/);
    expect(rpc).toHaveBeenCalledWith(
      "attach_inspiration_asset",
      expect.objectContaining({ p_draft_id: "draft-1", p_max_files: MAX_FILES_PER_DRAFT }),
    );
    expect(calls.filter((c) => c.startsWith("remove:"))).toEqual([]);
  });

  it("keeps the upload when the draft was claimed while it was in flight", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          outcome: "attached",
          asset_id: "asset-3",
          attached_event_id: "event-1",
          asset_created_at: "2026-09-13T01:00:00.000Z",
        },
      ],
      error: null,
    });
    const asset = await addInspirationToDraft(file());
    expect(asset.id).toBe("asset-3");
    expect(calls.filter((c) => c.startsWith("remove:"))).toEqual([]);
  });

  it("takes its own object back out of the bucket when no row could be written", async () => {
    for (const outcome of ["limit_reached", "gone"]) {
      calls = [];
      rpc.mockResolvedValue({
        data: [{ outcome, asset_id: null, attached_event_id: null, asset_created_at: null }],
        error: null,
      });
      await expect(addInspirationToDraft(file())).rejects.toBeInstanceOf(InspirationRejected);
      const uploaded = calls.find((c) => c.startsWith("upload:"))!.slice("upload:".length);
      expect(calls, outcome).toEqual([
        `upload:${uploaded}`,
        "rpc:attach_inspiration_asset",
        `remove:${uploaded}`,
      ]);
    }
  });

  it("keeps the documented cap message when the database refuses the file", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          outcome: "limit_reached",
          asset_id: null,
          attached_event_id: null,
          asset_created_at: null,
        },
      ],
      error: null,
    });
    await expect(addInspirationToDraft(file())).rejects.toThrow(
      `You can add up to ${MAX_FILES_PER_DRAFT} images.`,
    );
  });
});
