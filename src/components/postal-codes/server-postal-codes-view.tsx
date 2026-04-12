import { Suspense } from "react";

import { PostalCodesErrorBoundary } from "@/components/ui/error-boundaries";
import { PostalCodesViewSkeleton } from "@/components/ui/loading-skeletons";
import {
  getAreaName,
  getLayers,
  getVersionSummaries,
  getChangeSummaries,
  getUndoRedoStatus,
} from "@/lib/db/data-functions";

import { PostalCodesViewClientWithLayers } from "./postal-codes-view-client-layers";

interface ServerPostalCodesViewProps {
  defaultGranularity: string;

  areaId: number;

  versionId: number;
}

export default async function ServerPostalCodesView({
  defaultGranularity,
  areaId,
  versionId,
}: ServerPostalCodesViewProps) {
  // Guard against NaN areaId (can happen during redirect race conditions)
  if (!areaId || Number.isNaN(areaId)) {
    return <PostalCodesViewSkeleton />;
  }

  // Server Component: initiate all fetches as promises
  // Geodata (postal codes) is now fetched client-side via API route
  // to avoid serializing ~9.6MB of GeoJSON into the RSC payload
  // States data also fetched client-side to avoid 246KB RSC payload bloat
  const areaNamePromise = getAreaName(areaId);
  const layersPromise = getLayers(areaId);
  const versionsPromise = getVersionSummaries(areaId);
  const changesPromise = getChangeSummaries(areaId, { limit: 50 });
  const undoRedoStatusPromise = getUndoRedoStatus(areaId);

  return (
    <PostalCodesErrorBoundary>
      <Suspense fallback={<PostalCodesViewSkeleton />}>
        <PostalCodesViewClientWithLayers
          defaultGranularity={defaultGranularity}
          areaId={areaId}
          areaNamePromise={areaNamePromise}
          layersPromise={layersPromise}
          undoRedoStatusPromise={undoRedoStatusPromise}
          isViewingVersion={false}
          versionId={versionId || null}
          versionsPromise={versionsPromise}
          changesPromise={changesPromise}
        />
      </Suspense>
    </PostalCodesErrorBoundary>
  );
}
