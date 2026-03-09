import dynamic from "next/dynamic";
import { Suspense } from "react";

import { VersionIndicatorSkeleton } from "@/components/ui/loading-skeleton";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const VersionIndicator = dynamic(() =>
  import("./shared/version-indicator").then((m) => ({
    default: m.VersionIndicator,
  }))
);

export function SiteHeader({ areaId }: { areaId: number }) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Gebietsmanagement</h1>
        <div className="flex-1" />
        <Suspense fallback={<VersionIndicatorSkeleton />}>
          <VersionIndicator areaId={areaId} />
        </Suspense>
      </div>
    </header>
  );
}
