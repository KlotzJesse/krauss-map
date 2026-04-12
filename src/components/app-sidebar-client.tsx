"use client";

import { IconDashboard, IconMapPin2 } from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Suspense } from "react";

import { CreateAreaDialog } from "@/components/areas/create-area-dialog";
import { NavAreas } from "@/components/areas/nav-areas";
import { NavMain } from "@/components/nav-main";
import { LinkPendingIndicator } from "@/components/shared/link-pending-indicator";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type { Area } from "@/lib/types/area-types";

const data = {
  navMain: [
    {
      title: "Übersicht",
      url: "/",
      icon: IconDashboard,
    },
  ],
};

interface AppSidebarClientProps extends React.ComponentProps<typeof Sidebar> {
  areasPromise: Promise<Area[]>;
  currentAreaId?: number | null;
  onAreaSelect?: (areaId: number) => void;
}

function NavAreasLoading() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        <div className="flex items-center justify-between w-full">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="w-4 h-4 rounded" />
        </div>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {(["skeleton-1", "skeleton-2", "skeleton-3"] as const).map(
            (skeletonKey) => (
              <SidebarMenuItem key={skeletonKey}>
                <SidebarMenuButton disabled className="justify-start">
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="h-4 w-32" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebarClient({
  areasPromise,
  currentAreaId,
  onAreaSelect,
  ...props
}: AppSidebarClientProps) {
  const [createAreaDialogOpen, setCreateAreaDialogOpen] = React.useState(false);

  const handleCreateArea = () => {
    setCreateAreaDialogOpen(true);
  };

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
          {/* Consume promise directly in client component with Suspense */}
          <Suspense fallback={<NavAreasLoading />}>
            <NavAreas
              areasPromise={areasPromise}
              isLoading={false}
              currentAreaId={currentAreaId}
              onAreaSelect={onAreaSelect}
            />
          </Suspense>
        </SidebarContent>
      </Sidebar>
      <CreateAreaDialog
        open={createAreaDialogOpen}
        onOpenChange={setCreateAreaDialogOpen}
      />
    </>
  );
}
