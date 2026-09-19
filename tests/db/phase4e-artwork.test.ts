import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import { ARTWORK_ROLES, VISUAL_ART_INTENT_VERSION } from "@/lib/ai/visual-art/contract";
import {
  attachArtworkAsset,
  failArtworkSlot,
  requestArtworkSlot,
  reserveArtworkSlots,
  type ArtworkSlotReservation,
} from "@/lib/generation/persist-artwork";

import { asActor, connect, createAuthUser, errorCode, resetDatabase } from "./harness";
import { supabaseShim } from "./supabase-shim";

/**
 * `20260919120000_phase4e_artwork_lineage.sql` — an asset that attaches to a frozen spec without
 * touching it.
 *
 * The rule the whole table falls out of: a `ResolvedDesignSpec` is compiled, geometry-verified at
 * 390 and 1280, and **frozen before any image exists**. A slot is a reserved box inside that
 * already-verified geometry. An asset attaches afterwards — or never — and attaching one changes
 * no spec, re-runs no verification, and invalidates nothing.
 *
 * The properties below are the ones that would silently corrupt something if they were wrong:
 *
 *   * **a slot with no asset is complete.** `reserved` is the default and a renderable state, not
 *     a half-written row, because `spec.md §7.6a #1` makes imagery optional;
 *   * **the intent is immutable.** The lineage claim is that *this* asset answered *this* brief;
 *     an editable brief makes that claim unfalsifiable;
 *   * **transitions are forward-only, in the database.** A delivered slot reverting to `requested`
 *     would erase an outcome, and a TypeScript-only guard is not a guard;
 *   * **attachment is idempotent.** The same asset twice is one row in one state;
 *   * **a slot belongs to exactly one revision.** An asset cannot reach a slot of another;
 *   * **alpha is recorded from the asset**, never inferred from the role — `docs/product-doctrine.md
 *     §10` makes it an empirical per-provider property;
 *   * **a terminal failure is a row that says so**, not a missing row indistinguishable from a
 *     slot nobody ever requested.
 *
 * **No model call is made here.** No provider module is imported, mocked or reached, and no image
 * model exists to call: every provider column is exercised as null at least once, because that is
 * the shape production has today.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` — *"Compiler
 * persists immutable, verified ResolvedDesignSpec"*, *"DesignIntent + CompositionTree (raw and
 * canonical) + ResolvedDesignSpec persist per concept with prompt, schema, primitive-set and
 * compiler versions"*. Guardrails `spec.md §32 #13`, `#15`, `#18`, `#20`, `#24`, `#32`.
 */

let db: Client;
let ownerId: string;
let outsiderId: string;
let eventId: string;
let revisionId: string;
let batchId: string;
let conceptId: string;
let specId: string;

const DESIGN_INTENT = { family: "editorial", density: "balanced" };
const TREE = { version: "composition_v1", sections: [{ kind: "hero" }] };
const CONTENT_PROFILE = { titleWords: 3, titleChars: 18, provisionalFields: [] };
const SPEC = { version: "resolved_v2", state: "verified", verified: { clean: true } };

/**
 * A `VisualArtIntent` as the compiler would assemble it from a resolved placement.
 *
 * Deliberately a literal rather than a call into the assembly: this suite tests the persistence
 * of the brief, and a brief built here cannot drift into testing the builder instead.
 */
const INTENT = {
  version: VISUAL_ART_INTENT_VERSION,
  role: "anchor",
  subject: "A long table under strung lights in an orchard at dusk.",
  medium: "loose gouache with visible brush texture",
  composition: "Wide and short; the title sits across its lower half.",
  subjectWeight: "balanced",
  negativeSpace: "bottom",
  background: "opaque",
  cropSafety: "generous",
  paletteRelationship: "harmonize",
  paletteHexes: ["#1F2A24", "#E8E1D3"],
  hostConstraints: [],
  prohibited: ["No text, lettering, numerals or captions anywhere in the image."],
};

const ASSET = {
  bucket: "event-artwork",
  path: "events/a/hero-anchor.png",
  width: 1600,
  height: 900,
  bytes: 482_311,
  contentType: "image/png",
};

interface SlotOverrides {
  readonly slot_id?: string;
  readonly role?: string;
  readonly extent?: string;
  readonly resolved_spec_id?: string;
  readonly mobile_width_px?: number;
  readonly desktop_width_px?: number;
  readonly visual_art_intent?: unknown;
}

async function reserve(overrides: SlotOverrides = {}): Promise<string> {
  const { rows } = await db.query(
    `insert into public.resolved_spec_artwork_slots
       (resolved_spec_id, slot_id, role, extent, mobile_width_px, mobile_height_px,
        desktop_width_px, desktop_height_px, visual_art_intent, visual_art_intent_version)
     values ($1, $2, $3::public.artwork_role, $4, $5, 420, $6, 560, $7::jsonb, $8)
     returning id`,
    [
      overrides.resolved_spec_id ?? specId,
      overrides.slot_id ?? "hero-anchor",
      overrides.role ?? "anchor",
      overrides.extent ?? "full",
      overrides.mobile_width_px ?? 390,
      overrides.desktop_width_px ?? 1280,
      JSON.stringify(overrides.visual_art_intent ?? INTENT),
      VISUAL_ART_INTENT_VERSION,
    ],
  );
  return rows[0].id as string;
}

async function slot(slotId = "hero-anchor", spec = specId) {
  const { rows } = await db.query(
    `select * from public.resolved_spec_artwork_slots
      where resolved_spec_id = $1 and slot_id = $2`,
    [spec, slotId],
  );
  return rows[0];
}

async function attach(
  args: {
    slotId?: string;
    spec?: string;
    bucket?: string;
    path?: string;
    hasAlpha?: boolean;
    contentType?: string;
    provider?: string | null;
    model?: string | null;
  } = {},
) {
  const { rows } = await db.query(
    `select public.attach_artwork_asset(
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, null, null, $12, $13
     ) as outcome`,
    [
      args.spec ?? specId,
      args.slotId ?? "hero-anchor",
      args.bucket ?? ASSET.bucket,
      args.path ?? ASSET.path,
      ASSET.width,
      ASSET.height,
      ASSET.bytes,
      args.contentType ?? ASSET.contentType,
      args.hasAlpha ?? false,
      args.provider ?? null,
      args.model ?? null,
      null,
      null,
    ],
  );
  return rows[0].outcome as string;
}

async function fail(kind = "provider_unavailable", detail: string | null = null, slotId?: string) {
  const { rows } = await db.query(`select public.fail_artwork_slot($1, $2, $3, $4) as outcome`, [
    specId,
    slotId ?? "hero-anchor",
    kind,
    detail,
  ]);
  return rows[0].outcome as string;
}

async function request(slotId = "hero-anchor") {
  const { rows } = await db.query(`select public.request_artwork_slot($1, $2) as outcome`, [
    specId,
    slotId,
  ]);
  return rows[0].outcome as string;
}

/** A second concept and revision in the same event, so cross-revision tests need no second event. */
async function secondRevision(): Promise<string> {
  const { rows: artifacts } = await db.query(
    `insert into public.design_intent_artifacts
       (event_id, batch_id, identity_revision_id, concept_index, round, planner_version,
        assignment, directive, token_allotment, design_intent_prompt_version,
        design_intent_schema_version, design_intent_input_assembly_version, provider, model,
        design_intent, presentation, concept_premise, concept_premise_prompt_version,
        concept_premise_schema_version, concept_premise_input_assembly_version)
     values ($1, $2, $3, 1, 1, 'planner_v2', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
             'design_intent_v6', 'design_intent_schema_v6', 'design_intent_input_v2',
             'openai', 'gpt-5.6-sol', $4::jsonb, $5::jsonb, '{}'::jsonb,
             'concept_premise_v1', 'concept_premise_schema_v1', 'concept_premise_input_v1')
     returning id`,
    [
      eventId,
      batchId,
      revisionId,
      JSON.stringify(DESIGN_INTENT),
      JSON.stringify({ name: "Second", description: "Another direction." }),
    ],
  );
  const { rows: concepts } = await db.query(
    `insert into public.design_concepts
       (event_id, round, concept_index, name, description, design_intent,
        design_intent_artifact_id, composition_raw, composition, composition_hash, capabilities,
        content_profile, directive, token_allotment, design_intent_prompt_version,
        design_intent_schema_version, composition_prompt_version, composition_schema_version,
        composition_input_assembly_version, primitive_set_version, compiler_version)
     values ($1, 1, 1, 'Second', 'Another direction.', $2::jsonb, $3, $4::jsonb, $4::jsonb,
             'hash-b', '{}'::jsonb, $5::jsonb, '{}'::jsonb, '{}'::jsonb, 'design_intent_v6',
             'design_intent_schema_v6', 'composition_v1_p4', 'composition_schema_v2',
             'composition_input_v2', 'composition_v2', 'compiler_phase3_1_0')
     returning id`,
    [
      eventId,
      JSON.stringify(DESIGN_INTENT),
      artifacts[0].id,
      JSON.stringify(TREE),
      JSON.stringify(CONTENT_PROFILE),
    ],
  );
  const { rows: specs } = await db.query(
    `insert into public.resolved_design_specs
       (concept_id, revision, spec, content_version, verified_clean, compiler_version,
        primitive_set_version)
     values ($1, 1, $2::jsonb, 1, true, 'compiler_phase3_1_0', 'composition_v2')
     returning id`,
    [concepts[0].id, JSON.stringify(SPEC)],
  );
  return specs[0].id as string;
}

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await resetDatabase(db);
  ownerId = await createAuthUser(db, "owner@example.test");
  outsiderId = await createAuthUser(db, "outsider@example.test");

  const { rows: events } = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'An orchard supper') returning id`,
    [ownerId],
  );
  eventId = events[0].id as string;

  const { rows: revisions } = await db.query(
    `insert into public.event_identity_revisions
       (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
        provider, model)
     values ($1, 1, '{"identity":{},"suppliedFacts":{},"clarification":{"needed":false,"questions":[]}}',
             'event_identity_v5', 'event_identity_schema_v5', 'event_identity_input_v2',
             'openai', 'gpt-5.6-sol')
     returning id`,
    [eventId],
  );
  revisionId = revisions[0].id as string;

  const { rows: batches } = await db.query(
    `insert into public.generation_batches
       (event_id, identity_revision_id, planner_version, round, status, idempotency_key)
     values ($1, $2, 'planner_v2', 1, 'planned', 'k1') returning id`,
    [eventId, revisionId],
  );
  batchId = batches[0].id as string;

  const { rows: artifacts } = await db.query(
    `insert into public.design_intent_artifacts
       (event_id, batch_id, identity_revision_id, concept_index, round, planner_version,
        assignment, directive, token_allotment, design_intent_prompt_version,
        design_intent_schema_version, design_intent_input_assembly_version, provider, model,
        design_intent, presentation, concept_premise, concept_premise_prompt_version,
        concept_premise_schema_version, concept_premise_input_assembly_version)
     values ($1, $2, $3, 0, 1, 'planner_v2', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
             'design_intent_v6', 'design_intent_schema_v6', 'design_intent_input_v2',
             'openai', 'gpt-5.6-sol', $4::jsonb, $5::jsonb, '{}'::jsonb,
             'concept_premise_v1', 'concept_premise_schema_v1', 'concept_premise_input_v1')
     returning id`,
    [
      eventId,
      batchId,
      revisionId,
      JSON.stringify(DESIGN_INTENT),
      JSON.stringify({ name: "Orchard Supper", description: "Warm, unfussy, outdoors." }),
    ],
  );

  const { rows: concepts } = await db.query(
    `insert into public.design_concepts
       (event_id, round, concept_index, name, description, design_intent,
        design_intent_artifact_id, composition_raw, composition, composition_hash, capabilities,
        content_profile, directive, token_allotment, design_intent_prompt_version,
        design_intent_schema_version, composition_prompt_version, composition_schema_version,
        composition_input_assembly_version, primitive_set_version, compiler_version)
     values ($1, 1, 0, 'Orchard Supper', 'Warm, unfussy, outdoors.', $2::jsonb, $3, $4::jsonb,
             $4::jsonb, 'hash-a', '{}'::jsonb, $5::jsonb, '{}'::jsonb, '{}'::jsonb,
             'design_intent_v6', 'design_intent_schema_v6', 'composition_v1_p4',
             'composition_schema_v2', 'composition_input_v2', 'composition_v2',
             'compiler_phase3_1_0')
     returning id`,
    [
      eventId,
      JSON.stringify(DESIGN_INTENT),
      artifacts[0].id,
      JSON.stringify(TREE),
      JSON.stringify(CONTENT_PROFILE),
    ],
  );
  conceptId = concepts[0].id as string;

  const { rows: specs } = await db.query(
    `insert into public.resolved_design_specs
       (concept_id, revision, spec, content_version, verified_clean, compiler_version,
        primitive_set_version)
     values ($1, 1, $2::jsonb, 1, true, 'compiler_phase3_1_0', 'composition_v2')
     returning id`,
    [conceptId, JSON.stringify(SPEC)],
  );
  specId = specs[0].id as string;

  await db.query(`update public.design_concepts set active_resolved_spec_id = $1 where id = $2`, [
    specId,
    conceptId,
  ]);
});

describe("the role vocabulary is canon's, in one place", () => {
  it("declares exactly the four roles the contract does", async () => {
    const { rows } = await db.query<{ label: string }>(
      `select e.enumlabel as label from pg_enum e
         join pg_type t on t.oid = e.enumtypid
        where t.typname = 'artwork_role'
        order by e.enumsortorder`,
    );
    // Two independent spellings of a closed canonical list is how a fifth member appears quietly.
    // `src/lib/ai/visual-art/contract.ts`: "a fifth role is a compiler change and a version bump".
    expect(rows.map((r) => r.label)).toEqual([...ARTWORK_ROLES]);
  });

  it("refuses a role outside the four", async () => {
    expect(await errorCode(reserve({ role: "border" }))).toBe("22P02");
  });
});

describe("a slot with no asset is a complete artifact", () => {
  it("reserves a slot that is readable, renderable and asks for nothing more", async () => {
    await reserve();
    const row = await slot();

    // `spec.md §7.6a #1`: imagery is optional. This row is what a page with a reserved box and no
    // image looks like, and it is finished work, not a pending write.
    expect(row.status).toBe("reserved");
    expect(row.storage_path).toBeNull();
    expect(row.failure_kind).toBeNull();
    expect(row.settled_at).toBeNull();
    expect(row.requested_at).toBeNull();

    // The structural facts the compiler resolved are all there: this is the evidence that
    // placement was compiler-owned (`spec.md §7.6a #3`).
    expect(row.role).toBe("anchor");
    expect(row.extent).toBe("full");
    expect(row.mobile_width_px).toBe(390);
    expect(row.mobile_height_px).toBe(420);
    expect(row.desktop_width_px).toBe(1280);
    expect(row.desktop_height_px).toBe(560);
    expect(row.visual_art_intent.subject).toBe(INTENT.subject);
    expect(row.visual_art_intent_version).toBe(VISUAL_ART_INTENT_VERSION);
  });

  it("leaves the spec it hangs off untouched", async () => {
    const before = await db.query(
      `select spec, verified_clean, created_at from public.resolved_design_specs where id = $1`,
      [specId],
    );
    await reserve();
    await attach();
    const after = await db.query(
      `select spec, verified_clean, created_at from public.resolved_design_specs where id = $1`,
      [specId],
    );
    // The point of the side table. A spec verified at 390 and 1280 is frozen before any image
    // exists, and an asset arriving later must not be able to touch it — `spec.md §32 #18`.
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("keeps the concept pointing at the same verified revision", async () => {
    await reserve();
    await attach();
    const { rows } = await db.query(
      `select active_resolved_spec_id from public.design_concepts where id = $1`,
      [conceptId],
    );
    expect(rows[0].active_resolved_spec_id).toBe(specId);
  });
});

describe("provider columns are legitimately null", () => {
  it("reserves, requests and delivers with no provider ever named", async () => {
    await reserve();
    expect(await request()).toBe("requested");
    expect(await attach()).toBe("attached");
    const row = await slot();
    // No image model has been selected (`docs/technology-decisions.md`) and none was called here.
    // A row with a fully assembled intent and no provider lineage is the shape production has.
    expect(row.provider).toBeNull();
    expect(row.model).toBeNull();
    expect(row.artwork_prompt_version).toBeNull();
    expect(row.artwork_contract_version).toBeNull();
    expect(row.latency_ms).toBeNull();
    expect(row.cost_estimate_usd).toBeNull();
    // …while the intent's own contract version is not optional: the brief exists, so its version
    // is known.
    expect(row.visual_art_intent_version).toBe(VISUAL_ART_INTENT_VERSION);
  });

  it("refuses a provider without the model that identifies the call", async () => {
    await reserve();
    expect(await errorCode(attach({ provider: "somebody", model: null }))).toBe("23514");
  });
});

describe("the intent is immutable once written", () => {
  it("refuses an edit to the brief", async () => {
    await reserve();
    const edited = JSON.stringify({ ...INTENT, subject: "Something else entirely." });
    expect(
      await errorCode(
        db.query(
          `update public.resolved_spec_artwork_slots set visual_art_intent = $1::jsonb
            where resolved_spec_id = $2 and slot_id = 'hero-anchor'`,
          [edited, specId],
        ),
      ),
      // An editable brief makes "this asset answered this brief" unfalsifiable, which is the
      // whole lineage claim.
    ).toBe("42501");
  });

  it("refuses an edit to the intent's version", async () => {
    await reserve();
    expect(
      await errorCode(
        db.query(
          `update public.resolved_spec_artwork_slots set visual_art_intent_version = 'v9'
            where resolved_spec_id = $1 and slot_id = 'hero-anchor'`,
          [specId],
        ),
      ),
    ).toBe("42501");
  });

  it("refuses an edit to the resolved box, the role or the slot's identity", async () => {
    await reserve();
    const edits = [
      "desktop_width_px = 1600",
      "mobile_height_px = 999",
      "role = 'atmosphere'",
      "extent = 'half'",
      "slot_id = 'somewhere-else'",
    ];
    for (const set of edits) {
      expect(
        await errorCode(
          db.query(
            `update public.resolved_spec_artwork_slots set ${set}
              where resolved_spec_id = $1 and slot_id = 'hero-anchor'`,
            [specId],
          ),
        ),
        // The box was measured before the brief was written. Editing it afterwards would make the
        // brief describe a space that no longer exists, with nothing re-verified.
        `${set} should be refused`,
      ).toBe("42501");
    }
  });

  it("refuses to move a slot to another revision", async () => {
    await reserve();
    const other = await secondRevision();
    expect(
      await errorCode(
        db.query(
          `update public.resolved_spec_artwork_slots set resolved_spec_id = $1
            where resolved_spec_id = $2 and slot_id = 'hero-anchor'`,
          [other, specId],
        ),
      ),
    ).toBe("42501");
  });
});

describe("status transitions are forward-only, in the database", () => {
  it("refuses delivered -> requested", async () => {
    await reserve();
    await attach();
    expect(
      await errorCode(
        db.query(
          `update public.resolved_spec_artwork_slots set status = 'requested'
            where resolved_spec_id = $1 and slot_id = 'hero-anchor'`,
          [specId],
        ),
      ),
      // Reverting a settled slot would erase an outcome. The trigger refuses every update to a
      // terminal row, so this is caught before the rank comparison is even reached.
    ).toBe("42501");
  });

  it("refuses requested -> reserved", async () => {
    await reserve();
    await request();
    expect(
      await errorCode(
        db.query(
          `update public.resolved_spec_artwork_slots set status = 'reserved', requested_at = null
            where resolved_spec_id = $1 and slot_id = 'hero-anchor'`,
          [specId],
        ),
      ),
    ).toBe("23514");
  });

  it("refuses failed -> delivered by direct update", async () => {
    await reserve();
    await fail();
    expect(
      await errorCode(
        db.query(
          `update public.resolved_spec_artwork_slots set status = 'delivered'
            where resolved_spec_id = $1 and slot_id = 'hero-anchor'`,
          [specId],
        ),
      ),
    ).toBe("42501");
  });

  it("allows reserved -> requested -> delivered", async () => {
    await reserve();
    expect(await request()).toBe("requested");
    expect((await slot()).status).toBe("requested");
    expect(await attach()).toBe("attached");
    expect((await slot()).status).toBe("delivered");
  });

  it("allows reserved -> delivered, skipping forward", async () => {
    await reserve();
    expect(await attach()).toBe("attached");
    const row = await slot();
    expect(row.status).toBe("delivered");
    // Backfilled, so "delivered implies it was requested" holds by construction rather than by a
    // driver remembering to call request first.
    expect(row.requested_at).not.toBeNull();
  });

  it("refuses to request a settled slot again", async () => {
    await reserve();
    await fail();
    expect(
      await errorCode(db.query(`select public.request_artwork_slot($1, 'hero-anchor')`, [specId])),
    ).toBe("42501");
  });

  it("returns already_requested rather than re-sending lineage", async () => {
    await reserve();
    await db.query(`select public.request_artwork_slot($1, 'hero-anchor', 'p', 'm')`, [specId]);
    const { rows } = await db.query(
      `select public.request_artwork_slot($1, 'hero-anchor', 'other', 'other') as outcome`,
      [specId],
    );
    expect(rows[0].outcome).toBe("already_requested");
    const row = await slot();
    // The first request's lineage is the one that was actually sent.
    expect(row.provider).toBe("p");
    expect(row.model).toBe("m");
  });
});

describe("attachment is idempotent", () => {
  it("converges on one row in one state when the same asset arrives twice", async () => {
    await reserve();
    expect(await attach()).toBe("attached");
    const first = await slot();
    expect(await attach()).toBe("already_delivered");
    const second = await slot();

    expect(second).toEqual(first);
    const { rows } = await db.query(
      `select count(*)::int as n from public.resolved_spec_artwork_slots
        where resolved_spec_id = $1 and slot_id = 'hero-anchor'`,
      [specId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("refuses a different asset against a delivered slot", async () => {
    await reserve();
    await attach();
    // Keeping one and discarding the other silently is last-write-wins in a convergence costume.
    expect(await errorCode(attach({ path: "events/a/somewhere-else.png" }))).toBe("23505");
    expect((await slot()).storage_path).toBe(ASSET.path);
  });

  it("refuses an asset against a terminally failed slot", async () => {
    await reserve();
    await fail("timeout");
    expect(await errorCode(attach())).toBe("42501");
    expect((await slot()).status).toBe("failed");
  });
});

describe("a slot belongs to exactly one revision", () => {
  it("refuses an asset addressed to a revision that does not own the slot", async () => {
    await reserve();
    const other = await secondRevision();
    // The row is addressed by (revision, slot id). Naming another revision resolves to no row.
    expect(await errorCode(attach({ spec: other }))).toBe("23503");
    expect((await slot()).status).toBe("reserved");
  });

  it("leaves the other revision's identically named slot alone", async () => {
    const other = await secondRevision();
    await reserve();
    await reserve({ resolved_spec_id: other });

    await attach();

    expect((await slot("hero-anchor", specId)).status).toBe("delivered");
    // A content edit re-fits into a new revision with new geometry. Its boxes are new boxes, and
    // one must never inherit an asset measured against the other.
    expect((await slot("hero-anchor", other)).status).toBe("reserved");
  });

  it("holds the unique constraint on (revision, slot id)", async () => {
    await reserve();
    expect(await errorCode(reserve())).toBe("23505");
  });

  it("admits the same slot id on a different revision", async () => {
    const other = await secondRevision();
    await reserve();
    await expect(reserve({ resolved_spec_id: other })).resolves.toBeTruthy();
  });

  it("takes a slot with its revision when the concept is deleted", async () => {
    await reserve();
    await db.query(
      `update public.design_concepts set active_resolved_spec_id = null where id = $1`,
      [conceptId],
    );
    await db.query(`delete from public.design_concepts where id = $1`, [conceptId]);
    const { rows } = await db.query(
      `select count(*)::int as n from public.resolved_spec_artwork_slots`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("alpha is recorded from the asset, not inferred", () => {
  it("records false for an anchor whose brief asked for an opaque background", async () => {
    await reserve();
    await attach({ hasAlpha: false });
    expect((await slot()).has_alpha).toBe(false);
  });

  it("records false for an object role whose provider returned no alpha", async () => {
    await reserve({ slot_id: "still-life", role: "object", extent: "half" });
    // `docs/product-doctrine.md §10` and the contract's BACKGROUND_TREATMENTS both make this an
    // empirical demand on the provider. An `object` role wanting transparency and a provider that
    // did not supply it is visible here rather than assumed away.
    await attach({ slotId: "still-life", hasAlpha: false });
    const row = await slot("still-life");
    expect(row.role).toBe("object");
    expect(row.has_alpha).toBe(false);
  });

  it("records true when the asset really carries alpha", async () => {
    await reserve({ slot_id: "still-life", role: "object", extent: "half" });
    await attach({ slotId: "still-life", hasAlpha: true });
    expect((await slot("still-life")).has_alpha).toBe(true);
  });

  it("refuses an asset whose alpha was never measured", async () => {
    await reserve();
    const code = await errorCode(
      db.query(
        `select public.attach_artwork_asset($1, 'hero-anchor', $2, $3, 1600, 900, 482311,
           'image/png', null)`,
        [specId, ASSET.bucket, ASSET.path],
      ),
    );
    // A caller that has not looked at the bytes has nothing to pass, and must not be able to
    // default to either answer.
    expect(code).toBe("23502");
  });

  it("refuses an asset in a format the renderer was not promised", async () => {
    await reserve();
    expect(await errorCode(attach({ contentType: "image/gif" }))).toBe("23514");
  });
});

describe("a terminal failure is a recorded outcome", () => {
  it("keeps the row, the brief and the reserved box", async () => {
    await reserve();
    expect(await fail("provider_refused", "declined: brief mentions a person")).toBe("failed");
    const row = await slot();

    // Not a missing row: `reserved` and "the request failed" render identically and mean entirely
    // different things to anyone asking why this page has no artwork.
    expect(row.status).toBe("failed");
    expect(row.failure_kind).toBe("provider_refused");
    expect(row.failure_detail).toBe("declined: brief mentions a person");
    expect(row.settled_at).not.toBeNull();
    expect(row.visual_art_intent.subject).toBe(INTENT.subject);
    expect(row.desktop_width_px).toBe(1280);
    expect(row.storage_path).toBeNull();
  });

  it("lets the first classification stand on replay", async () => {
    await reserve();
    await fail("timeout");
    expect(await fail("provider_error")).toBe("already_failed");
    expect((await slot()).failure_kind).toBe("timeout");
  });

  it("refuses to record a delivered slot as failed", async () => {
    await reserve();
    await attach();
    expect(await errorCode(fail("provider_error"))).toBe("42501");
  });

  it("refuses a failure kind outside the classified set", async () => {
    await reserve();
    expect(await errorCode(fail("vibes"))).toBe("23514");
  });

  it("refuses a failure with no classification at all", async () => {
    await reserve();
    expect(await errorCode(fail(null as unknown as string))).toBe("23514");
  });

  it("refuses a detail with no kind, so a detail is never the only record", async () => {
    await reserve();
    expect(
      await errorCode(
        db.query(
          `update public.resolved_spec_artwork_slots set failure_detail = 'something went wrong'
            where resolved_spec_id = $1 and slot_id = 'hero-anchor'`,
          [specId],
        ),
      ),
    ).toBe("23514");
  });

  it("refuses an operation on a slot that does not exist", async () => {
    expect(await errorCode(fail("timeout", null, "no-such-slot"))).toBe("23503");
  });
});

describe("the asset's facts arrive together or not at all", () => {
  it("refuses a delivered status hand-written without an asset", async () => {
    await reserve();
    expect(
      await errorCode(
        db.query(
          `update public.resolved_spec_artwork_slots
              set status = 'delivered', settled_at = now(), requested_at = now()
            where resolved_spec_id = $1 and slot_id = 'hero-anchor'`,
          [specId],
        ),
      ),
    ).toBe("23514");
  });

  it("refuses an asset written onto a slot that is not delivered", async () => {
    await reserve();
    expect(
      await errorCode(
        db.query(
          `update public.resolved_spec_artwork_slots set storage_path = $2
            where resolved_spec_id = $1 and slot_id = 'hero-anchor'`,
          [specId, ASSET.path],
        ),
      ),
    ).toBe("23514");
  });

  it("refuses a reservation whose box has no size", async () => {
    expect(await errorCode(reserve({ mobile_width_px: 0 }))).toBe("23514");
  });

  it("refuses a reservation with no brief", async () => {
    const code = await errorCode(
      db.query(
        `insert into public.resolved_spec_artwork_slots
           (resolved_spec_id, slot_id, role, extent, mobile_width_px, mobile_height_px,
            desktop_width_px, desktop_height_px, visual_art_intent_version)
         values ($1, 'no-brief', 'anchor', 'half', 390, 420, 1280, 560, $2)`,
        [specId, VISUAL_ART_INTENT_VERSION],
      ),
    );
    expect(code).toBe("23502");
  });

  it("refuses a slot on a spec revision that does not exist", async () => {
    expect(
      await errorCode(reserve({ resolved_spec_id: "00000000-0000-0000-0000-000000000000" })),
    ).toBe("23503");
  });
});

describe("RLS: members read their own design data, and nothing about the call", () => {
  it("lets a member read the slot and its brief", async () => {
    await reserve();
    const rows = await asActor(db, { kind: "user", id: ownerId }, async (q) => {
      const { rows } = await q(
        `select slot_id, role, status, visual_art_intent, has_alpha, failure_kind
           from public.resolved_spec_artwork_slots`,
      );
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].slot_id).toBe("hero-anchor");
  });

  it("shows a non-member nothing", async () => {
    await reserve();
    const rows = await asActor(db, { kind: "user", id: outsiderId }, async (q) => {
      const { rows } = await q(`select slot_id from public.resolved_spec_artwork_slots`);
      return rows;
    });
    expect(rows).toEqual([]);
  });

  it("shows anon nothing at all", async () => {
    await reserve();
    const code = await errorCode(
      asActor(db, { kind: "anon" }, (q) =>
        q(`select slot_id from public.resolved_spec_artwork_slots`),
      ),
    );
    expect(code).toBe("42501");
  });

  it("withholds provider, cost, latency and failure detail from a member", async () => {
    await reserve();
    for (const column of [
      "provider",
      "model",
      "artwork_prompt_version",
      "artwork_contract_version",
      "latency_ms",
      "cost_estimate_usd",
      "failure_detail",
    ]) {
      const code = await errorCode(
        asActor(db, { kind: "user", id: ownerId }, (q) =>
          q(`select ${column} from public.resolved_spec_artwork_slots`),
        ),
      );
      // `20260916210000` section 2's standing rule: everything describing *how the call was made*
      // is server-only, because PostgREST is reachable from a browser with the member's session.
      expect(code, `${column} should not be member-readable`).toBe("42501");
    }
  });

  it("lets no end-user role write, in any shape", async () => {
    await reserve();
    for (const actor of ["owner", "anon"] as const) {
      const who =
        actor === "owner" ? { kind: "user" as const, id: ownerId } : { kind: "anon" as const };
      expect(
        await errorCode(
          asActor(db, who, (q) =>
            q(
              `update public.resolved_spec_artwork_slots set status = 'delivered'
                where resolved_spec_id = $1`,
              [specId],
            ),
          ),
        ),
      ).toBe("42501");
      expect(
        await errorCode(
          asActor(db, who, (q) =>
            q(`delete from public.resolved_spec_artwork_slots where resolved_spec_id = $1`, [
              specId,
            ]),
          ),
        ),
      ).toBe("42501");
    }
  });

  it("keeps the three write functions off the end-user surface", async () => {
    await reserve();
    for (const call of [
      `select public.request_artwork_slot($1, 'hero-anchor')`,
      `select public.fail_artwork_slot($1, 'hero-anchor', 'timeout')`,
    ]) {
      expect(
        await errorCode(asActor(db, { kind: "user", id: ownerId }, (q) => q(call, [specId]))),
      ).toBe("42501");
    }
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: ownerId }, (q) =>
          q(
            `select public.attach_artwork_asset($1, 'hero-anchor', 'b', 'p', 1, 1, 1,
               'image/png', true)`,
            [specId],
          ),
        ),
      ),
    ).toBe("42501");
  });
});

/**
 * The persistence module itself, against the real database through the shim.
 *
 * The SQL above proves the guarantees; this proves the code that reaches for them. The one piece
 * of real logic in `persist-artwork.ts` is what `reserveArtworkSlots` does on a *conflict* — a
 * replayed driver must converge on the rows that exist — and that branch is reached only through
 * a database that actually raises `23505`.
 */
describe("persist-artwork against the database", () => {
  const RESERVATION = {
    slotId: "hero-anchor",
    role: "anchor",
    extent: "full",
    box: {
      mobile: { widthPx: 390, heightPx: 420 },
      desktop: { widthPx: 1280, heightPx: 560 },
    },
    intent: INTENT,
  } as unknown as ArtworkSlotReservation;

  const ASSET_IN = {
    storageBucket: ASSET.bucket,
    storagePath: ASSET.path,
    widthPx: ASSET.width,
    heightPx: ASSET.height,
    byteSize: ASSET.bytes,
    contentType: "image/png",
    hasAlpha: false,
  } as const;

  it("reserves slots and converges on them when the same revision is persisted twice", async () => {
    const admin = supabaseShim(db);
    const first = await reserveArtworkSlots(admin, specId, [RESERVATION]);
    expect(first).toEqual([{ slotId: "hero-anchor", rowId: expect.any(String), replayed: false }]);

    const replay = await reserveArtworkSlots(admin, specId, [RESERVATION]);
    expect(replay[0].replayed).toBe(true);
    expect(replay[0].rowId).toBe(first[0].rowId);

    const { rows } = await db.query(
      `select count(*)::int as n from public.resolved_spec_artwork_slots`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("writes nothing and asks nothing when the direction chose no artwork", async () => {
    const admin = supabaseShim(db);
    expect(await reserveArtworkSlots(admin, specId, [])).toEqual([]);
    const { rows } = await db.query(
      `select count(*)::int as n from public.resolved_spec_artwork_slots`,
    );
    // `spec.md §7.6a #1`: imagery is optional. A concept with none is the common case.
    expect(rows[0].n).toBe(0);
  });

  it("refuses two slots claiming the same id in one revision", async () => {
    const admin = supabaseShim(db);
    await expect(reserveArtworkSlots(admin, specId, [RESERVATION, RESERVATION])).rejects.toThrow(
      /duplicate artwork slot id/,
    );
  });

  it("drives a slot through request, attach and an idempotent replay", async () => {
    const admin = supabaseShim(db);
    await reserveArtworkSlots(admin, specId, [RESERVATION]);
    const ref = { resolvedSpecId: specId, slotId: "hero-anchor" };

    expect(await requestArtworkSlot(admin, ref)).toBe("requested");
    expect(await attachArtworkAsset(admin, ref, ASSET_IN)).toBe("attached");
    expect(await attachArtworkAsset(admin, ref, ASSET_IN)).toBe("already_delivered");

    const row = await slot();
    expect(row.status).toBe("delivered");
    expect(row.has_alpha).toBe(false);
    // Nothing invented a provider on the way through.
    expect(row.provider).toBeNull();
  });

  it("cannot attach to a slot another revision owns", async () => {
    const admin = supabaseShim(db);
    await reserveArtworkSlots(admin, specId, [RESERVATION]);
    const other = await secondRevision();
    await expect(
      attachArtworkAsset(admin, { resolvedSpecId: other, slotId: "hero-anchor" }, ASSET_IN),
    ).rejects.toThrow(/no such artwork slot/);
  });

  it("records a terminal failure and lets the first classification stand", async () => {
    const admin = supabaseShim(db);
    await reserveArtworkSlots(admin, specId, [RESERVATION]);
    const ref = { resolvedSpecId: specId, slotId: "hero-anchor" };
    expect(await failArtworkSlot(admin, ref, { kind: "timeout", detail: "no response" })).toBe(
      "failed",
    );
    expect(await failArtworkSlot(admin, ref, { kind: "provider_error" })).toBe("already_failed");
    const row = await slot();
    expect(row.failure_kind).toBe("timeout");
    expect(row.failure_detail).toBe("no response");
  });
});
