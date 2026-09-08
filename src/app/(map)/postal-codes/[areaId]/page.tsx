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
import { getAreaCountries, getAreaMeta } from "@/lib/db/data-functions";

export const instant = true;

const VersionIndicator = dynamic(() =>
  import("@/components/shared/version-indicator").then((m) => ({
    default: m.VersionIndicator,
  }))
);

interface PostalCodesPageProps {
  params: Promise<{ areaId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Static metadata. Reading `params`/`searchParams` in `generateMetadata()`
 * makes the route's metadata blocking, which stops the whole route from being
 * prefetched — the `instant = true` contract above fails on it. The visible
 * title (area name) is rendered by <SiteHeader> inside the page, so the only
 * thing this gave up was a granularity string in the document title.
 */
export const metadata: Metadata = {
  title: "KRAUSS Gebietsmanagement - PLZ",
  description:
    "Interaktives Gebietsmanagement für Postleitzahlengebiete",
  openGraph: {
    title: "KRAUSS Gebietsmanagement - PLZ",
    description:
      "Interaktives Gebietsmanagement für Postleitzahlengebiete",
    type: "website",
  },
};

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
          key={`postal-index-${countryCode}`}
          rel="preload"
          href={`/api/postal-codes/index/${resolveGranularityForCountry(granularity, countryCode)}?country=${countryCode}`}
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
