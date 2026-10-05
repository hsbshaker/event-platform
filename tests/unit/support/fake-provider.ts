/**
 * A scripted stand-in for the model provider (`src/lib/ai/provider.ts` `AiProvider`) in unit tests
 * of the generation stages: each method answers from its own queue, in order, and records every
 * call. A step is a value (returned as a `ModelResult`), an `Error` (thrown), or a function of the
 * call's input returning either. A call with an empty queue fails the test, unless the method has
 * a default (moderation and inspection default to a clean artwork).
 *
 * No network, no meter: the stages are tested for their policy; the provider and the meter have
 * their own tests (`src/lib/ai/openai.server.test.ts`, `meter.server.test.ts`).
 */
import type {
  AiProvider,
  ArtworkInspection,
  ArtworkModeration,
  CardArt,
  CardDesign,
  EventIdentity,
  ExtractedFacts,
  GenerateCardArtInput,
  GenerateCardDesignInput,
  GenerateEventIdentityInput,
  ExtractEventFactsInput,
  MeterContext,
  ModelResult,
} from "@/lib/ai/provider";

export const TEST_METER: MeterContext = {
  eventId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  generationId: "33333333-3333-4333-8333-333333333333",
  round: 1,
};

type Step<I, T> = T | Error | ((input: I) => T | Error);

export interface FakeScript {
  identity?: Step<GenerateEventIdentityInput, EventIdentity>[];
  facts?: Step<ExtractEventFactsInput, ExtractedFacts>[];
  design?: Step<GenerateCardDesignInput, CardDesign | unknown>[];
  art?: Step<GenerateCardArtInput, CardArt>[];
  moderation?: Step<CardArt, ArtworkModeration>[];
  inspection?: Step<CardArt, ArtworkInspection>[];
}

export const CLEAN_INSPECTION: ArtworkInspection = {
  hasText: false,
  textDescription: "",
  hasLogoOrBrandMark: false,
  isMockup: false,
  hasPerson: false,
  description: "A soft painted artwork.",
};

export const CLEAN_MODERATION: ArtworkModeration = { flagged: false, categories: [] };

export interface FakeCalls {
  identity: GenerateEventIdentityInput[];
  facts: ExtractEventFactsInput[];
  design: GenerateCardDesignInput[];
  art: GenerateCardArtInput[];
  moderation: CardArt[];
  inspection: CardArt[];
  /** Every call's meter context, in call order. */
  meters: MeterContext[];
}

const USAGE = { provider: "fake", model: "fake", costUsd: 0, latencyMs: 0 };

export function fakeProvider(script: FakeScript) {
  const calls: FakeCalls = {
    identity: [],
    facts: [],
    design: [],
    art: [],
    moderation: [],
    inspection: [],
    meters: [],
  };
  const queues = {
    identity: [...(script.identity ?? [])],
    facts: [...(script.facts ?? [])],
    design: [...(script.design ?? [])],
    art: [...(script.art ?? [])],
    moderation: [...(script.moderation ?? [])],
    inspection: [...(script.inspection ?? [])],
  };
  const defaults: Partial<Record<keyof typeof queues, unknown>> = {
    moderation: CLEAN_MODERATION,
    inspection: CLEAN_INSPECTION,
  };

  async function answer<I, T>(
    name: keyof typeof queues,
    ctx: MeterContext,
    input: I,
  ): Promise<ModelResult<T>> {
    calls.meters.push(ctx);
    (calls[name] as I[]).push(input);
    const queue = queues[name] as Step<I, T>[];
    let step: Step<I, T> | undefined = queue.shift();
    if (step === undefined) {
      if (!(name in defaults)) throw new Error(`fake provider: unexpected ${name} call`);
      step = defaults[name] as T;
    }
    const value = typeof step === "function" ? (step as (input: I) => T | Error)(input) : step;
    if (value instanceof Error) throw value;
    const raw = name === "art" ? "{}" : JSON.stringify(value);
    return { raw, output: value as T, usage: USAGE };
  }

  const provider: AiProvider = {
    generateEventIdentity: (ctx, input) => answer("identity", ctx, input),
    extractEventFacts: (ctx, input) => answer("facts", ctx, input),
    generateCardDesign: (ctx, input) => answer("design", ctx, input),
    generateCardArt: (ctx, input) => answer("art", ctx, input),
    moderateCardArt: (ctx, art) => answer("moderation", ctx, art),
    inspectCardArt: (ctx, art) => answer("inspection", ctx, art),
  };
  return { provider, calls, remaining: queues };
}
