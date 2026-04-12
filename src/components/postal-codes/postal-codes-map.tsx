import type { InferSelectModel } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { memo } from "react";

import { BaseMap } from "@/components/shared/base-map";
import type {
  SelectAreaChanges,
  SelectAreaVersions,
  areaLayers,
} from "@/lib/schema/schema";
import { useMapView } from "@/lib/url-state/map-state";

const EMPTY_ARRAY: never[] = [];
type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

interface PostalCodesMapProps {
  data: FeatureCollection<Polygon | MultiPolygon>;
  statesData: FeatureCollection<Polygon | MultiPolygon>;
  onSearch?: (plz: string) => void;
  granularity?: string;
  onGranularityChange?: (granularity: string) => void;
  layers?: Layer[];
  activeLayerId?: number | null;
  areaId?: number | null;
  areaName?: string; // Optional area/project name for exports
  previewPostalCode?: string | null;
  addPostalCodesToLayer?: (layerId: number, codes: string[]) => Promise<void>;
  removePostalCodesFromLayer?: (
    layerId: number,
    codes: string[]
  ) => Promise<void>;
  isViewingVersion?: boolean;
  versionId: number | null;
  versions: SelectAreaVersions[];
  initialUndoRedoStatus: {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  };
  changes: SelectAreaChanges[];
}

export const PostalCodesMap = memo(function PostalCodesMap({
  data,
  statesData,
  onSearch,
  granularity,
  onGranularityChange,
  layers = EMPTY_ARRAY,
  activeLayerId = null,
  initialUndoRedoStatus,
  areaId = null,
  areaName,
  addPostalCodesToLayer,
  removePostalCodesFromLayer,
  isViewingVersion = false,
  versionId,
  versions,
  changes,
  previewPostalCode,
}: PostalCodesMapProps) {
  const [{ center, zoom }] = useMapView();

  return (
    <BaseMap
      data={data}
      layerId="postal-codes"
      onSearch={onSearch}
      center={center}
      zoom={zoom}
      statesData={statesData}
      granularity={granularity}
      onGranularityChange={onGranularityChange}
      layers={layers}
      activeLayerId={activeLayerId}
      areaId={areaId}
      areaName={areaName}
      previewPostalCode={previewPostalCode}
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
