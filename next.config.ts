import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    inlineCss: true,
    webpackMemoryOptimizations: true,
    useCache: true, // Enable "use cache" directive
    globalNotFound: true,
    authInterrupts: true,
    turbopackFileSystemCacheForDev: true,
    viewTransition: true,
    // dynamic:30 = Router Cache serves recently-visited area pages from client cache for 30s,
    // eliminating the server round-trip on back/forward and quick area switches.
    // static:30 = prefetched static shells reused for 30s.
    staleTimes: { dynamic: 30, static: 30 },
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
      "@deck.gl/core",
      "@deck.gl/layers",
      "@deck.gl/extensions",
      "@deck.gl/mapbox",
    ],
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
