import { NextResponse, type NextRequest } from "next/server";
import { RateLimitedError } from "@/lib/auth/errors";
import {
  addInspirationToDraft,
  InspirationRejected,
  MAX_FILE_BYTES,
  removeInspirationFromDraft,
  signInspiration,
} from "@/lib/drafts/inspiration";
import { getDraft } from "@/lib/drafts/store";

/**
 * Private inspiration uploads for the pre-auth composer (spec.md §7.2, §27).
 *
 * Everything is scoped to the draft the browser's cookie names, so one visitor can never read
 * or delete another's. Responses carry short-lived signed URLs only; the bucket is private.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const draft = await getDraft();
  if (!draft) return NextResponse.json({ inspiration: [] });
  return NextResponse.json({ inspiration: await signInspiration(draft.inspiration) });
}

/** The client address, for the upload budget. Mirrors `src/app/actions/draft.ts`. */
function requesterIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the image as form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image to add." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `Images must be ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.` },
      { status: 413 },
    );
  }

  try {
    const asset = await addInspirationToDraft(
      {
        name: file.name,
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
      requesterIp(request),
    );
    const [preview] = await signInspiration([asset]);
    return NextResponse.json({ inspiration: preview }, { status: 201 });
  } catch (error) {
    if (error instanceof InspirationRejected) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof RateLimitedError) {
      return NextResponse.json(
        { error: "That is a lot of images. Try again in a few minutes." },
        { status: 429 },
      );
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const removed = await removeInspirationFromDraft(id);
  if (!removed) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
