import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
            <Card key={i} className="hover:shadow-lg transition-shadow">
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

// Loading skeleton for postal codes view - matches actual layout structure
export function PostalCodesViewSkeleton() {
  return (
    <div className="h-full w-full relative">
      {/* Main Controls Bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Granularity Selector */}
        <Skeleton className="h-10 w-40" />

        {/* Layer Selector */}
        <Skeleton className="h-10 w-48" />

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <Skeleton className="h-10 w-10 rounded" />
          <Skeleton className="h-10 w-10 rounded" />
          <Skeleton className="h-10 w-10 rounded" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Map and Sidebar Container */}
      <div className="relative h-[calc(100%-4rem)]">
        {/* Left Sidebar - Address Search & Drawing Tools */}
        <div className="absolute left-0 top-0 z-10 space-y-4 w-80">
          {/* Address Search Card */}
          <Card className="shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Skeleton className="w-4 h-4 rounded" />
                <Skeleton className="h-5 w-32" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full rounded-md" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </CardContent>
          </Card>

          {/* Drawing Tools Card */}
          <Card className="shadow-lg">
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
              {/* Tool Buttons Grid */}
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-9 w-full rounded" />
                ))}
              </div>

              {/* Search Tools */}
              <div className="space-y-2 pt-2 border-t">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>

              {/* Statistics */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar - Layer Management */}
        <div className="absolute right-0 top-0 z-10 w-80">
          <Card className="shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 border rounded"
                  >
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="w-8 h-8 rounded" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Map */}
        <div className="w-full h-full bg-muted/30 rounded-lg flex items-center justify-center">
          <div className="text-center space-y-2">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
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
