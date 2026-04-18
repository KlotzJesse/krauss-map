import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { ResizableSidebarLayout } from "@/components/shared/resizable-sidebar-layout";
import { FeatureErrorBoundary } from "@/components/ui/error-boundaries";
import { SidebarSkeleton } from "@/components/ui/loading-skeleton";
import { SidebarInset } from "@/components/ui/sidebar";

export default async function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FeatureErrorBoundary fallbackMessage="Fehler beim Laden der Anwendung">
      <ResizableSidebarLayout>
        <Suspense fallback={<SidebarSkeleton />}>
          <AppSidebar variant="inset" />
        </Suspense>
        <SidebarInset>
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2 h-full">
              <div className="flex flex-col gap-4 pb-4 md:gap-6 md:pb-6 h-full has-[[data-layout=fullscreen]]:gap-0 has-[[data-layout=fullscreen]]:pb-0">
                {children}
              </div>
            </div>
          </div>
        </SidebarInset>
      </ResizableSidebarLayout>
    </FeatureErrorBoundary>
  );
}
