import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: true,
});

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
    optimizePackageImports: [
      "lucide-react",
      "@base-ui/react",
      "sonner",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
