import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for the /postal-codes overview page.
 * Matches: SiteHeader + stats cards + area list + right panels.
 */
export function OverviewPageSkeleton() {
  return (
    <>
      {/* SiteHeader */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 lg:px-6">
        <Skeleton className="h-5 w-5 rounded" />
        <div className="h-4 w-px bg-border mx-1" />
        <Skeleton className="h-4 w-36" />
        <div className="flex-1" />
      </header>

      {/* Overview content */}
      <div className="h-full overflow-auto p-6 pt-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Page heading row */}
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </div>

          {/* Stats row: 4 cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Skeleton className="h-4 w-4 rounded shrink-0" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                  <Skeleton className="h-9 w-16 my-1" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Content grid: 2/3 left + 1/3 right */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Area list (col-span-2) */}
            <div className="md:col-span-2 space-y-6">
              {/* Gebiete card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Skeleton className="h-7 w-12 rounded-full" />
                    <Skeleton className="h-7 w-28 rounded-full" />
                    <Skeleton className="h-7 w-14 rounded-full" />
                    <div className="ml-auto">
                      <Skeleton className="h-7 w-32 rounded-md" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded shrink-0" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-20 shrink-0" />
                      </div>
                      <Skeleton className="h-1.5 w-full rounded-full" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Activity card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded shrink-0" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-1">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5">
                      <Skeleton className="h-5 w-5 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-3 w-14 shrink-0" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Right column (col-span-1) */}
            <div className="space-y-4">
              {/* Nach Land */}
              <Card>
                <CardHeader className="pb-3">
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-8" />
                        <Skeleton className="h-3 w-14" />
                      </div>
                      <Skeleton className="h-2 w-full rounded-full" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Top Abdeckung */}
              <Card>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-44 mt-1" />
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Skeleton className="h-3 flex-1" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* PLZ-Konflikte */}
              <Card>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-28" />
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2"
                    >
                      <Skeleton className="h-3 flex-1" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Skeleton for the /postal-codes/[areaId] area map page.
 * Matches: SiteHeader (with area name + version badge) + full-screen map skeleton.
 */
export function AreaMapPageSkeleton() {
  return (
    <>
      {/* SiteHeader */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 lg:px-6">
        <Skeleton className="h-5 w-5 rounded" />
        <div className="h-4 w-px bg-border mx-1" />
        <Skeleton className="h-4 w-28" />
        <div className="flex-1" />
        <Skeleton className="h-6 w-36 rounded-full" />
      </header>

      {/* Map area */}
      <div className="h-full" data-layout="fullscreen">
        <PostalCodesViewSkeleton />
      </div>
    </>
  );
}

/**
 * Skeleton for the /changelog page.
 * Matches: inline header + filter row + table rows.
 */
export function ChangelogPageSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Inline header (matches actual changelog header — no SiteHeader here) */}
      <div className="flex-none px-4 pt-4 pb-3 border-b bg-background">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-4 w-4 rounded shrink-0" />
            <Skeleton className="h-8 w-36 rounded-md" />
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-8 w-16 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-4 gap-4 px-4 py-2 border-b bg-muted/30">
          {["w-24", "w-20", "w-24", "w-16"].map((w, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {/* Rows */}
        <div className="divide-y">
          {Array.from({ length: 14 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
            <div
              key={i}
              className="grid grid-cols-4 gap-4 px-4 py-3 items-center"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Loading skeleton for main page cards - matches PostalCodesOverview structure
export function HomePageSkeleton() {
  return (
    <div className="h-full p-6 pt-10">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <Skeleton className="h-9 w-80 mb-2" />
          <Skeleton className="h-6 w-full max-w-2xl" />
        </div>

        {/* Three Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map((i) => (
            <Card
              key={`card-${i}`}
              className="hover:shadow-lg transition-shadow"
            >
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Skeleton className="w-5 h-5 rounded" />
                  <Skeleton className="h-6 w-40" />
                </div>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-4/5" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-10/12" />
                  <Skeleton className="h-4 w-9/12" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Getting Started Card */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="h-6 w-32" />
            </div>
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="text-center">
                  <Skeleton className="w-12 h-12 rounded-full mx-auto mb-2" />
                  <Skeleton className="h-5 w-32 mx-auto mb-1" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-11/12 mx-auto" />
                  <Skeleton className="h-4 w-10/12 mx-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Loading skeleton for postal codes view - mirrors the actual floating-panel map layout
export function PostalCodesViewSkeleton() {
  return (
    <div className="h-full relative overflow-hidden bg-muted/30">
      {/* Search bar + active layer badge + import button — top right */}
      <div className="absolute top-4 right-16 z-30 flex items-center gap-2">
        <Skeleton className="h-8 w-72 rounded-md" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>

      {/* PLZ search icon — far top right */}
      <Skeleton className="absolute top-4 right-4 z-40 h-8 w-8 rounded" />

      {/* Kartentools panel — left */}
      <div className="absolute top-4 left-4 bottom-4 z-10 w-80 flex flex-col">
        <div className="bg-background rounded-lg border shadow flex flex-col h-full overflow-hidden">
          {/* Panel header row */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-7 w-7 rounded" />
              ))}
            </div>
          </div>

          <div className="flex flex-col flex-1 overflow-hidden p-3 gap-3 min-h-0">
            {/* Area name + description */}
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>

            {/* Granularity row */}
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>

            {/* Layers section header + action buttons */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-14" />
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-7 w-7 rounded" />
                ))}
              </div>
            </div>

            {/* Filter input */}
            <Skeleton className="h-7 w-full rounded-md" />

            {/* Layer rows */}
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-8 shrink-0" />
                <Skeleton className="h-3 w-10 shrink-0" />
              </div>
            ))}

            {/* Statistik section */}
            <div className="pt-2 border-t space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>

            {/* Länder section */}
            <div className="pt-2 border-t space-y-1.5">
              <Skeleton className="h-3.5 w-16" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3 rounded-sm shrink-0" />
                    <Skeleton className="h-3 w-6" />
                  </div>
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Map toolbar — right of the left panel */}
      <div className="absolute top-4 left-[356px] z-10 flex flex-col gap-1">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-8 rounded" />
        ))}
      </div>

      {/* Drawing toolbar — bottom center */}
      <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-center pointer-events-none">
        <div className="bg-background/95 border shadow rounded-full px-2 py-1.5 flex items-center gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-full" />
          ))}
        </div>
      </div>

      {/* Legend — bottom right */}
      <div className="absolute bottom-20 right-4 z-10">
        <div className="bg-background rounded-lg border shadow p-2 w-[180px] space-y-1.5">
          <Skeleton className="h-3 w-16" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-sm shrink-0" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Loading skeleton for map component
export function MapSkeleton() {
  return (
    <div className="w-full h-full bg-muted/30 rounded-lg flex items-center justify-center relative">
      {/* Map loading animation */}
      <div className="absolute inset-0 rounded-lg overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/50 via-muted/30 to-muted/50 animate-pulse" />

        {/* Simulated map tiles */}
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-1 p-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton
              key={i}
              className="w-full h-full"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Loading text */}
      <div className="relative z-10 text-center space-y-2 bg-background/80 backdrop-blur-sm rounded-lg p-4">
        <Skeleton className="h-6 w-32 mx-auto" />
        <Skeleton className="h-4 w-48 mx-auto" />
      </div>
    </div>
  );
}

// Loading skeleton for drawing tools
export function DrawingToolsSkeleton() {
  return (
    <Card className="w-80 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Tool Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2 border-t">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>

        {/* Statistics */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton for address autocomplete
export function AddressAutocompleteSkeleton() {
  return (
    <Card className="w-80 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-4 h-4 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-10 w-full rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
        </div>
        <div className="pt-2 border-t space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </CardContent>
    </Card>
  );
}
