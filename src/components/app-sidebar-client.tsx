"use client";

import { IconDashboard, IconHistory, IconMapPin2 } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { CreateAreaDialog } from "@/components/areas/create-area-dialog";
import { NavMain } from "@/components/nav-main";
import { LinkPendingIndicator } from "@/components/shared/link-pending-indicator";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { RecentActivityItem } from "@/lib/db/data-functions";
import type { AreaSummary } from "@/lib/types/area-types";

const NavAreas = dynamic(() =>
  import("@/components/areas/nav-areas").then((m) => ({
    default: m.NavAreas,
  }))
);

const RecentActivityFeed = dynamic(() =>
  import("@/components/areas/recent-activity-feed").then((m) => ({
    default: m.RecentActivityFeed,
  }))
);

const CommandPalette = dynamic(
  () =>
    import("@/components/shared/command-palette").then((m) => ({
      default: m.CommandPalette,
    })),
  { ssr: false }
);

const data = {
  navMain: [
    {
      title: "Übersicht",
      url: "/",
      icon: IconDashboard,
    },
    {
      title: "Änderungsprotokoll",
      url: "/changelog",
      icon: IconHistory,
    },
  ],
};

interface AppSidebarClientProps extends React.ComponentProps<typeof Sidebar> {
  areas: AreaSummary[];
  recentActivity?: RecentActivityItem[];
  currentAreaId?: number | null;
  onAreaSelect?: (areaId: number) => void;
}

export function AppSidebarClient({
  areas,
  recentActivity = [],
  currentAreaId: currentAreaIdProp,
  onAreaSelect,
  ...props
}: AppSidebarClientProps) {
  const [createAreaDialogOpen, setCreateAreaDialogOpen] = React.useState(false);
  const pathname = usePathname();
  const isPostalCodesRoute = pathname?.startsWith("/postal-codes/") ?? false;
  const currentAreaId =
    currentAreaIdProp ??
    (pathname
      ? Number(pathname.match(/\/postal-codes\/(\d+)/)?.[1]) || null
      : null);
  const [isSidebarDataMounted, setIsSidebarDataMounted] = React.useState(false);

  React.useEffect(() => {
    if (!isPostalCodesRoute) {
      setIsSidebarDataMounted(true);
    }
  }, [isPostalCodesRoute]);

  const handleCreateArea = React.useCallback(() => {
    setCreateAreaDialogOpen(true);
  }, []);
  const mountSidebarData = React.useCallback(() => {
    setIsSidebarDataMounted(true);
  }, []);

  return (
    <>
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/" />}
                className="data-[slot=sidebar-menu-button]:p-1.5!"
              >
                <IconMapPin2 className="size-5!" />
                <span className="truncate text-sm font-semibold">
                  KRAUSS Gebietsmanagement
                </span>
                <LinkPendingIndicator />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={data.navMain} onCreateArea={handleCreateArea} />
          {isSidebarDataMounted ? (
            <>
              <NavAreas
                areas={areas}
                isLoading={false}
                currentAreaId={currentAreaId}
                onAreaSelect={onAreaSelect}
              />
              <RecentActivityFeed items={recentActivity} />
            </>
          ) : (
            <div className="px-3 py-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={mountSidebarData}
              >
                Gebiete laden
              </Button>
            </div>
          )}
        </SidebarContent>
      </Sidebar>
      {createAreaDialogOpen && (
        <CreateAreaDialog
          open={createAreaDialogOpen}
          onOpenChange={setCreateAreaDialogOpen}
        />
      )}
      {isSidebarDataMounted && (
        <CommandPalette areas={areas} onCreateArea={handleCreateArea} />
      )}
    </>
  );
}
