import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The card's font shaping (`src/lib/card/text/metrics.ts`) loads WebAssembly from these packages.
  // Bundled into a page or Server Action, Turbopack emits HarfBuzz's WASM as a client asset and
  // the server's read of it fails; loaded from node_modules they work everywhere
  // (`docs/technology-decisions.md §8.2`).
  serverExternalPackages: ["harfbuzzjs", "wawoff2"],
};

export default nextConfig;
