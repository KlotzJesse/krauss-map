import type { InferSelectModel } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type { CountryCode } from "@/lib/config/countries";
import type {
  VersionSummary,
  ChangeSummary,
  areaLayers,
} from "@/lib/schema/schema";

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

export interface BaseMapProps {
  data: FeatureCollection<Polygon | MultiPolygon>;
  layerId: string;
  center?: [number, number];
  zoom?: number;
  country?: CountryCode;
  granularity?: string;
  onGranularityChange?: (granularity: string) => void;
  layers: Layer[];
  activeLayerId: number | null;
  areaId: number | null;
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
  isViewingVersion: boolean;
  versionId: number | null;
  versions: VersionSummary[];
  changes: ChangeSummary[];
  initialUndoRedoStatus: {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  };
}

export interface MapErrorMessageProps {
  message: string;
}

export interface ToggleButtonProps {
  onClick: () => void;
  title: string;
  ariaLabel: string;
  children: React.ReactNode;
}
