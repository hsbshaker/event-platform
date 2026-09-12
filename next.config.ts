import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serverless Chromium ships native binaries; keep both packages out of the bundler
  // and make sure the compressed browser archives are traced into the function.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/spike/geometry": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./src/spike/fixture.generated.html",
    ],
  },
};

export default nextConfig;
