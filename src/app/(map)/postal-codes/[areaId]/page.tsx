import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";

import ServerPostalCodesView from "@/components/postal-codes/server-postal-codes-view";
import { SiteHeader } from "@/components/site-header";
import { PostalCodesErrorBoundary } from "@/components/ui/error-boundaries";
import { VersionIndicatorSkeleton } from "@/components/ui/loading-skeleton";
import { PostalCodesViewSkeleton } from "@/components/ui/loading-skeletons";
import type { CountryCode } from "@/lib/config/countries";
import {
  DEFAULT_COUNTRY,
  isValidCountryCode,
  resolveGranularityForCountry,
} from "@/lib/config/countries";
import { getAreaCountries, getAreaMeta, getVersion } from "@/lib/db/data-functions";

export const instant = true;
export const prefetch = "allow-runtime";

const VersionIndicator = dynamic(() =>
  import("@/components/shared/version-indicator").then((m) => ({
    default: m.VersionIndicator,
  }))
);

interface PostalCodesPageProps {
  params: Promise<{ areaId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
      const isValidVersion = versionId !== null && versionId > 0;
      const [meta, version] = await Promise.all([
        getAreaMeta(areaId),
        isValidVersion ? getVersion(areaId, versionId!) : Promise.resolve(null),
      ]);
      if (isValidVersion && version?.snapshot) {
        const snap = version.snapshot as { granularity?: string };
        granularity = snap.granularity ?? "1digit";
      } else {
        granularity = meta.granularity ?? "1digit";
      }
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
  const { areaId: areaIdParam } = await params;

  const areaId = parseInt(areaIdParam, 10);

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

  // Get area meta using only static params — no searchParams access here.
  // This allows the static PPR shell (header + skeleton) to be prerendered.
  // versionId is resolved inside ServerPostalCodesView (inside Suspense).
  let granularity = "1digit";
  let country: CountryCode = DEFAULT_COUNTRY;
  let areaName: string | null = null;
  let areaCountries: CountryCode[] = [DEFAULT_COUNTRY];
  try {
    const [meta, countries] = await Promise.all([
      getAreaMeta(areaId),
      getAreaCountries(areaId),
    ]);
    granularity = meta.granularity ?? "1digit";
    country =
      meta.country && isValidCountryCode(meta.country)
        ? meta.country
        : DEFAULT_COUNTRY;
    areaCountries = countries.length > 0 ? countries : [country];
    areaName = meta.name;
  } catch (error) {
    console.error("Failed to fetch area metadata:", error);
  }

  return (
    <>
      {/* Preload map data APIs so fetches start during HTML streaming */}
      {areaCountries.map((countryCode) => (
        <link
          key={`states-${countryCode}`}
          rel="preload"
          href={`/api/states?country=${countryCode}`}
          as="fetch"
          crossOrigin="anonymous"
        />
      ))}
      {areaCountries.map((countryCode) => (
        <link
          key={`countries-${countryCode}`}
          rel="preload"
          href={`/api/countries?country=${countryCode}`}
          as="fetch"
          crossOrigin="anonymous"
        />
      ))}
      {areaCountries.map((countryCode) => (
        <link
          key={`geodata-${countryCode}`}
          rel="preload"
          href={`/api/geodata/${resolveGranularityForCountry(granularity, countryCode)}?country=${countryCode}`}
          as="fetch"
          crossOrigin="anonymous"
        />
      ))}
      <link
        rel="preconnect"
        href="https://tiles.versatiles.org"
        crossOrigin="anonymous"
      />
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
              searchParamsPromise={searchParams}
            />
          </Suspense>
        </PostalCodesErrorBoundary>
      </div>
    </>
  );
}
