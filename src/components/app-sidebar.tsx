// Server Component wrapper that fetches data and passes promise to client
// This prevents server-only imports from leaking into client bundle

import type { ComponentProps } from "react";

import type { Sidebar } from "@/components/ui/sidebar";
import { getAreas } from "@/lib/db/data-functions";

import { AppSidebarClient } from "./app-sidebar-client";

interface AppSidebarProps extends ComponentProps<typeof Sidebar> {
  currentAreaId?: number | null;
  onAreaSelect?: (areaId: number) => void;
}

export async function AppSidebar(props: AppSidebarProps) {
  // Server Component: fetch data here and pass promise to client
  // This keeps server-only code above the client boundary
  const areasPromise = getAreas();

  return <AppSidebarClient areasPromise={areasPromise} {...props} />;
}
