import type { Metadata } from "next";
import dynamic from "next/dynamic";

import "maplibre-gl/dist/maplibre-gl.css";
import { Inter, Geist } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const ThemeProvider = dynamic(
  () =>
    import("@/components/theme-provider").then((m) => ({
      default: m.ThemeProvider,
    })),
  {
    loading: () => <Skeleton className="w-full h-full" />,
  }
);

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gebietsmanager",
  description:
    "Verwalten und visualisieren Sie Gebiete auf der Deutschlandkarte",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NuqsAdapter>
            <Suspense
              fallback={
                <div className="w-full h-full bg-background">{children}</div>
              }
            >
              {children}
            </Suspense>
            <Toaster />
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
