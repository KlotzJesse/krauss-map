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
              <Skeleton className="h-4 w-48" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Nav Main Skeleton */}
        <SidebarGroup>
          <SidebarGroupLabel>
            <Skeleton className="h-4 w-20" />
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <Skeleton className="w-4 h-4" />
                  <Skeleton className="h-4 w-24" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Nav Areas Skeleton */}
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center justify-between w-full">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="w-4 h-4 rounded" />
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[1, 2, 3].map((i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuButton disabled>
                    <Skeleton className="w-4 h-4" />
                    <Skeleton className="h-4 w-32" />
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

// Skeleton for site header
export function SiteHeaderSkeleton() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Skeleton className="w-8 h-8 rounded" />
        <div className="w-px h-4 bg-border mx-2" />
        <Skeleton className="h-5 w-40" />
        <div className="flex-1" />
        <VersionIndicatorSkeleton />
      </div>
    </header>
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
