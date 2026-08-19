import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Dashboard routes read immutable snapshots. Keep visited tab payloads in the
    // browser router cache for the session; a successful refresh reloads the app.
    staleTimes: {
      dynamic: 86_400,
      static: 86_400,
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withWorkflow(nextConfig);
