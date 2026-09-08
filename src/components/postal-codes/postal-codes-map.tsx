import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { memo } from "react";

import { BaseMap } from "@/components/shared/base-map";
import type { CountryCode } from "@/lib/config/countries";
import type { PostalCodeIndex } from "@/lib/hooks/use-postal-code-index";
import type { ChangeSummary, VersionSummary } from "@/lib/schema/schema";
import type { Layer } from "@/lib/types/area-types";

const EMPTY_ARRAY: never[] = [];

interface PostalCodesMapProps {
  data: FeatureCollection<Polygon | MultiPolygon>;
  index: PostalCodeIndex;
  granularity?: string;
  country?: CountryCode;
  countries?: CountryCode[];
  onGranularityChange?: (granularity: string) => void;
  layers?: Layer[];
  activeLayerId?: number | null;
  areaId?: number | null;
  areaName?: string;
  areaDescription?: string | null;
  areaTags?: { id: number; name: string; color: string }[];
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
  index,
  granularity,
  country,
  countries,
  onGranularityChange,
  layers = EMPTY_ARRAY,
  activeLayerId = null,
  initialUndoRedoStatus,
  areaId = null,
  areaName,
  areaDescription,
  areaTags,
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
  return (
    <BaseMap
      data={data}
      index={index}
      layerId="postal-codes"
      country={country}
      countries={countries}
      granularity={granularity}
      onGranularityChange={onGranularityChange}
      layers={layers}
      activeLayerId={activeLayerId}
      areaId={areaId}
      areaName={areaName}
      areaDescription={areaDescription}
      areaTags={areaTags}
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
