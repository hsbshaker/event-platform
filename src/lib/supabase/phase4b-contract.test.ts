/**
 * Compile-time proof that T10 can persist and read Phase 4B rows without escaping the types.
 *
 * The pre-T10 hardening exists so orchestration is not written against `as any`, an untyped
 * client, or `Record<string, unknown>` standing in for a persisted row. That is a claim about what
 * the compiler accepts, so it is checked the only way such a claim can be: by writing the calls
 * T10 will make and letting `tsc` decide. The `@ts-expect-error` cases are the load-bearing half —
 * each one fails the build if the contract ever stops refusing it.
 *
 * Nothing here touches a database. It is a type fixture that happens to live in a test file.
 *
 * Acceptance criteria: N/A — internal contract integrity.
 */
import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
type RevisionInsert = Tables["event_identity_revisions"]["Insert"];
type RevisionRow = Tables["event_identity_revisions"]["Row"];
type AnswerInsert = Tables["clarification_answers"]["Insert"];

describe("the Phase 4B contract is usable without casts", () => {
  it("accepts the insert T10 will write for a revision", () => {
    const insert: RevisionInsert = {
      event_id: "00000000-0000-0000-0000-000000000000",
      revision: 1,
      result: { clarification: { needed: false, questions: [] } },
      prompt_version: "event_identity_v5",
      schema_version: "event_identity_schema_v5",
      input_assembly_version: "event_identity_input_v2",
      provider: "openai",
      model: "gpt-5.6-sol",
      // Optional because the column has a default, not because it is unknown.
      clarification_answer_ids: ["00000000-0000-0000-0000-000000000001"],
    };
    expect(insert.revision).toBe(1);
  });

  it("reads the generated column, and refuses to write it", () => {
    const row = { is_provisional: false } as RevisionRow;
    // Readable: T10 branches on this to decide whether an identity may be consumed.
    const provisional: boolean | null = row.is_provisional;
    expect(provisional).toBe(false);

    const insert: RevisionInsert = {
      event_id: "e",
      revision: 1,
      result: {},
      prompt_version: "p",
      schema_version: "s",
      input_assembly_version: "a",
      provider: "openai",
      model: "m",
      // @ts-expect-error `is_provisional` is GENERATED ALWAYS; Postgres rejects it with 428C9, and
      // the contract omits it from Insert so the compiler rejects it first.
      is_provisional: false,
    };
    expect(insert.provider).toBe("openai");
  });

  it("refuses an update to either append-only table", () => {
    const revisionUpdate: Tables["event_identity_revisions"]["Update"] = {
      // @ts-expect-error `protect_identity_revision` refuses every UPDATE. An immutable row is
      // described as immutable rather than left to fail at runtime.
      result: {},
    };
    const answerUpdate: Tables["clarification_answers"]["Update"] = {
      // @ts-expect-error `protect_clarification_answer` refuses every UPDATE: a correction is not
      // in scope, the host answers the next round's question instead.
      free_text: "changed my mind",
    };
    expect(revisionUpdate).toBeDefined();
    expect(answerUpdate).toBeDefined();
  });

  it("types the answer insert, including the nullable pair and the defer flag", () => {
    const typed: AnswerInsert = {
      event_id: "e",
      identity_revision_id: "r",
      question_index: 0,
      round: 1,
      kind: "creative",
      question_text: "How formal should it read?",
      options: [{ label: "Black tie", isDefer: false }],
      selected_option_label: null,
      free_text: "keep it easy",
      answered_by: "u",
    };
    const deferred: AnswerInsert = {
      ...typed,
      is_defer: true,
      selected_option_label: "You decide",
    };
    expect(deferred.is_defer).toBe(true);

    const wrongRoute: AnswerInsert = {
      ...typed,
      // @ts-expect-error the route is a two-value union, not free text.
      kind: "logistics",
    };
    expect(wrongRoute.round).toBe(1);
  });

  it("type-checks through the typed client, not only as a bare shape", () => {
    // Shape assignability is weaker than the claim in this file's header. What T10 actually writes
    // is a builder chain on `SupabaseClient<Database>`, and `AppendOnlyTable`'s
    // `Update: Record<string, never>` is an unusual shape for postgrest-js's `GenericTable` — so
    // the chain is written out here and left unexecuted. The compiler is the assertion; the
    // runtime expectation below only keeps the test honest about not calling a database.
    const db = null as unknown as SupabaseClient<Database>;
    const persist = () =>
      db
        .from("event_identity_revisions")
        .insert({
          event_id: "e",
          revision: 1,
          result: {},
          prompt_version: "event_identity_v5",
          schema_version: "event_identity_schema_v5",
          input_assembly_version: "event_identity_input_v2",
          provider: "openai",
          model: "gpt-5.6-sol",
        })
        .select("id, is_provisional")
        .single();
    const record = () =>
      db
        .from("clarification_answers")
        .insert({
          event_id: "e",
          identity_revision_id: "r",
          question_index: 0,
          round: 1,
          kind: "boundary",
          question_text: "Is it public yet?",
          options: [{ label: "Yes" }],
          selected_option_label: "Yes",
          free_text: null,
          answered_by: "u",
        })
        .select("id")
        .single();
    const point = () =>
      db.from("events").update({ authoritative_identity_revision_id: "r" }).eq("id", "e");
    expect([persist, record, point].every((f) => typeof f === "function")).toBe(true);
  });

  it("types the event pointer and the run's assembly version", () => {
    const pointer: Tables["events"]["Row"]["authoritative_identity_revision_id"] = null;
    const assembly: Tables["generation_runs"]["Row"]["input_assembly_version"] = null;
    const run: Tables["generation_runs"]["Insert"] = {
      event_id: "e",
      provider: "openai",
      operation: "event_identity",
      model: "m",
      latency_ms: 1,
      success: true,
      prompt_version: "p",
      schema_version: "s",
      input_assembly_version: "event_identity_input_v2",
    };
    expect([pointer, assembly, run.input_assembly_version]).toEqual([
      null,
      null,
      "event_identity_input_v2",
    ]);
  });
});
