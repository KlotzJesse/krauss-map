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
    browserDebugInfoInTerminal: true,
    typedEnv: true,
    inlineCss: true,
    webpackMemoryOptimizations: true,
    useCache: true, // Enable "use cache" directive
    globalNotFound: true,
    turbopackFileSystemCacheForDev: true,
    viewTransition: true,
  },
};

export default nextConfig;
