import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";

import ServerPostalCodesView from "@/components/postal-codes/server-postal-codes-view";
import { SiteHeader } from "@/components/site-header";
import { PostalCodesErrorBoundary } from "@/components/ui/error-boundaries";
import { VersionIndicatorSkeleton } from "@/components/ui/loading-skeleton";
import { PostalCodesViewSkeleton } from "@/components/ui/loading-skeletons";
import type { CountryCode } from "@/lib/config/countries";
import { DEFAULT_COUNTRY, isValidCountryCode } from "@/lib/config/countries";
import {
  getAreaGranularity,
  getAreaCountry,
  getAreaName,
  getVersion,
} from "@/lib/db/data-functions";

const VersionIndicator = dynamic(() =>
  import("@/components/shared/version-indicator").then((m) => ({
    default: m.VersionIndicator,
  }))
);

interface PostalCodesPageProps {
  params: Promise<{ areaId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Resolve granularity, country, and name from area or version snapshot — parallel fetch. */
async function resolveAreaMeta(
  areaId: number,
  versionId: number | null
): Promise<{ granularity: string; country: CountryCode; areaName: string | null }> {
  const isValidVersion =
    versionId !== null && versionId !== undefined && versionId > 0;

  const [granularity, country, areaName, version] = await Promise.all([
    getAreaGranularity(areaId),
    getAreaCountry(areaId),
    getAreaName(areaId),
    isValidVersion ? getVersion(areaId, versionId) : Promise.resolve(null),
  ]);

  const resolvedCountry: CountryCode =
    country && isValidCountryCode(country) ? country : DEFAULT_COUNTRY;

  if (isValidVersion && version?.snapshot) {
    const snap = version.snapshot as { granularity?: string };
    return {
      granularity: snap.granularity ?? "1digit",
      country: resolvedCountry,
      areaName,
    };
  }
  return {
    granularity: granularity ?? "1digit",
    country: resolvedCountry,
    areaName,
  };
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
      const meta = await resolveAreaMeta(areaId, versionId);
      granularity = meta.granularity;
    } catch (error) {
      console.error("Failed to fetch area metadata:", error);
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

  // Guard against NaN areaId (can happen during redirect race conditions)
  if (Number.isNaN(areaId) || areaId <= 0) {
    return (
      <>
        <SiteHeader />
        <div className="h-full" data-layout="fullscreen">
          <PostalCodesViewSkeleton />
        </div>
      </>
    );
  }

  let granularity = "1digit";
  let country: CountryCode = DEFAULT_COUNTRY;
  let areaName: string | null = null;
  try {
    const meta = await resolveAreaMeta(areaId, versionId);
    granularity = meta.granularity;
    country = meta.country;
    areaName = meta.areaName;
  } catch (error) {
    console.error("Failed to fetch area metadata:", error);
  }

  // Geodata is now fetched client-side via API routes to avoid
  // serializing ~9.6MB of GeoJSON into the RSC payload (TTFB: 1.3s → ~150ms)

  return (
    <>
      <SiteHeader title={areaName ?? "Gebietsmanagement"}>
        <Suspense fallback={<VersionIndicatorSkeleton />}>
          <VersionIndicator areaId={areaId} />
        </Suspense>
      </SiteHeader>
      <div className="h-full" data-layout="fullscreen">
        <PostalCodesErrorBoundary>
          <Suspense fallback={<PostalCodesViewSkeleton />}>
            <ServerPostalCodesView
              defaultGranularity={granularity}
              country={country}
              areaId={areaId}
              versionId={versionId!}
            />
          </Suspense>
        </PostalCodesErrorBoundary>
      </div>
    </>
  );
}
