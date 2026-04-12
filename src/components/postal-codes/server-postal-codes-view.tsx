import { Suspense } from "react";

import { PostalCodesErrorBoundary } from "@/components/ui/error-boundaries";
import { PostalCodesViewSkeleton } from "@/components/ui/loading-skeletons";
import {
  getAreaById,
  getLayers,
  getVersions,
  getChangeHistory,
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
  // Server Component: initiate all fetches as promises
  // Geodata (postal codes) is now fetched client-side via API route
  // to avoid serializing ~9.6MB of GeoJSON into the RSC payload
  // States data also fetched client-side to avoid 246KB RSC payload bloat
  const areaPromise = getAreaById(areaId);
  const layersPromise = getLayers(areaId);
  const versionsPromise = getVersions(areaId);
  const changesPromise = getChangeHistory(areaId, { limit: 50 });
  const undoRedoStatusPromise = getUndoRedoStatus(areaId);

  return (
    <PostalCodesErrorBoundary>
      <Suspense fallback={<PostalCodesViewSkeleton />}>
        <PostalCodesViewClientWithLayers
          defaultGranularity={defaultGranularity}
          areaId={areaId}
          areaPromise={areaPromise}
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
