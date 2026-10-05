"use client";

import { useId, useState } from "react";

import type { ImportActionResult } from "@/app/actions/guests";
import { AppButton } from "@/components/app/AppButton";
import { Field } from "@/components/app/Field";
import { InlineStatus } from "@/components/app/InlineStatus";
import { Input } from "@/components/app/Input";
import type { GuestList } from "@/lib/guests/guests.server";
import { SAMPLE_CSV, planImport, type ImportPlan } from "@/lib/guests/import-plan";
import { CSV_MAX_BYTES, MAX_PARTIES_PER_EVENT, MAX_PEOPLE_PER_EVENT } from "@/lib/guests/limits";

/**
 * The CSV import (`docs/screen-spec.md` `guests-workspace` "Import CSV"; `spec.md §12.1`, §12.2;
 * `spec.md §31` — RSVP: "CSV with missing phone rows imports and flags Needs phone."), drawn in
 * the shared `Sheet`.
 *
 * Pick a file → a preview read in the browser by the same reader the server uses (how many parties
 * and guests, how many need a phone, and the first rows we skipped or changed, by row number) →
 * `Import`: one call that the server checks again from the file's own bytes and stores all or
 * nothing → the list refreshes and the sheet says how many were added. `Download a sample CSV`
 * gives the columns we read, with placeholder rows.
 */

const SHOWN_ISSUES = 5;
const COUNT = new Intl.NumberFormat("en-US");

function plural(n: number, one: string, many: string): string {
  return `${COUNT.format(n)} ${n === 1 ? one : many}`;
}

/** "We found 18 parties (42 guests). 3 need a phone." */
export function previewLine(plan: Extract<ImportPlan, { ok: true }>): string {
  const found = `We found ${plural(plan.parties.length, "party", "parties")} (${plural(plan.people, "guest", "guests")}).`;
  if (plan.needPhone === 0) return found;
  return `${found} ${COUNT.format(plan.needPhone)} ${plan.needPhone === 1 ? "needs" : "need"} a phone.`;
}

export function ImportPanel({
  eventId,
  current,
  importFile,
  onImported,
}: {
  eventId: string;
  /** The list as it is, for the limits. */
  current: { parties: number; people: number };
  importFile: (form: FormData) => Promise<ImportActionResult>;
  onImported: (list: GuestList, imported: number) => void;
}) {
  const inputId = useId();
  // A new key clears the file input after an import.
  const [inputKey, setInputKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /** The sample is a file made here, in the browser, with placeholder rows only. */
  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "guest-list-sample.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function choose(next: File | null) {
    setError(null);
    setDone(null);
    setPlan(null);
    setFile(next);
    if (!next) return;
    if (next.size > CSV_MAX_BYTES) {
      setPlan({ ok: false, error: "This file is larger than 1 MB. Split it into smaller files." });
      return;
    }
    try {
      setPlan(planImport(await next.text()));
    } catch {
      setPlan({ ok: false, error: "We couldn't read this file. Check that it's a CSV." });
    }
  }

  const ready = plan?.ok === true && plan.parties.length > 0 ? plan : null;
  const overLimit =
    ready !== null &&
    (current.parties + ready.parties.length > MAX_PARTIES_PER_EVENT ||
      current.people + ready.people > MAX_PEOPLE_PER_EVENT);

  async function submit() {
    if (!file || !ready || pending) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("eventId", eventId);
      form.set("file", file);
      const result = await importFile(form);
      if (result.ok) {
        setDone(`Added ${plural(result.imported, "party", "parties")} to your guest list.`);
        setPlan(null);
        setFile(null);
        setInputKey((k) => k + 1);
        onImported(result.list, result.imported);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't import. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-import-panel="">
      <div className="flex flex-col gap-2">
        <p className="text-body-md text-app-text">
          Use a CSV file with a header row. We read the columns Name (or First name and Last name),
          Household, Phone, Email, Child and Plus one. Guests with the same Household become one
          party.
        </p>
        <p className="text-body-sm text-app-text-secondary">
          Rows without a phone are added and marked Needs phone, so you can add one later.
        </p>
        <div>
          <AppButton variant="ghost" size="sm" data-sample-csv="" onClick={downloadSample}>
            Download a sample CSV
          </AppButton>
        </div>
      </div>

      <Field id={inputId} label="CSV file" hint="Up to 1 MB and 2,000 rows.">
        {(controlProps) => (
          <Input
            {...controlProps}
            key={inputKey}
            type="file"
            accept=".csv,text/csv"
            className="py-2 text-body-sm"
            disabled={pending}
            onChange={(e) => void choose(e.target.files?.[0] ?? null)}
          />
        )}
      </Field>

      {plan && !plan.ok && <InlineStatus variant="danger">{plan.error}</InlineStatus>}
      {plan?.ok === true && plan.parties.length === 0 && (
        <InlineStatus variant="danger">
          We didn&apos;t find any guests with a name in this file.
        </InlineStatus>
      )}

      {ready && (
        <section
          aria-labelledby="import-preview-heading"
          className="flex flex-col gap-3 rounded-lg border border-app-border bg-app-surface-subtle p-4"
          data-import-preview=""
        >
          <h3 id="import-preview-heading" className="text-label-md text-app-text">
            Ready to import
          </h3>
          <p className="text-body-md text-app-text" data-import-summary="" aria-live="polite">
            {previewLine(ready)}
          </p>
          {ready.issues.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-body-sm text-app-text-secondary">
                {ready.issues.length === 1 ? "One row needs a look:" : "Some rows need a look:"}
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5" data-import-issues="">
                {ready.issues.slice(0, SHOWN_ISSUES).map((issue, index) => (
                  <li key={`${issue.row}-${index}`} className="text-body-sm text-app-text">
                    {issue.message}
                  </li>
                ))}
              </ul>
              {ready.issues.length > SHOWN_ISSUES && (
                <p className="text-body-sm text-app-text-secondary">
                  And {plural(ready.issues.length - SHOWN_ISSUES, "more row", "more rows")}.
                </p>
              )}
            </div>
          )}
          {overLimit && (
            <InlineStatus variant="warning">
              {`An event can have up to ${COUNT.format(MAX_PARTIES_PER_EVENT)} parties and ${COUNT.format(MAX_PEOPLE_PER_EVENT)} guests. This file would take your list past that.`}
            </InlineStatus>
          )}
          <div>
            <AppButton
              id="import-submit"
              variant="primary"
              size="md"
              pending={pending}
              disabled={pending || overLimit}
              onClick={() => void submit()}
            >
              Import
            </AppButton>
          </div>
        </section>
      )}

      {error && <InlineStatus variant="danger">{error}</InlineStatus>}
      {done && (
        <InlineStatus variant="success" live>
          <span data-import-done="">{done}</span>
        </InlineStatus>
      )}
    </div>
  );
}
