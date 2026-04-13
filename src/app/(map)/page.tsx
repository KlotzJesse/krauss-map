import { Suspense } from "react";

import { PostalCodesOverview } from "@/components/postal-codes/postal-codes-overview";
import { SiteHeader } from "@/components/site-header";
import { HomePageSkeleton } from "@/components/ui/loading-skeletons";

export default async function HomePage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<HomePageSkeleton />}>
        <PostalCodesOverview />
      </Suspense>
    </>
  );
}
