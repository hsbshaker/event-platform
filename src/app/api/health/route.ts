import { NextResponse } from "next/server";

/**
 * Liveness probe for deployments and CI smoke checks. Exposes nothing about
 * generation, spend or model usage (spec.md §32 #41).
 */
export function GET() {
  return NextResponse.json({ ok: true, service: "event-platform" });
}
