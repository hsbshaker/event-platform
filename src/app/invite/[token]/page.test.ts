import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateInviteToken } from "@/lib/cohosts/token";

/**
 * The invite page's decision (`docs/screen-spec.md` `cohost-invite-accept`; `spec.md §6.2`, §27):
 * which view a token gets, signed in or out, with nothing about any event for a link that does not
 * work, and no token in a log line when the look-up fails.
 */

const user = vi.hoisted(() => ({ value: null as null | { id: string } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => user.value }));
const preview = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cohosts/invitations.server", () => ({
  previewInvitation: (...args: unknown[]) => preview(...args),
}));
vi.mock("@/app/actions/auth", () => ({ enabledOAuthProviders: async () => ["google"] }));

const { default: InvitePage } = await import("./page");

async function viewOf(token: string) {
  const element = (await InvitePage({ params: Promise.resolve({ token }) })) as {
    props: { view: unknown; token: string };
  };
  return element.props.view;
}

let logged: string[];

beforeEach(() => {
  user.value = null;
  preview.mockReset();
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(JSON.stringify(args));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the invite page", () => {
  it("answers a malformed token as not valid, without a look-up", async () => {
    for (const token of ["x", "not-a-real-token", `${generateInviteToken()}a`]) {
      expect(await viewOf(token)).toEqual({ kind: "invalid" });
    }
    expect(preview).not.toHaveBeenCalled();
  });

  it("signed out: the title, the inviter and the sign-in methods", async () => {
    const token = generateInviteToken();
    preview.mockResolvedValue({ status: "valid", eventTitle: "Maya's Shower", inviterName: "Ana" });
    expect(await viewOf(token)).toEqual({
      kind: "signed_out",
      eventTitle: "Maya's Shower",
      inviterName: "Ana",
      providers: ["google"],
    });
    expect(preview).toHaveBeenCalledWith(token, null);
  });

  it("signed in: Join event; a member: their event; otherwise not valid", async () => {
    user.value = { id: "user-1" };
    const token = generateInviteToken();
    preview.mockResolvedValueOnce({ status: "valid", eventTitle: null, inviterName: null });
    expect(await viewOf(token)).toEqual({ kind: "signed_in", eventTitle: null, inviterName: null });
    expect(preview).toHaveBeenCalledWith(token, "user-1");
    preview.mockResolvedValueOnce({
      status: "member",
      eventId: "event-1",
      eventTitle: "T",
      role: "owner",
    });
    expect(await viewOf(token)).toEqual({
      kind: "member",
      role: "owner",
      eventId: "event-1",
      eventTitle: "T",
    });
    preview.mockResolvedValueOnce({ status: "invalid" });
    expect(await viewOf(token)).toEqual({ kind: "invalid" });
    preview.mockResolvedValueOnce({ status: "rate_limited" });
    expect(await viewOf(token)).toEqual({ kind: "rate_limited" });
  });

  it("a failed look-up is an honest error, logged without the token", async () => {
    const token = generateInviteToken();
    preview.mockRejectedValue(Object.assign(new Error(`boom ${token}`), { code: "PGRST000" }));
    expect(await viewOf(token)).toEqual({ kind: "error" });
    expect(logged.join("\n")).toContain("PGRST000");
    expect(logged.join("\n")).not.toContain(token);
  });
});
