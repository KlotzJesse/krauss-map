import type { InferSelectModel } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { memo } from "react";

import { BaseMap } from "@/components/shared/base-map";
import type { CountryCode } from "@/lib/config/countries";
import type {
  ChangeSummary,
  VersionSummary,
  areaLayers,
} from "@/lib/schema/schema";
import { useMapView } from "@/lib/url-state/map-state";

const EMPTY_ARRAY: never[] = [];
type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

interface PostalCodesMapProps {
  data: FeatureCollection<Polygon | MultiPolygon>;
  granularity?: string;
  country?: CountryCode;
  onGranularityChange?: (granularity: string) => void;
  layers?: Layer[];
  activeLayerId?: number | null;
  areaId?: number | null;
  areaName?: string;
  areaDescription?: string | null;
  previewPostalCode?: string | null;
  onSetPreviewPostalCode?: (postalCode: string | null) => void;
  onZoomToLayer?: (layerId: number) => void;
  addPostalCodesToLayer?: (layerId: number, codes: string[]) => Promise<void>;
  removePostalCodesFromLayer?: (
    layerId: number,
    codes: string[]
  ) => Promise<void>;
  isViewingVersion?: boolean;
  versionId: number | null;
  versions: VersionSummary[];
  initialUndoRedoStatus: {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  };
  changes: ChangeSummary[];
}

export const PostalCodesMap = memo(function PostalCodesMap({
  data,
  granularity,
  country,
  onGranularityChange,
  layers = EMPTY_ARRAY,
  activeLayerId = null,
  initialUndoRedoStatus,
  areaId = null,
  areaName,
  areaDescription,
  addPostalCodesToLayer,
  removePostalCodesFromLayer,
  isViewingVersion = false,
  versionId,
  versions,
  changes,
  previewPostalCode,
  onSetPreviewPostalCode,
  onZoomToLayer,
}: PostalCodesMapProps) {
  const [{ center, zoom }] = useMapView();

  return (
    <BaseMap
      data={data}
      layerId="postal-codes"
      center={center}
      zoom={zoom}
      country={country}
      granularity={granularity}
      onGranularityChange={onGranularityChange}
      layers={layers}
      activeLayerId={activeLayerId}
      areaId={areaId}
      areaName={areaName}
      areaDescription={areaDescription}
      previewPostalCode={previewPostalCode}
      onSetPreviewPostalCode={onSetPreviewPostalCode}
      onZoomToLayer={onZoomToLayer}
      addPostalCodesToLayer={addPostalCodesToLayer}
      removePostalCodesFromLayer={removePostalCodesFromLayer}
      isViewingVersion={isViewingVersion}
      versionId={versionId}
      versions={versions}
      changes={changes}
      initialUndoRedoStatus={initialUndoRedoStatus}
    />
  );
});
