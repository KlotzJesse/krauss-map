const fs = require("fs");
let code = fs.readFileSync("src/lib/hooks/use-map-layers.ts", "utf8");

code = code.replace(
  /      sourceIds.forEach\(\(id\) => \{\n        try {\n          if \(map\.getSource\(id\)\) \{\n            map\.removeSource\(id\);\n          \}\n        \} catch \(error\) \{/g,
  `      sourceIds.forEach((id) => {
        try {
          if (map.getSource(id)) {
            // First carefully find & remove ANY dynamic layers still attached to this source
            const allMapLayers = map.getStyle()?.layers || [];
            allMapLayers.forEach((layer) => {
              if ('source' in layer && layer.source === id) {
                try {
                  if (map.getLayer(layer.id)) map.removeLayer(layer.id);
                } catch (e) {}
              }
            });
            map.removeSource(id);
          }
        } catch (error) {`
);

fs.writeFileSync("src/lib/hooks/use-map-layers.ts", code);
