import { Suspense } from "react";

import { PostalCodesErrorBoundary } from "@/components/ui/error-boundaries";
import { PostalCodesViewSkeleton } from "@/components/ui/loading-skeletons";
import type { CountryCode } from "@/lib/config/countries";
import { DEFAULT_COUNTRY } from "@/lib/config/countries";
import {
  getAreaMeta,
  getAreaCountries,
  getLayers,
  getVersionSummaries,
  getChangeSummaries,
  getUndoRedoStatus,
  getAreaTags,
} from "@/lib/db/data-functions";

import { PostalCodesViewClientWithLayers } from "./postal-codes-view-client-layers";

interface ServerPostalCodesViewProps {
  defaultGranularity: string;
  country?: CountryCode;
  areaId: number;
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ServerPostalCodesView({
  defaultGranularity,
  country = DEFAULT_COUNTRY,
  areaId,
  searchParamsPromise,
}: ServerPostalCodesViewProps) {
  // Guard against NaN areaId (can happen during redirect race conditions)
  if (!areaId || Number.isNaN(areaId)) {
    return <PostalCodesViewSkeleton />;
  }

  // Resolve versionId from searchParams here (inside Suspense boundary).
  // This keeps the page's static shell free of dynamic searchParams access.
  const searchParams = await searchParamsPromise;
  const versionIdRaw = Array.isArray(searchParams.versionId)
    ? searchParams.versionId[0]
    : searchParams.versionId;
  const versionId = versionIdRaw ? parseInt(versionIdRaw, 10) : null;

  // Server Component: initiate all fetches as promises
  // Geodata (postal codes) is now fetched client-side via API route
  // to avoid serializing ~9.6MB of GeoJSON into the RSC payload
  // States data also fetched client-side to avoid 246KB RSC payload bloat
  // getAreaMeta is already called by page.tsx — this hits the same "use cache"
  // entry (same function + same areaId arg), avoiding extra DB queries
  const areaMetaPromise = getAreaMeta(areaId);
  const areaCountriesPromise = getAreaCountries(areaId);
  const areaTagsPromise = getAreaTags(areaId);
  const layersPromise = getLayers(areaId);
  const versionsPromise = getVersionSummaries(areaId);
  const changesPromise = getChangeSummaries(areaId, { limit: 50 });
  const undoRedoStatusPromise = getUndoRedoStatus(areaId);

  return (
    <PostalCodesErrorBoundary>
      <Suspense fallback={<PostalCodesViewSkeleton />}>
        <PostalCodesViewClientWithLayers
          defaultGranularity={defaultGranularity}
          country={country}
          areaCountriesPromise={areaCountriesPromise}
          areaId={areaId}
          areaMetaPromise={areaMetaPromise}
          areaTagsPromise={areaTagsPromise}
          layersPromise={layersPromise}
          undoRedoStatusPromise={undoRedoStatusPromise}
          isViewingVersion={versionId !== null && versionId > 0}
          versionId={versionId}
          versionsPromise={versionsPromise}
          changesPromise={changesPromise}
        />
      </Suspense>
    </PostalCodesErrorBoundary>
  );
}
