import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "./sidebar";
import { Skeleton } from "./skeleton";

const AREA_NAME_WIDTHS = [
  "w-32",
  "w-28",
  "w-20",
  "w-36",
  "w-24",
  "w-32",
  "w-28",
  "w-20",
];

// Skeleton for entire sidebar
export function SidebarSkeleton({ className }: { className?: string }) {
  return (
    <Sidebar collapsible="offcanvas" className={className}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="h-4 w-40" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* "Neues Gebiet erstellen" button */}
        <div className="px-2 py-1">
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* Nav Main Skeleton: Übersicht + Änderungsprotokoll */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {[32, 44].map((w) => (
                <SidebarMenuItem key={w}>
                  <SidebarMenuButton disabled>
                    <Skeleton className="w-4 h-4 shrink-0" />
                    <Skeleton className={`h-4 w-${w}`} />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* PLZ search input */}
        <div className="px-2 pb-1">
          <Skeleton className="h-7 w-full rounded-md" />
        </div>

        {/* Nav Areas Skeleton */}
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center justify-between w-full">
              <Skeleton className="h-4 w-16" />
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="w-3.5 h-3.5" />
                ))}
              </div>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {/* Gebiete filter input */}
            <div className="px-1 pb-1.5">
              <Skeleton className="h-7 w-full rounded-md" />
            </div>
            {/* "Aktiv" badge */}
            <div className="px-2 pb-1">
              <Skeleton className="h-4 w-8 rounded" />
            </div>
            <SidebarMenu>
              {AREA_NAME_WIDTHS.map((w, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                <SidebarMenuItem key={i}>
                  <SidebarMenuButton disabled>
                    <Skeleton className="w-4 h-4 shrink-0" />
                    <Skeleton className={`h-4 ${w}`} />
                    <Skeleton className="h-3 w-8 ml-auto shrink-0" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

// Skeleton for version indicator in header
export function VersionIndicatorSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-6 w-24 rounded-full" />
    </div>
  );
}

// Generic loading skeleton
export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="w-full h-40 mb-4" />
      <Skeleton className="w-1/2 h-6 mb-2" />
      <Skeleton className="w-1/3 h-6" />
    </div>
  );
}

// Map loading skeleton
export function MapLoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="w-full h-full rounded-lg" />
    </div>
  );
}
