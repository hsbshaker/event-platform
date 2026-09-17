import type { ClarificationAnswerInput, IdentityView } from "@/lib/generation/identity-view";

/**
 * The server-action boundary, replaced at bundle time — and **only** at bundle time, for this
 * harness.
 *
 * The component under test is the production one, unmodified. What is swapped is the module it
 * talks to, which is exactly the seam T11's own design puts there: the panel consumes T10's public
 * contract and never orchestrates. So the browser drives real React against a boundary whose
 * answers the test dictates, and no database, no session and above all no provider is involved.
 *
 * Every call is recorded. The test asserts on that log, which is what makes "one request per
 * double click" or "the resume was ordinary, not explicit" observable from outside.
 */
export interface HarnessCall {
  action: "start" | "read" | "answer";
  payload: unknown;
}

interface Harness {
  calls: HarnessCall[];
  /** Queued replies, consumed in order; the last one repeats once the queue is empty. */
  queue: Partial<Record<HarnessCall["action"], IdentityView[]>>;
  fallback: Partial<Record<HarnessCall["action"], IdentityView>>;
  /** Actions that should reject, standing in for a lost transport. */
  reject: Partial<Record<HarnessCall["action"], number>>;
  /** Actions held open until the test releases them. */
  hold: Partial<Record<HarnessCall["action"], boolean>>;
  release: () => void;
}

declare global {
  interface Window {
    identityHarness: Harness;
  }
}

const harness: Harness = {
  calls: [],
  queue: {},
  fallback: {},
  reject: {},
  hold: {},
  release: () => {},
};

if (typeof window !== "undefined") {
  // Whatever the test queued, read from the document itself.
  //
  // The same mechanism the initial view uses, and for the same reason: it is in the markup before
  // this script runs, so the panel's arrival effect — which fires the instant it mounts — already
  // has an answer waiting. An earlier version seeded this from a Playwright init script and the
  // queue was reliably empty by the time the first call arrived.
  const seed = document.getElementById("harness-setup")?.textContent;
  if (seed) Object.assign(harness, JSON.parse(seed) as Partial<Harness>);
  window.identityHarness = harness;
}

const held: (() => void)[] = [];
harness.release = () => {
  while (held.length > 0) held.shift()!();
};

async function respond(action: HarnessCall["action"], payload: unknown): Promise<IdentityView> {
  harness.calls.push({ action, payload });
  if ((harness.reject[action] ?? 0) > 0) {
    harness.reject[action] = (harness.reject[action] ?? 0) - 1;
    throw new Error("harness: transport lost");
  }
  if (harness.hold[action]) {
    await new Promise<void>((resolve) => held.push(resolve));
  }
  const queued = harness.queue[action];
  const next = queued && queued.length > 0 ? queued.shift()! : harness.fallback[action];
  if (!next) throw new Error(`harness: no reply queued for ${action}`);
  return next;
}

export async function startEventIdentityForEvent(
  eventId: string,
  options: { explicitRetry?: boolean } = {},
): Promise<IdentityView> {
  return respond("start", { eventId, options });
}

export async function readEventIdentityForEvent(eventId: string): Promise<IdentityView> {
  return respond("read", { eventId });
}

export async function submitClarificationAnswer(
  input: ClarificationAnswerInput,
): Promise<IdentityView> {
  return respond("answer", input);
}

/**
 * The stub must keep the shape of the module it replaces.
 *
 * Types only, so nothing real is imported into the bundle — but if the server action's signature
 * changes and this does not, the harness would go on testing a boundary production no longer has.
 */
type RealActions = typeof import("@/app/actions/event-identity");
const _shape = {
  startEventIdentityForEvent,
  readEventIdentityForEvent,
  submitClarificationAnswer,
} satisfies Pick<
  RealActions,
  "startEventIdentityForEvent" | "readEventIdentityForEvent" | "submitClarificationAnswer"
>;
void _shape;
