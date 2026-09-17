/**
 * The DesignIntent contract package — `docs/model-contracts.md §5`, `docs/phase-4b-plan.md §E`.
 *
 * Contract, runtime narrowing, generated schemas, application validator and retry policy. It
 * calls no model and reaches no provider: `generateDesignIntent` is still the unimplemented
 * boundary in `src/lib/ai/provider.ts`, and no live DesignIntent call is authorised before T21.
 *
 * There is deliberately **no prompt** here, and no prompt text of any kind. The prompt is T21,
 * written after the 4C corpora are frozen so it can be leakage-scanned against them
 * (`docs/phase-4b-plan.md` Part IV). `boundary.test.ts` keeps it that way.
 */
export {
  ASYMMETRIES,
  DENSITIES,
  designIntentEnvelopeSchemaFor,
  designIntentResponseSchema,
  designIntentResponseSchemaFor,
  designSemanticsSchema,
  designSemanticsSchemaFor,
  designSemanticsShape,
  HEX_COLOR,
  HIERARCHIES,
  MOTIF_IDS,
  MOTIF_MAX,
  ORNAMENTS,
  PALETTE_MAX_COLORS,
  PALETTE_MIN_COLORS,
  paletteSchema,
  PRESENTATION_NAME,
  PRESENTATION_NAME_MAX,
  PRESENTATION_NAME_MIN,
  presentationSchema,
  RHYTHMS,
  SECTION_CONTRASTS,
  UNNARROWED,
  type DesignIntentResponse,
  type DesignSemantics,
  type SemanticsNarrowing,
} from "./contract";

export {
  allowedHierarchies,
  allowedPairings,
  assignedHierarchies,
  narrowingFor,
  pairingHoldsAt,
  pairingsExcludedByCategory,
  UnnarrowableAssignmentError,
} from "./narrowing";

export {
  DESIGN_INTENT_INPUT_CHANNELS,
  designIntentInputAssemblyVersion,
  type DesignIntentCallInput,
  type DesignIntentInputChannel,
} from "./input";

export {
  DISPOSITION,
  MAX_REPAIR_RETRIES,
  NEVER_REPROMPT_CONDITIONS,
  REPROMPT_CONDITIONS,
  type IssueClass,
  type IssueDisposition,
} from "./policy";

export {
  assignmentIssues,
  describeIssues,
  parseAndValidateDesignIntentResponse,
  semanticIssues,
  validateDesignIntentResponse,
  validatePresentation,
  type PresentationOutcome,
  type ValidationIssue,
  type ValidationOutcome,
} from "./validate";

export { canonicalJsonSchema, narrowedWireSchema, strictWireSchema } from "./wire-schema";
export { buildSchemaFiles, SCHEMA_FILES, serializeSchema } from "./schemas";
