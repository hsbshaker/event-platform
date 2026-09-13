/**
 * Repeated executions of the geometry-runtime spike against a deployment.
 *
 *   node scripts/spike/run.mjs <baseUrl> [--runs 10] [--gap 20] [--repeats 2] [--out docs/spike/results.json]
 *
 * `--gap` seconds between calls lets the function go idle so later calls can observe a
 * fresh cold start; `--repeats` is how many 390/1280 render pairs each invocation performs.
 * Set SPIKE_TOKEN in the environment if the deployment requires it.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const baseUrl = args.find((a) => !a.startsWith("--"));
if (!baseUrl) {
  console.error(
    "usage: node scripts/spike/run.mjs <baseUrl> [--runs N] [--gap S] [--repeats R] [--out file]",
  );
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const runs = Number(opt("runs", 10));
const gap = Number(opt("gap", 0));
const repeats = Number(opt("repeats", 2));
const out = opt("out", `docs/spike/results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const url = `${baseUrl.replace(/\/$/, "")}/api/spike/geometry?repeats=${repeats}`;
const headers = {
  ...(process.env.SPIKE_TOKEN ? { "x-spike-token": process.env.SPIKE_TOKEN } : {}),
  // Vercel "Protection Bypass for Automation" secret, when the preview keeps its login wall.
  ...(process.env.VERCEL_BYPASS ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS } : {}),
};

const results = [];
for (let i = 0; i < runs; i += 1) {
  const t0 = Date.now();
  let body;
  let status;
  try {
    const res = await fetch(url, { headers });
    status = res.status;
    body = await res.json();
  } catch (e) {
    body = { ok: false, error: String(e) };
  }
  const wallMs = Date.now() - t0;
  results.push({ i, status, wallMs, ...body });
  const w = body.byWidth ?? {};
  console.log(
    `${String(i + 1).padStart(2)}/${runs} ${body.ok ? "ok " : "FAIL"} wall ${String(wallMs).padStart(6)}ms ` +
      `cold=${body.coldStart ? "Y" : "n"} inflate ${body.timings?.inflateMs ?? "-"} launch ${body.timings?.launchMs ?? "-"} ` +
      `390:${w[390]?.renderMs?.join("/") ?? "-"} 1280:${w[1280]?.renderMs?.join("/") ?? "-"} ` +
      `det=${w[390]?.deterministic && w[1280]?.deterministic ? "Y" : "n"} fonts=${w[390]?.fontsLoaded && w[1280]?.fontsLoaded ? "Y" : "n"} ` +
      `rss ${body.memoryMb?.rssAfter ?? "-"}MB browser ${body.memoryMb?.browserRss ?? "-"}MB region ${body.env?.region ?? "-"}${body.error ? " " + body.error : ""}`,
  );
  if (gap && i < runs - 1) await new Promise((r) => setTimeout(r, gap * 1000));
}

const ok = results.filter((r) => r.ok);
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const p95 = (a) =>
  a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * 0.95)] : null;
const cold = ok.filter((r) => r.coldStart);
const warm = ok.filter((r) => !r.coldStart);
const summary = {
  url,
  runs,
  succeeded: ok.length,
  failed: results.length - ok.length,
  deterministicAll:
    ok.length > 0 && ok.every((r) => r.byWidth[390].deterministic && r.byWidth[1280].deterministic),
  // hero height and document height, every repeat, identical across all successful invocations
  crossInvocationDeterministic: {
    390:
      ok.length > 0 &&
      new Set(
        ok.map((r) =>
          r.runs
            .filter((x) => x.width === 390)
            .map((x) => `${x.heroHeight}/${x.docHeight}`)
            .join(","),
        ),
      ).size === 1,
    1280:
      ok.length > 0 &&
      new Set(
        ok.map((r) =>
          r.runs
            .filter((x) => x.width === 1280)
            .map((x) => `${x.heroHeight}/${x.docHeight}`)
            .join(","),
        ),
      ).size === 1,
  },
  fontsLoadedAll:
    ok.length > 0 && ok.every((r) => r.byWidth[390].fontsLoaded && r.byWidth[1280].fontsLoaded),
  cleanAll: ok.length > 0 && ok.every((r) => r.byWidth[390].clean && r.byWidth[1280].clean),
  coldStarts: cold.length,
  wallMs: {
    median: med(ok.map((r) => r.wallMs)),
    p95: p95(ok.map((r) => r.wallMs)),
    cold: cold.map((r) => r.wallMs),
    warmMedian: med(warm.map((r) => r.wallMs)),
  },
  inflateMs: {
    cold: cold.map((r) => r.timings.inflateMs),
    warmMedian: med(warm.map((r) => r.timings.inflateMs)),
  },
  launchMs: {
    median: med(ok.map((r) => r.timings.launchMs)),
    p95: p95(ok.map((r) => r.timings.launchMs)),
  },
  renderMs: {
    390: {
      median: med(ok.flatMap((r) => r.byWidth[390].renderMs)),
      p95: p95(ok.flatMap((r) => r.byWidth[390].renderMs)),
    },
    1280: {
      median: med(ok.flatMap((r) => r.byWidth[1280].renderMs)),
      p95: p95(ok.flatMap((r) => r.byWidth[1280].renderMs)),
    },
  },
  nodeRssMb: {
    max: ok.length ? Math.max(...ok.map((r) => r.memoryMb.rssAfter)) : null,
    note: "Node process only; excludes the Chromium child",
  },
  browserRssMb: {
    max: ok.some((r) => r.memoryMb.browserRss != null)
      ? Math.max(...ok.map((r) => r.memoryMb.browserRss ?? 0))
      : null,
    note: "Chromium processes from /proc just before close",
  },
  env: ok[0]?.env ?? null,
  errors: results.filter((r) => !r.ok).map((r) => ({ i: r.i, status: r.status, error: r.error })),
};
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`wrote ${out}`);
