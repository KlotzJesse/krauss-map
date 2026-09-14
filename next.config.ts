import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second build live next to the one being served, e.g.
  // NEXT_DIST_DIR=.next2 for verifying a change without stopping :3000.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typedRoutes: true,
  partialPrefetching: true,
  cacheComponents: true,

  reactCompiler: true,

  // Externalize packages that have issues with Turbopack bundling
  serverExternalPackages: [
    "@react-email/components",
    "@react-email/render",
    "resend",
    "jspdf",
  ],

  experimental: {
    serverComponentsHmrCache: true,
    typedEnv: true,
    inlineCss: false,
    webpackMemoryOptimizations: true,
    globalNotFound: true,
    authInterrupts: true,
    turbopackFileSystemCacheForDev: true,
    // dynamic:0 — do not reuse a visited area page's data from the client cache.
    // Edits no longer re-render the route (that remounts the map), so nothing
    // purges this cache after a mutation any more: at 30s, editing area 57,
    // opening another area and coming back showed 57's layers from before the
    // edit. 0 is Next's default. The prefetched static shell below still makes
    // switching areas feel instant; only the data is fetched fresh.
    // static:30 = prefetched static shells reused for 30s.
    staleTimes: { dynamic: 0, static: 30 },
    optimizePackageImports: [
      "lucide-react",
      "@tabler/icons-react",
      "@hugeicons/core-free-icons",
      "@hugeicons/react",
      "@base-ui/react",
      "sonner",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "recharts",
      "date-fns",
      "react-day-picker",
      "nuqs",
      "next-themes",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "fflate",
    ],
  },
  async headers() {
    return [
      {
        // Written by scripts/copy-maplibre-worker.ts straight from
        // node_modules, so the contents change only when maplibre-gl does.
        // Revalidation is still cheap (ETag), but a day of freshness keeps the
        // 480KB shared chunk off the wire on repeat visits.
        source: "/maplibre/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, must-revalidate" },
        ],
      },
    ];
  },

  logging: {
    browserToTerminal: true,
    // 'error' — errors only (default)
    // 'warn'  — warnings and errors
    // true    — all console output
    // false   — disabled
  },
};

export default nextConfig;
