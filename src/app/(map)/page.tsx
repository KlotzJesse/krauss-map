import { Suspense } from "react";

import { PostalCodesOverview } from "@/components/postal-codes/postal-codes-overview";
import { HomePageSkeleton } from "@/components/ui/loading-skeletons";

export default async function HomePage() {
  return (
    <Suspense fallback={<HomePageSkeleton />}>
      <PostalCodesOverview />
    </Suspense>
  );
}
