const fs = require('fs');
let code = fs.readFileSync('src/lib/hooks/use-map-layers.ts', 'utf8');

const replacement = `      if (postalCodes.length > 0) {
        // Critical: Only proceed if the source actually exists in MapLibre
        if (!map.getSource(ids.sourceId)) return;
        
        layerIdsToKeep.add(layerFillId);`;

code = code.replace(/      if \(postalCodes\.length > 0\) \{\n        layerIdsToKeep\.add\(layerFillId\);/g, replacement);

fs.writeFileSync('src/lib/hooks/use-map-layers.ts', code);
