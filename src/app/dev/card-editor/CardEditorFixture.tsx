"use client";

import { useRef, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { Chip } from "@/components/app/Chip";
import { InvitationCard } from "@/components/card/InvitationCard";
import { TextBackgroundControl } from "@/components/card-editor/TextBackgroundControl";
import type { CardProportion, CardShape } from "@/lib/card/shapes";
import type { TextBox } from "@/lib/card/text-box";
import type { TextBackground } from "@/lib/card/text-background";

import { saveDevBoxes } from "./actions";
import type { DevCardPlacement } from "./fixture.server";

/**
 * The developer card editor (`page.tsx`): the production `InvitationCard`, a box list, fixture
 * geometry controls and the text background control. Edits are queued and saved one at a time
 * through the dev server action, each applied to the latest stored boxes; the card shows the
 * stored result. A text background change shows at once and is confirmed by the save.
 */

const BOX_LABELS: Record<string, string> = {
  title: "Title",
  invitationLine: "Invitation line",
  babyName: "Name",
  hosts: "Hosts",
  date: "Date",
  time: "Time",
  venue: "Venue",
  rsvpBy: "RSVP by",
};

function labelOf(box: TextBox): string {
  if (box.source.kind === "custom") return "Added text";
  return BOX_LABELS[box.source.slot] ?? box.id;
}

/** The editor's form of a stored box: no lines (the server breaks them). */
function toEditorBox(box: TextBox) {
  const { lines: _lines, ...rest } = box;
  void _lines;
  return rest;
}

type Status = "idle" | "saving" | "saved" | "error";

export interface CardEditorFixtureProps {
  card: string;
  label: string;
  standIn: boolean;
  shape: CardShape;
  proportion: CardProportion;
  layout: string;
  artworkSrc: string;
  artworkSha256: string;
  artworkBytes: number;
  placement: DevCardPlacement;
  swatches: readonly string[];
  seed: TextBox[];
}

const GEOMETRY: { action: string; label: string; change: (b: TextBox) => Partial<TextBox> }[] = [
  { action: "up", label: "Up", change: (b) => ({ y: b.y - 10 }) },
  { action: "down", label: "Down", change: (b) => ({ y: b.y + 10 }) },
  { action: "left", label: "Left", change: (b) => ({ x: b.x - 10 }) },
  { action: "right", label: "Right", change: (b) => ({ x: b.x + 10 }) },
  { action: "narrower", label: "Narrower", change: (b) => ({ width: b.width - 20 }) },
  { action: "wider", label: "Wider", change: (b) => ({ width: b.width + 20 }) },
  { action: "smaller", label: "Smaller", change: (b) => ({ size: b.size - 4 }) },
  { action: "larger", label: "Larger", change: (b) => ({ size: b.size + 4 }) },
];

export function CardEditorFixture(props: CardEditorFixtureProps) {
  const { card, label, standIn, shape, proportion, artworkSrc, placement, swatches } = props;
  const [boxes, setBoxes] = useState<TextBox[]>(props.seed);
  // What the server last stored, as JSON on the page for tests.
  const [stored, setStored] = useState<TextBox[]>(props.seed);
  const [selectedId, setSelectedId] = useState("title");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | undefined>();

  // The last stored boxes, the queue of saves and how many are waiting.
  const latest = useRef<TextBox[]>(props.seed);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const waiting = useRef(0);

  function edit(id: string, change: (box: TextBox) => TextBox, optimistic: boolean) {
    if (optimistic) setBoxes((current) => current.map((b) => (b.id === id ? change(b) : b)));
    waiting.current += 1;
    setStatus("saving");
    setError(undefined);
    queue.current = queue.current.then(async () => {
      const base = latest.current;
      const next = base.map((b) => (b.id === id ? change(b) : b));
      let result;
      try {
        result = await saveDevBoxes({ card, previous: base, boxes: next.map(toEditorBox) });
      } catch (thrown) {
        result = { ok: false as const, error: String(thrown) };
      }
      waiting.current -= 1;
      if (result.ok) {
        latest.current = result.boxes;
        setStored(result.boxes);
        // Show a result only once no newer edit is waiting, so a drag never jumps back.
        if (waiting.current === 0) {
          setBoxes(result.boxes);
          setStatus("saved");
        }
      } else {
        setError(`${result.error} ${JSON.stringify(result.fieldErrors ?? {})}`);
        setStatus("error");
        if (waiting.current === 0) setBoxes(latest.current);
      }
    });
  }

  const visible = boxes.filter((b) => b.lines.length > 0);
  const selected = visible.find((b) => b.id === selectedId) ?? visible[0];

  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 py-6">
      <header className="mb-4 flex flex-col gap-1">
        <h1 className="text-title-md text-app-text">Card editor fixture: {label}</h1>
        <p className="text-body-sm text-app-text-secondary">
          Development fixture for the text background.{" "}
          {standIn && "The wording of this card is a stand-in. "}
          <a className="text-app-link underline" href="?card=notorious">
            Notorious ONE
          </a>{" "}
          ·{" "}
          <a className="text-app-link underline" href="?card=boystory">
            A Boy Story!
          </a>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section aria-label="Card" className="flex min-w-0 flex-col gap-3">
          <div className="mx-auto w-full max-w-[560px]" data-artwork-sha256={props.artworkSha256}>
            <InvitationCard
              shape={shape}
              artwork={{ src: artworkSrc, proportion }}
              panels={[]}
              boxes={boxes}
            />
          </div>
          <p className="break-all text-body-sm text-app-text-tertiary">
            Artwork {props.layout} · {shape} · {props.artworkBytes} bytes · SHA-256{" "}
            <span data-testid="artwork-sha256">{props.artworkSha256}</span>
          </p>
          <p className="text-body-sm text-app-text-tertiary" data-testid="placement">
            Placement: ink {placement.ink}, readable share {Math.round(placement.coverage * 100)}%,{" "}
            {placement.moved
              ? `moved (heading ${placement.shift.heading}, details ${placement.shift.details})`
              : "not moved"}
            .
          </p>
        </section>

        <section aria-label="Editor" className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span id="box-list-label" className="text-label-md text-app-text">
              Text box
            </span>
            <div role="group" aria-labelledby="box-list-label" className="flex flex-wrap gap-2">
              {visible.map((box) => (
                <Chip
                  key={box.id}
                  selected={selected?.id === box.id}
                  data-dev-select={box.id}
                  onClick={() => setSelectedId(box.id)}
                >
                  {labelOf(box)}
                </Chip>
              ))}
            </div>
          </div>

          {selected && (
            <>
              <div className="flex flex-col gap-2">
                <span id="geometry-label" className="text-label-md text-app-text">
                  Fixture geometry (not the editor&apos;s gestures)
                </span>
                <div role="group" aria-labelledby="geometry-label" className="flex flex-wrap gap-2">
                  {GEOMETRY.map(({ action, label: text, change }) => (
                    <AppButton
                      key={action}
                      variant="secondary"
                      size="sm"
                      data-dev-action={action}
                      onClick={() => edit(selected.id, (b) => ({ ...b, ...change(b) }), false)}
                    >
                      {text}
                    </AppButton>
                  ))}
                </div>
              </div>

              <TextBackgroundControl
                idPrefix="bg"
                value={selected.background}
                text={{ color: selected.color, size: selected.size }}
                swatches={swatches}
                onChange={(next: TextBackground | undefined) =>
                  edit(
                    selected.id,
                    (b) => {
                      const { background: _background, ...rest } = b;
                      void _background;
                      return next ? { ...rest, background: next } : rest;
                    },
                    true,
                  )
                }
              />
            </>
          )}

          <p
            id="save-status"
            role="status"
            data-status={status}
            className="text-body-sm text-app-text-secondary"
          >
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
          </p>
          {error && (
            <p role="alert" className="text-body-sm text-app-danger">
              {error}
            </p>
          )}
          <details className="min-w-0">
            <summary className="min-h-11 cursor-pointer py-2 text-label-md text-app-text">
              Stored boxes (JSON)
            </summary>
            <pre
              id="stored-boxes"
              className="max-h-96 overflow-auto rounded-md border border-app-border bg-app-surface-subtle p-3 text-body-sm text-app-text"
            >
              {JSON.stringify(stored, null, 1)}
            </pre>
          </details>
        </section>
      </div>
    </main>
  );
}
