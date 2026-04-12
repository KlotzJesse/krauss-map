import type { Metadata } from "next";
import { Suspense } from "react";

import ServerPostalCodesView from "@/components/postal-codes/server-postal-codes-view";
import { SiteHeader } from "@/components/site-header";
import { PostalCodesErrorBoundary } from "@/components/ui/error-boundaries";
import { SiteHeaderSkeleton } from "@/components/ui/loading-skeleton";
import { PostalCodesViewSkeleton } from "@/components/ui/loading-skeletons";
import { getAreaGranularity, getVersion } from "@/lib/db/data-functions";

interface PostalCodesPageProps {
  params: Promise<{ areaId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Resolve granularity from area or version snapshot — parallel fetch both. */
async function resolveGranularity(
  areaId: number,
  versionId: number | null
): Promise<string> {
  const isValidVersion =
    versionId !== null && versionId !== undefined && versionId > 0;

  // Always prefetch area granularity (lightweight — no joins).
  // Fire version fetch in parallel when applicable.
  const [granularity, version] = await Promise.all([
    getAreaGranularity(areaId),
    isValidVersion ? getVersion(areaId, versionId) : Promise.resolve(null),
  ]);

  if (isValidVersion && version?.snapshot) {
    const snap = version.snapshot as { granularity?: string };
    return snap.granularity ?? "1digit";
  }
  return granularity ?? "1digit";
}

export async function generateMetadata({
  params,
  searchParams,
}: PostalCodesPageProps): Promise<Metadata> {
  const [{ areaId: areaIdParam }, search] = await Promise.all([
    params,
    searchParams,
  ]);
  const areaId = parseInt(areaIdParam, 10);
  let granularity = "1digit";

  if (!isNaN(areaId)) {
    try {
      const versionIdRaw = Array.isArray(search.versionId)
        ? search.versionId[0]
        : search.versionId;
      const versionId = versionIdRaw ? parseInt(versionIdRaw, 10) : null;
      granularity = await resolveGranularity(areaId, versionId);
    } catch (error) {
      console.error("Failed to fetch granularity for metadata:", error);
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
  const [{ areaId: areaIdParam }, search] = await Promise.all([
    params,
    searchParams,
  ]);

  const areaId = parseInt(areaIdParam, 10);
  const versionId = search.versionId
    ? parseInt(search.versionId as string, 10)
    : null;

  let granularity: string = "1digit";

  if (areaId && areaId > 0) {
    try {
      granularity = await resolveGranularity(areaId, versionId);
    } catch (error) {
      console.error("Failed to fetch granularity:", error);
    }
  }

  // Geodata is now fetched client-side via API routes to avoid
  // serializing ~9.6MB of GeoJSON into the RSC payload (TTFB: 1.3s → ~150ms)

  return (
    <>
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader areaId={areaId} />
      </Suspense>
      <div className="h-full" data-layout="fullscreen">
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
