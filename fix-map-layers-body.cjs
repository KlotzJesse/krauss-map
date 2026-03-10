const fs = require("fs");
let code = fs.readFileSync("src/lib/hooks/use-map-layers.ts", "utf8");

const regex =
  /\/\/ Initialize area layers using MapLibre filters[\s\S]*?(?:isMapLoaded,\n\s*layers,\n\s*ids\.hoverLayerId,\n\s*activeLayerId,\n\s*\]\);)/m;

const replacement = `// Initialize area layers using MapLibre filters (highly optimized)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !layers) {
      return;
    }

    const layerIdsToKeep = new Set();

    layers.forEach((layer) => {
      const layerFillId = \`area-layer-\${layer.id}-fill\`;
      const layerBorderId = \`area-layer-\${layer.id}-border\`;

      const postalCodes = layer.postalCodes?.map((pc) => pc.postalCode) || [];

      if (postalCodes.length > 0) {
        layerIdsToKeep.add(layerFillId);
        layerIdsToKeep.add(layerBorderId);
      
        const matchFilter = [
          "match",
          ["coalesce", ["get", "code"], ["get", "plz"], ["get", "postalCode"], ""],
          postalCodes,
          true,
          false
        ];

        const opacity = layer.opacity / 100;
        const isVisible = layer.isVisible === "true";
        const isActive = activeLayerId === layer.id;

        if (!map.getLayer(layerFillId)) {
          map.addLayer(
            {
              id: layerFillId,
              type: "fill",
              source: ids.sourceId,
              filter: matchFilter as any,
              paint: {
                "fill-color": layer.color,
                "fill-opacity": isVisible ? opacity * 0.6 : 0,
              },
              layout: {
                visibility: isVisible ? "visible" : "none",
              },
            } as any,
            ids.hoverLayerId
          );
        } else {
          // Update existing layer properties
          map.setFilter(layerFillId, matchFilter as any);
          map.setPaintProperty(layerFillId, "fill-color", layer.color);
          map.setPaintProperty(layerFillId, "fill-opacity", isVisible ? opacity * 0.6 : 0);
          map.setLayoutProperty(layerFillId, "visibility", isVisible ? "visible" : "none");
        }

        if (!map.getLayer(layerBorderId)) {
          map.addLayer(
            {
              id: layerBorderId,
              type: "line",
              source: ids.sourceId,
              filter: matchFilter as any,
              paint: {
                "line-color": layer.color,
                "line-width": isActive ? 2.5 : 1.5,
                "line-opacity": isVisible ? (isActive ? 0.9 : 0.7) : 0,
              },
              layout: {
                "line-cap": "round",
                "line-join": "round",
                visibility: isVisible ? "visible" : "none",
              },
            } as any,
            ids.hoverLayerId
          );
        } else {
          // Update existing layer properties
          map.setFilter(layerBorderId, matchFilter as any);
          map.setPaintProperty(layerBorderId, "line-color", layer.color);
          map.setPaintProperty(layerBorderId, "line-width", isActive ? 2.5 : 1.5);
          map.setPaintProperty(layerBorderId, "line-opacity", isVisible ? (isActive ? 0.9 : 0.7) : 0);
          map.setLayoutProperty(layerBorderId, "visibility", isVisible ? "visible" : "none");
        }
      }
    });

    // Cleanup phase: Remove any dynamically created layers that no longer exist in the standard set
    const allLayers = map.getStyle()?.layers || [];
    allLayers.forEach((layer) => {
      if (layer.id && layer.id.startsWith("area-layer-")) {
        if (!layerIdsToKeep.has(layer.id)) {
          try { map.removeLayer(layer.id); } catch (e) {}
        }
      }
    });

    // We do NOT return a cleanup function here. The previous effect cleans up the main sources which in turn cleans up the bound layers.
  }, [
    mapRef,
    isMapLoaded,
    layers,
    ids.hoverLayerId,
    ids.sourceId,
    activeLayerId,
  ]);`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync("src/lib/hooks/use-map-layers.ts", code);
  console.log("REPLACED SUCCESS");
} else {
  console.log("REGEX FAILED");
}
