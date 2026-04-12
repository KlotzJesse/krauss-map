"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { FeatureErrorBoundary } from "@/components/ui/error-boundaries";
import { SidebarSkeleton } from "@/components/ui/loading-skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Client wrapper that provides pathname-aware error recovery.
 * When server-side redirect() fires (e.g. after creating an area),
 * transient errors like "Connection closed" or "resumable slots" can
 * briefly trigger the error boundary. Using pathname as a resetKey
 * ensures the boundary auto-resets once navigation completes.
 */
export function MapLayoutShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <FeatureErrorBoundary
      fallbackMessage="Fehler beim Laden der Anwendung"
      resetKeys={[pathname]}
    >
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <Suspense fallback={<SidebarSkeleton />}>{sidebar}</Suspense>
        <SidebarInset>
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2 h-full">
              <div className="flex flex-col gap-4 pb-4 md:gap-6 md:pb-6 h-full has-[[data-layout=fullscreen]]:gap-0 has-[[data-layout=fullscreen]]:pb-0">
                {children}
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </FeatureErrorBoundary>
  );
}
