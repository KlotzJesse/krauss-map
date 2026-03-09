import { eq, and } from "drizzle-orm";
import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { Suspense } from "react";

import { SiteHeader } from "@/components/site-header";
import { PostalCodesErrorBoundary } from "@/components/ui/error-boundaries";
import { SiteHeaderSkeleton } from "@/components/ui/loading-skeleton";
import { PostalCodesViewSkeleton } from "@/components/ui/loading-skeletons";
import { db } from "@/lib/db";
import { areas, areaVersions } from "@/lib/schema/schema";

const ServerPostalCodesView = nextDynamic(
  () => import("@/components/postal-codes/server-postal-codes-view"),
  {
    loading: () => <PostalCodesViewSkeleton />,
    ssr: true,
  }
);

interface PostalCodesPageProps {
  params: Promise<{ areaId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: PostalCodesPageProps): Promise<Metadata> {
  const { areaId: areaIdParam } = await params;
  const search = await searchParams;

  const areaId = parseInt(areaIdParam, 10);

  // Get granularity from area or version
  let granularity = "1digit";

  if (!isNaN(areaId)) {
    try {
      // Check if viewing a version
      if (search.versionId) {
        const versionIdValue = Array.isArray(search.versionId)
          ? search.versionId[0]
          : search.versionId;
        const versionId = parseInt(versionIdValue, 10);

        if (!isNaN(versionId)) {
          const version = await db.query.areaVersions.findFirst({
            where: and(
              eq(areaVersions.areaId, areaId),
              eq(areaVersions.versionNumber, versionId)
            ),
          });

          if (version && version.snapshot) {
            const snapshot = version.snapshot as { granularity?: string };
            granularity = snapshot.granularity || "1digit";
          }
        }
      } else {
        // Get granularity from area
        const area = await db.query.areas.findFirst({
          where: eq(areas.id, areaId),
        });

        if (area && area.granularity) {
          granularity = area.granularity;
        }
      }
    } catch (error) {
      console.error("Failed to fetch granularity:", error);
    }
  }

  return {
    title: `KRAUSS Gebietsmanagement - ${granularity.toUpperCase()} PLZ`,
    description: `Interaktives Gebietsmanagement für deutsche Postleitzahlen mit ${granularity} Granularität`,
    openGraph: {
      title: `KRAUSS Gebietsmanagement - ${granularity.toUpperCase()} PLZ`,
      description: `Interaktives Gebietsmanagement für deutsche Postleitzahlen mit ${granularity} Granularität`,
      type: "website",
    },
  };
}

export default async function PostalCodesPage({
  params,
  searchParams,
}: PostalCodesPageProps) {
  const { areaId: areaIdParam } = await params;
  const search = await searchParams;

  // Extract area ID from route params
  const areaId = parseInt(areaIdParam, 10);

  // Note: activeLayerId is now handled purely client-side via URL state
  // to prevent server re-renders on layer switching
  const versionId = search.versionId
    ? parseInt(search.versionId as string, 10)
    : null;

  // Determine granularity from area or version
  let granularity: string = "1digit";

  if (areaId && areaId > 0) {
    try {
      // Check if viewing a version
      if (versionId && versionId > 0) {
        const version = await db.query.areaVersions.findFirst({
          where: and(
            eq(areaVersions.areaId, areaId),
            eq(areaVersions.versionNumber, versionId)
          ),
        });

        if (version && version.snapshot) {
          const snapshot = version.snapshot as { granularity?: string };
          granularity = snapshot.granularity || "1digit";
        }
      } else {
        // Get granularity from current area
        const area = await db.query.areas.findFirst({
          where: eq(areas.id, areaId),
        });

        if (area && area.granularity) {
          granularity = area.granularity;
        }
      }
    } catch (error) {
      console.error("Failed to fetch granularity:", error);
    }
  }

  return (
    <>
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader areaId={areaId} />
      </Suspense>
      <div className="h-full px-4 lg:px-6">
        <PostalCodesErrorBoundary>
          <Suspense fallback={<PostalCodesViewSkeleton />}>
            <ServerPostalCodesView
              defaultGranularity={granularity}
              areaId={areaId}
              versionId={versionId!}
            />
          </Suspense>
        </PostalCodesErrorBoundary>
      </div>
    </>
  );
}
