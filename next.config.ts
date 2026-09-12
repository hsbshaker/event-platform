import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serverless Chromium ships native binaries; keep both packages out of the bundler
  // and make sure the compressed browser archives are traced into the function.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/spike/geometry": [
      // Both packages read files by path at runtime (browser archives, browsers.json,
      // bundled scripts) that static tracing does not see; include them whole.
      "./node_modules/@sparticuz/chromium/**",
      "./node_modules/playwright-core/**",
      "./src/spike/fixture.generated.html",
    ],
  },
};

export default nextConfig;
