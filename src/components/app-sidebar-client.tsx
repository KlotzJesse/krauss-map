"use client";

import { IconDashboard, IconMapPin2 } from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";

import { CreateAreaDialog } from "@/components/areas/create-area-dialog";
import { NavAreas } from "@/components/areas/nav-areas";
import { NavMain } from "@/components/nav-main";
import { CommandPalette } from "@/components/shared/command-palette";
import { LinkPendingIndicator } from "@/components/shared/link-pending-indicator";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { AreaSummary } from "@/lib/types/area-types";

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
  areas: AreaSummary[];
  currentAreaId?: number | null;
  onAreaSelect?: (areaId: number) => void;
}

export function AppSidebarClient({
  areas,
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
          <NavAreas
            areas={areas}
            isLoading={false}
            currentAreaId={currentAreaId}
            onAreaSelect={onAreaSelect}
          />
        </SidebarContent>
      </Sidebar>
      <CreateAreaDialog
        open={createAreaDialogOpen}
        onOpenChange={setCreateAreaDialogOpen}
      />
      <CommandPalette areas={areas} onCreateArea={handleCreateArea} />
    </>
  );
}
