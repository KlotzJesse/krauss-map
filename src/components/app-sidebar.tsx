// Server Component wrapper that fetches data and passes resolved array to client.
// Awaiting here ensures NavAreas receives areas directly (no Promise), preventing
// suspension on every navigation which would defer active state updates.

import type { ComponentProps } from "react";

import type { Sidebar } from "@/components/ui/sidebar";
import { getAreas, getRecentActivity } from "@/lib/db/data-functions";

import { AppSidebarClient } from "./app-sidebar-client";

interface AppSidebarProps extends ComponentProps<typeof Sidebar> {
  currentAreaId?: number | null;
  onAreaSelect?: (areaId: number) => void;
}

export async function AppSidebar(props: AppSidebarProps) {
  const [areas, recentActivity] = await Promise.all([
    getAreas(),
    getRecentActivity(12),
  ]);

  return <AppSidebarClient areas={areas} recentActivity={recentActivity} {...props} />;
}
