import { Suspense } from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { getAreas } from "@/lib/db/data-functions";

import { NavAreas } from "./nav-areas";

interface NavAreasServerProps {
  currentAreaId?: number | null;
  onAreaSelect?: (areaId: number) => void;
}

async function NavAreasContent({
  currentAreaId,
  onAreaSelect,
}: NavAreasServerProps) {
  const areas = await getAreas();

  return (
    <NavAreas
      areas={areas}
      isLoading={false}
      currentAreaId={currentAreaId}
      onAreaSelect={onAreaSelect}
    />
  );
}

function NavAreasLoading() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        <div className="flex items-center justify-between w-full">
          <span>Gebiete</span>
          <div className="w-4 h-4" /> {/* Placeholder for plus button */}
        </div>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton disabled>Lade...</SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function NavAreasServer({
  currentAreaId,
  onAreaSelect,
}: NavAreasServerProps) {
  return (
    <Suspense fallback={<NavAreasLoading />}>
      <NavAreasContent
        currentAreaId={currentAreaId}
        onAreaSelect={onAreaSelect}
      />
    </Suspense>
  );
}
