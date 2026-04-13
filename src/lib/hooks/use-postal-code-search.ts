import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { toast } from "sonner";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";

interface PostalCodeSearchProps {
  data: FeatureCollection<MultiPolygon | Polygon>;
}

export function usePostalCodeSearch({ data: _data }: PostalCodeSearchProps) {
  // searchPostalCodes is called but results are not consumed by any component.
  // Keep the function signature stable for callers but skip expensive work.
  const searchPostalCodes = useStableCallback((_query: string) => {
    // No-op: search results are not displayed anywhere in the current UI
  });

  const selectPostalCode = useStableCallback((postalCode: string) => {
    toast.success(`PLZ ${postalCode} gefunden`, {
      duration: 2000,
    });

    return postalCode;
  });

  return {
    searchPostalCodes,
    selectPostalCode,
  };
}
