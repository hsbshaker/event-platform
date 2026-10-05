"use client";

import { useState } from "react";

import { GuestsWorkspace } from "@/app/events/[id]/guests/GuestsWorkspace";

import { fixtureGuestActions, fixtureParties } from "./guest-stubs";

/**
 * The guest workspace from fixture data: the real `GuestsWorkspace` with stubbed actions that
 * behave as the server does (`guest-stubs.ts`). No database.
 */
export function GuestsFixture({
  data,
  published,
  closeHref,
}: {
  data: "some" | "empty";
  published: boolean;
  closeHref: string;
}) {
  const [stubs] = useState(() =>
    fixtureGuestActions({ initial: data === "empty" ? [] : fixtureParties(), published }),
  );
  return (
    <GuestsWorkspace
      eventId="00000000-0000-4000-8000-00000000e7e7"
      initial={stubs.list()}
      closeHref={closeHref}
      actions={stubs.actions}
    />
  );
}
