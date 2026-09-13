import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { spikeToken } from "@/lib/env";

/**
 * Deployed proof that rendered-geometry verification works on the production runtime.
 *
 * `docs/technology-decisions.md` ("Geometry verification runtime") makes geometry verification
 * server-side and authoritative before a `ResolvedDesignSpec` is persisted. Phase 0 proved the
 * runtime could launch Chromium at all; this proves the *finished verifier* does, against the
 * production renderer, deployed — which is the only place the file-tracing finding can be
 * retested. A local pass says nothing about whether the browser archives reached the function.
 *
 * It is a verification harness, not the generation path. Phase 4 calls `verifyGeometry` from the
 * generation flow and will carry its own route; this one exists so the runtime evidence is real
 * before that is built on top of it.
 *
 * Fail-closed, exactly as the Phase 0 spike route is: 404 unless `SPIKE_TOKEN` is configured and
 * presented, and never in the production environment, so it can never become a free Chromium
 * endpoint for anyone who finds the path.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

let coldStart = true;
let invocations = 0;

export async function GET(request: NextRequest) {
  const token = spikeToken();
  if (!token || process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const presented = Buffer.from(request.headers.get("x-spike-token") ?? "");
  const expected = Buffer.from(token);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const wasCold = coldStart;
  coldStart = false;
  invocations += 1;
  const started = performance.now();

  // Imported lazily so a failure to trace the browser packages surfaces here as a reported
  // infrastructure error rather than as a module-load crash with no diagnosis.
  const { runDeployedCases } = await import("@/lib/renderer/verify/deployed-cases");

  try {
    const cases = await runDeployedCases({
      repeats: Math.min(3, Math.max(1, Number(request.nextUrl.searchParams.get("repeats") ?? 2))),
    });
    return NextResponse.json({
      ok: cases.every((c) => c.ok),
      cold: wasCold,
      invocations,
      totalMs: Math.round(performance.now() - started),
      region: process.env.VERCEL_REGION ?? null,
      memoryMb: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? null,
      cases,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        cold: wasCold,
        totalMs: Math.round(performance.now() - started),
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
      { status: 500 },
    );
  }
}
