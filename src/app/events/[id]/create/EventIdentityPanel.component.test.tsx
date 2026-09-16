import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentityView } from "@/lib/generation/identity-view";

/**
 * The clarification surface, driven in a DOM.
 *
 * What is proven here is behaviour a browser suite cannot drive without a live database: which
 * state gates and which does not, that polling and reconnecting never buy a call, that an explicit
 * Retry is the only thing that does, that focus survives a question being replaced, and that
 * nothing internal reaches the document. Layout — 390, 1280, overflow, tap targets — is proven in
 * the browser suite, because jsdom has no layout and a passing assertion there would be a lie.
 *
 * The server actions are mocked at the module boundary: this is the surface under test, and T10's
 * behaviour behind them is proven against real Postgres in `tests/db/phase4b-t10.test.ts`. **No
 * provider call happens anywhere in this phase.**
 *
 * Acceptance criteria: `spec.md §31 — Creation Mode`; `§7.6b`; guardrails `§32 #41`, `#45`.
 */
const start = vi.fn();
const read = vi.fn();
const answer = vi.fn();

vi.mock("@/app/actions/event-identity", () => ({
  startEventIdentityForEvent: (...args: unknown[]) => start(...args),
  readEventIdentityForEvent: (...args: unknown[]) => read(...args),
  submitClarificationAnswer: (...args: unknown[]) => answer(...args),
}));

const { EventIdentityPanel, RESUME_AFTER_LOST_TRANSPORT_MS } = await import("./EventIdentityPanel");
const { IDENTITY_PREINVOKE_RECLAIM_MS } = await import("@/lib/generation/identity-spend");

const EVENT = "11111111-1111-1111-1111-111111111111";

const READY: IdentityView = { state: "ready", hasAuthoritativeIdentity: true, revision: 1 };

const boundaryView = (question = "Has she agreed to a surprise?"): IdentityView => ({
  state: "clarification_required",
  hasAuthoritativeIdentity: false,
  revision: 1,
  questions: [
    {
      kind: "boundary",
      index: 0,
      question,
      options: [
        { label: "Yes, she knows", isDefer: false },
        { label: "No, it's a surprise", isDefer: false },
      ],
    },
  ],
});

const creativeView = (state: IdentityView["state"] = "ready"): IdentityView => ({
  state,
  hasAuthoritativeIdentity: state === "ready",
  revision: 1,
  questions: [
    {
      kind: "creative",
      index: 2,
      question: "Warmer or cooler?",
      options: [
        { label: "Warmer", isDefer: false },
        { label: "Cooler", isDefer: false },
        { label: "You choose", isDefer: true },
      ],
    },
  ],
});

let container: HTMLDivElement;
let root: Root;

function render(initial: IdentityView) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<EventIdentityPanel eventId={EVENT} initial={initial} />);
  });
}

const text = () => container.textContent ?? "";
const radios = () => [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
const button = (name: RegExp) =>
  [...container.querySelectorAll("button")].find((b) => name.test(b.textContent ?? ""));

const click = (element: Element) =>
  act(() => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

/**
 * React tracks a controlled input's value on the node itself, so assigning `checked` directly
 * leaves the tracker believing nothing changed and the handler never runs. Going through the
 * prototype setter is what a real click does.
 */
const choose = (input: HTMLInputElement) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "checked",
    )!.set!;
    setter.call(input, true);
    input.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

const submit = () =>
  act(() => {
    container
      .querySelector("form")!
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });

beforeEach(() => {
  vi.useFakeTimers();
  start.mockReset();
  read.mockReset();
  answer.mockReset();
  start.mockResolvedValue(READY);
  read.mockResolvedValue(READY);
  answer.mockResolvedValue(READY);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ the first run */

describe("arriving at the page", () => {
  it("starts generation once, ordinarily, without the host pressing anything", async () => {
    // `spec.md §7.2`: generation begins once authenticated. An *ordinary* start, never a retry —
    // so if a terminal attempt already blocks this event it spends nothing.
    render({ state: "retry_available", hasAuthoritativeIdentity: false });
    await act(async () => {});

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(EVENT, { explicitRetry: false });
  });

  it("does not start when a call is already running", async () => {
    render({ state: "running", hasAuthoritativeIdentity: false });
    await act(async () => {});
    expect(start).not.toHaveBeenCalled();
  });

  it("does not start when the event already has an answer", async () => {
    render(READY);
    await act(async () => {});
    expect(start).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ polling */

describe("polling", () => {
  it("asks again while work is in motion, and never spends doing it", async () => {
    read.mockResolvedValue({ state: "running", hasAuthoritativeIdentity: false });
    render({ state: "running", hasAuthoritativeIdentity: false });

    for (let i = 0; i < 4; i += 1) await act(async () => vi.advanceTimersByTime(3_000));

    expect(read).toHaveBeenCalledTimes(4);
    expect(start).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });

  it("polls while recovering, because the host has nothing to do yet", async () => {
    read.mockResolvedValue({ state: "recovering", hasAuthoritativeIdentity: false });
    render({ state: "recovering", hasAuthoritativeIdentity: false });
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(read).toHaveBeenCalled();
  });

  it("stops once the state is at rest", async () => {
    render(READY);
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(read).not.toHaveBeenCalled();
  });

  it("stops on a question, a retry and a refusal alike", async () => {
    for (const view of [
      boundaryView(),
      { state: "retry_available", hasAuthoritativeIdentity: true, revision: 1 } as IdentityView,
      {
        state: "temporarily_unavailable",
        hasAuthoritativeIdentity: false,
        message: "Generation is not available right now. Please try again shortly.",
      } as IdentityView,
    ]) {
      render(view);
      await act(async () => vi.advanceTimersByTime(30_000));
      expect(read).not.toHaveBeenCalled();
      act(() => root.unmount());
      container.remove();
    }
  });
});

/* ------------------------------------------------------------------ transport loss */

describe("a start whose transport is lost", () => {
  it("waits past the reclaim horizon, then resumes exactly once, ordinarily", async () => {
    start.mockRejectedValueOnce(new Error("network"));
    // Still working as far as anyone can see, so the resume is still owed. (A poll that settles it
    // first cancels the resume — the case below.)
    read.mockResolvedValue({ state: "running", hasAuthoritativeIdentity: false });
    render({ state: "retry_available", hasAuthoritativeIdentity: false });
    await act(async () => {});
    expect(start).toHaveBeenCalledTimes(1);

    // Nothing yet: resuming sooner would only observe the claim this browser just created.
    await act(async () => vi.advanceTimersByTime(IDENTITY_PREINVOKE_RECLAIM_MS));
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(RESUME_AFTER_LOST_TRANSPORT_MS));
    expect(start).toHaveBeenCalledTimes(2);
    // **Ordinary**, not explicit: a resume must never convert a possibly-paid failure into a
    // second paid call.
    expect(start).toHaveBeenLastCalledWith(EVENT, { explicitRetry: false });

    // And only once. Polling is the normal observation path from here.
    await act(async () => vi.advanceTimersByTime(RESUME_AFTER_LOST_TRANSPORT_MS * 3));
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("resumes after the server could have reclaimed a claim that never reached the provider", () => {
    expect(RESUME_AFTER_LOST_TRANSPORT_MS).toBeGreaterThan(IDENTITY_PREINVOKE_RECLAIM_MS);
  });

  it("drops the owed resume when a poll settles the event first", async () => {
    start.mockRejectedValueOnce(new Error("network"));
    read.mockResolvedValue(READY);
    render({ state: "retry_available", hasAuthoritativeIdentity: false });
    await act(async () => {});
    expect(start).toHaveBeenCalledTimes(1);

    // The poll answers within three seconds; by the time the resume would have fired there is
    // nothing to resume. It would have been free either way, but a POST nobody needs is still one.
    await act(async () => vi.advanceTimersByTime(3_000));
    await act(async () => vi.advanceTimersByTime(RESUME_AFTER_LOST_TRANSPORT_MS * 2));
    expect(start).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ Route B */

describe("a boundary question", () => {
  it("is shown alone, with only the options the model returned", async () => {
    render(boundaryView());
    await act(async () => {});

    expect(text()).toContain("Has she agreed to a surprise?");
    expect(radios().map((r) => r.value)).toEqual(["Yes, she knows", "No, it's a surprise"]);
    // No invented default, no `You decide`, no `Skip`: Route B exists because the decision is not
    // ours to make (`spec.md §7.6b #4`).
    expect(radios().some((r) => r.checked)).toBe(false);
    expect(text()).not.toMatch(/you decide|surprise me|skip|we'll make this call/i);
  });

  it("refuses to continue until the host actually answers", async () => {
    render(boundaryView());
    await act(async () => {});

    submit();
    await act(async () => {});

    expect(answer).not.toHaveBeenCalled();
    expect(text()).toContain("Choose an option to continue.");
  });

  it("sends the chosen option and the round it was asked in", async () => {
    answer.mockResolvedValue({ state: "running", hasAuthoritativeIdentity: false });
    render(boundaryView());
    await act(async () => {});

    choose(radios()[1]);
    submit();
    await act(async () => {});

    expect(answer).toHaveBeenCalledWith({
      eventId: EVENT,
      revision: 1,
      answers: [{ questionIndex: 0, selectedOptionLabel: "No, it's a surprise" }],
    });
  });

  it("renders the next round's question when the rerun asks again", async () => {
    answer.mockResolvedValue(boundaryView("Is the venue theirs to offer?"));
    render(boundaryView());
    await act(async () => {});

    choose(radios()[0]);
    submit();
    await act(async () => {});

    // No lifetime cap: a second boundary round is ordinary (`spec.md §7.6b #1b`).
    expect(text()).toContain("Is the venue theirs to offer?");
  });

  it("moves focus to the panel heading when the question is replaced", async () => {
    answer.mockResolvedValue(READY);
    render(boundaryView());
    await act(async () => {});

    choose(radios()[0]);
    submit();
    await act(async () => {});

    // Without this the control the host was using is removed and focus falls to the body.
    expect(document.activeElement?.id).toBe("identity-panel-heading");
  });
});

/* ------------------------------------------------------------------ Route A */

describe("a creative question", () => {
  it("never gates: it coexists with a ready identity", async () => {
    render(creativeView("ready"));
    await act(async () => {});

    expect(text()).toContain("Your creative direction is ready");
    expect(text()).toContain("Warmer or cooler?");
    // Not a modal, not a blocker: the rest of the page is untouched and nothing traps the host.
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("offers the model's own defer option and adds none of its own", async () => {
    render(creativeView());
    await act(async () => {});

    expect(radios().map((r) => r.value)).toEqual(["Warmer", "Cooler", "You choose"]);
    expect(text()).toContain("We'll make this call for you.");
    expect(text()).not.toMatch(/\bskip\b/i);
  });

  it("sends the defer as the answer it is", async () => {
    answer.mockResolvedValue(READY);
    render(creativeView());
    await act(async () => {});

    choose(radios()[2]);
    submit();
    await act(async () => {});

    expect(answer).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [{ questionIndex: 2, selectedOptionLabel: "You choose" }],
      }),
    );
  });

  it("offers no free-text box, because canon specifies options and one defer", async () => {
    render(creativeView());
    await act(async () => {});

    // `spec.md §7.6b #4` gives a creative question options plus exactly one defer, and that defer
    // is what guarantees a host who has no design vocabulary is never stuck. A typed channel is
    // supported by the database and by the frozen input assembly, but it is product behaviour with
    // no acceptance criterion, so it is not offered until that is decided (`CLAUDE.md §7.3`). The
    // server path is bounded and creative-only already, and is covered in the action's own tests.
    expect(container.querySelector("textarea")).toBeNull();
  });
});

/* ------------------------------------------------------------------ retry */

describe("retry", () => {
  it("is offered only when the backend says the host has a decision to make", async () => {
    render({ state: "recovering", hasAuthoritativeIdentity: false });
    await act(async () => {});
    // `recovering` means "nothing for you to do yet". Offering Retry here invites a host to buy a
    // call the system is still reconciling.
    expect(button(/try again/i)).toBeUndefined();

    act(() => root.unmount());
    container.remove();
    // The arrival start runs and comes back still blocked, which is what a terminal failure does:
    // an ordinary resume after one spends nothing and reports the same state.
    start.mockResolvedValue({
      state: "retry_available",
      hasAuthoritativeIdentity: false,
      revision: 1,
    });
    render({ state: "retry_available", hasAuthoritativeIdentity: false, revision: 1 });
    await act(async () => {});
    expect(button(/try again/i)).toBeDefined();
  });

  it("is the one thing that sends an explicit retry", async () => {
    start.mockResolvedValue({
      state: "retry_available",
      hasAuthoritativeIdentity: false,
      revision: 1,
    });
    render({ state: "retry_available", hasAuthoritativeIdentity: false, revision: 1 });
    await act(async () => {});
    // The arrival start is ordinary; only the button is explicit.
    expect(start).toHaveBeenCalledWith(EVENT, { explicitRetry: false });

    await click(button(/try again/i)!);
    await act(async () => {});

    expect(start).toHaveBeenLastCalledWith(EVENT, { explicitRetry: true });
  });

  it("does not send two on a double click", async () => {
    start.mockResolvedValueOnce({
      state: "retry_available",
      hasAuthoritativeIdentity: false,
      revision: 1,
    });
    render({ state: "retry_available", hasAuthoritativeIdentity: false, revision: 1 });
    await act(async () => {});
    start.mockReset();
    let resolve!: (view: IdentityView) => void;
    start.mockReturnValue(new Promise<IdentityView>((r) => (resolve = r)));

    const retry = button(/try again/i)!;
    await click(retry);
    await click(retry);
    await click(retry);

    // The browser guard is a courtesy; the safety boundary is the claim, which is proven against
    // real Postgres. Both are needed: one stops the noise, the other stops the spend.
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => resolve(READY));
  });
});

/* ------------------------------------------------------------------ what never reaches the page */

describe("the surface holds nothing internal", () => {
  it("renders no claim, spend, cap, provider, model or recovery detail in any state", async () => {
    const views: IdentityView[] = [
      { state: "running", hasAuthoritativeIdentity: false },
      { state: "recovering", hasAuthoritativeIdentity: false },
      boundaryView(),
      creativeView(),
      READY,
      { state: "retry_available", hasAuthoritativeIdentity: true, revision: 1 },
      {
        state: "temporarily_unavailable",
        hasAuthoritativeIdentity: false,
        message: "Generation is not available right now. Please try again shortly.",
      },
      { state: "service_error", hasAuthoritativeIdentity: false },
    ];
    const forbidden = [
      "claim",
      "attempt",
      "ordinal",
      "lease",
      "openai",
      "gpt",
      "token",
      "usd",
      "cost",
      "ceiling",
      "cap",
      "rate limit",
      "sqlstate",
      "provider",
      "reasoning",
      "service_tier",
      "evidence",
      "revision",
    ];

    for (const view of views) {
      render(view);
      await act(async () => {});
      const rendered = container.innerHTML.toLowerCase();
      for (const needle of forbidden) {
        // Whole words: "lease" is inside "please", and a substring scan would fail on the frozen
        // refusal sentence while proving nothing about what leaked.
        expect(rendered, `${view.state} leaked ${needle}`).not.toMatch(
          new RegExp(`\\b${needle}\\b`),
        );
      }
      act(() => root.unmount());
      container.remove();
    }
  });

  it("tells a host a configuration failure will not fix itself", async () => {
    render({ state: "service_error", hasAuthoritativeIdentity: false });
    await act(async () => {});

    // Not the "try again shortly" payload, and no Retry button to hammer.
    expect(text()).not.toMatch(/try again shortly/i);
    expect(button(/try again/i)).toBeUndefined();
  });

  it("shows the frozen refusal sentence and nothing that distinguishes one limit from another", async () => {
    const message = "Generation is not available right now. Please try again shortly.";
    render({ state: "temporarily_unavailable", hasAuthoritativeIdentity: false, message });
    await act(async () => {});
    expect(text()).toContain(message);
  });
});

/* ------------------------------------------------------------------ no theatre */

describe("progress is truthful", () => {
  it("shows no percentage, no stage list and no invented activity", async () => {
    render({ state: "running", hasAuthoritativeIdentity: false });
    await act(async () => {});

    const rendered = text();
    expect(rendered).not.toMatch(/\d+\s?%/);
    expect(rendered).not.toMatch(/step \d|stage \d|analy[sz]ing|thinking|almost there/i);
    expect(rendered).toContain("We're working out the creative direction for your event.");
  });

  it("says the calm thing while reconciling, and nothing about why", async () => {
    render({ state: "recovering", hasAuthoritativeIdentity: false });
    await act(async () => {});
    expect(text()).toContain("We're safely finishing your event.");
  });
});

/* ------------------------------------------------------------------ one round, one form */

describe("a new round is a new form", () => {
  it("carries no selection from the question it replaced", async () => {
    // A rerun commonly returns the next question at the same index. Without the round in the key
    // React keeps the same component instance, and the previous round's selection survives into a
    // question it was never an answer to — which then reaches the model as the host's own words.
    answer.mockResolvedValue({
      ...boundaryView("Is the venue theirs to offer?"),
      revision: 2,
    });
    render(boundaryView());
    await act(async () => {});

    choose(radios()[0]);
    submit();
    await act(async () => {});

    expect(text()).toContain("Is the venue theirs to offer?");
    expect(radios().some((r) => r.checked)).toBe(false);

    // And the stale selection cannot be submitted either: nothing is chosen, so the guard holds.
    answer.mockClear();
    submit();
    await act(async () => {});
    expect(answer).not.toHaveBeenCalled();
  });

  it("answers several creative questions in one submission, buying one rerun", async () => {
    const three: IdentityView = {
      state: "ready",
      hasAuthoritativeIdentity: true,
      revision: 1,
      questions: [0, 1].map((i) => ({
        kind: "creative" as const,
        index: i,
        question: `Question ${i}?`,
        options: [
          { label: `A${i}`, isDefer: false },
          { label: "You choose", isDefer: true },
        ],
      })),
    };
    answer.mockResolvedValue(READY);
    render(three);
    await act(async () => {});

    // One submit for the round, not one per question: `§7.6b #1b` allows up to three, and a rerun
    // is keyed to the whole answer set.
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelectorAll("button[type=submit]")).toHaveLength(1);

    choose(radios()[0]);
    submit();
    await act(async () => {});
    // Half a round is not a round: sending it would buy a call and leave the rest unanswered.
    expect(answer).not.toHaveBeenCalled();

    choose(radios()[2]);
    submit();
    await act(async () => {});
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [
          { questionIndex: 0, selectedOptionLabel: "A0" },
          { questionIndex: 1, selectedOptionLabel: "A1" },
        ],
      }),
    );
  });
});

/* ------------------------------------------------------------------ announcements and blips */

describe("what assistive technology hears, and what a blip does not do", () => {
  it("keeps one live region mounted so a polled transition is announced", async () => {
    read.mockResolvedValue(boundaryView());
    render({ state: "running", hasAuthoritativeIdentity: false });
    await act(async () => {});

    const region = container.querySelector('[aria-live="polite"]')!;
    expect(region).not.toBeNull();
    expect(region.textContent).toBe("Reading your description");

    await act(async () => vi.advanceTimersByTime(3_000));

    // The same node, new text — which is what gets announced. A region mounted together with its
    // content announces nothing, so per-state live elements are silent for exactly this transition.
    expect(container.querySelector('[aria-live="polite"]')).toBe(region);
    expect(region.textContent).toBe("One thing we shouldn't decide for you");
  });

  it("absorbs a dropped poll instead of declaring the service broken", async () => {
    read.mockResolvedValue({ state: "service_error", hasAuthoritativeIdentity: false });
    render({ state: "running", hasAuthoritativeIdentity: false });
    await act(async () => {});

    await act(async () => vi.advanceTimersByTime(3_000));
    await act(async () => vi.advanceTimersByTime(3_000));
    // Still working: one dropped read is not a broken service, and applying it would stop the
    // polling that would have recovered from it while a paid call finished unseen.
    expect(text()).toContain("working out the creative direction");

    await act(async () => vi.advanceTimersByTime(3_000));
    // A fault that persists is reported.
    expect(text()).toMatch(/can't start this right now/i);
  });

  it("does not claim an alert it did not send", async () => {
    render({ state: "service_error", hasAuthoritativeIdentity: false });
    await act(async () => {});
    expect(text()).not.toMatch(/alerted|our team/i);
  });
});

/* ------------------------------------------------------------------ the owed resume, precisely */

describe("a lost start stays owed until something proves it landed", () => {
  /**
   * Arrival auto-starts, and that start's transport dies. From here the browser owes exactly one
   * ordinary resume, and what the polls say decides whether it is still owed.
   */
  const lose = async () => {
    start.mockRejectedValueOnce(new Error("network"));
    render({ state: "retry_available", hasAuthoritativeIdentity: false });
    await act(async () => {});
    expect(start).toHaveBeenCalledTimes(1);
  };

  it("resumes when the request never reached the server at all", async () => {
    // The poll sees an untouched event, which is truthfully `retry_available`. Reading that as
    // "the lost start completed" would strand the host in front of a Retry button for work they
    // already asked for — and nothing would ever have been started.
    read.mockResolvedValue({ state: "retry_available", hasAuthoritativeIdentity: false });
    await lose();

    await act(async () => vi.advanceTimersByTime(3_000));
    await act(async () => vi.advanceTimersByTime(RESUME_AFTER_LOST_TRANSPORT_MS));

    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenLastCalledWith(EVENT, { explicitRetry: false });
  });

  it("resumes when a poll has just reclaimed the stale pre-invocation claim", async () => {
    // The sequence the backend fix makes possible: the claim existed, nobody drove it, a poll
    // reclaimed it past the thirty-second horizon, and the honest state afterwards is
    // `retry_available`. That is the moment the resume can finally do its job.
    read.mockResolvedValueOnce({ state: "running", hasAuthoritativeIdentity: false });
    read.mockResolvedValue({ state: "retry_available", hasAuthoritativeIdentity: false });
    await lose();

    await act(async () => vi.advanceTimersByTime(3_000));
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(RESUME_AFTER_LOST_TRANSPORT_MS));
    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenLastCalledWith(EVENT, { explicitRetry: false });
  });

  it.each([
    ["ready", READY],
    ["clarification_required", boundaryView()],
    [
      "temporarily_unavailable",
      {
        state: "temporarily_unavailable",
        hasAuthoritativeIdentity: false,
        message: "Generation is not available right now. Please try again shortly.",
      } as IdentityView,
    ],
  ])("drops the owed resume once a poll proves %s", async (_label, settled) => {
    read.mockResolvedValue(settled);
    await lose();

    await act(async () => vi.advanceTimersByTime(3_000));
    await act(async () => vi.advanceTimersByTime(RESUME_AFTER_LOST_TRANSPORT_MS * 2));

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("spends the owed resume exactly once, however long the surface stays open", async () => {
    read.mockResolvedValue({ state: "retry_available", hasAuthoritativeIdentity: false });
    await lose();

    await act(async () => vi.advanceTimersByTime(RESUME_AFTER_LOST_TRANSPORT_MS));
    expect(start).toHaveBeenCalledTimes(2);

    // Not a loop: polling is the observation path from here.
    await act(async () => vi.advanceTimersByTime(RESUME_AFTER_LOST_TRANSPORT_MS * 5));
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("never lets a poll itself start anything", async () => {
    read.mockResolvedValue({ state: "running", hasAuthoritativeIdentity: false });
    render({ state: "running", hasAuthoritativeIdentity: false });
    await act(async () => {});

    await act(async () => vi.advanceTimersByTime(3_000 * 10));

    expect(read).toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ the first paint */

describe("a brand-new event does not open as a failure", () => {
  it("says nothing has failed, and offers nothing to try again", async () => {
    let resolve!: (view: IdentityView) => void;
    start.mockReturnValue(new Promise<IdentityView>((r) => (resolve = r)));
    render({ state: "retry_available", hasAuthoritativeIdentity: false });

    // The very first paint, before the mandatory auto-start effect has even run.
    expect(text()).not.toMatch(/couldn't finish|nothing was lost/i);
    expect(button(/try again/i)).toBeUndefined();

    await act(async () => {});
    // And while the start is in flight the copy stays neutral and true.
    expect(text()).toContain("We're starting on your event.");
    expect(button(/try again/i)).toBeUndefined();
    expect(start).toHaveBeenCalledWith(EVENT, { explicitRetry: false });

    await act(async () => resolve({ state: "running", hasAuthoritativeIdentity: false }));
    expect(text()).toContain("working out the creative direction");
    // Normal polling begins.
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(read).toHaveBeenCalled();
  });

  it("shows the real failure only once a start has actually come back with one", async () => {
    start.mockResolvedValue({
      state: "retry_available",
      hasAuthoritativeIdentity: false,
      revision: 1,
    });
    render({ state: "retry_available", hasAuthoritativeIdentity: false });
    await act(async () => {});

    expect(text()).toMatch(/couldn't finish/i);
    expect(button(/try again/i)).toBeDefined();
  });
});
