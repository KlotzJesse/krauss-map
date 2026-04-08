import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,

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
    instantNavigationDevToolsToggle: true,
    // stale:0 = Router Cache never serves a prefetched payload as "fresh" for static routes.
    // This fixes Link navigation showing stale loading skeletons instead of real data.
    staleTimes: { dynamic: 0, static: 30 },
    optimizePackageImports: [
      "lucide-react",
      "@tabler/icons-react",
      "@base-ui/react",
      "sonner",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
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
