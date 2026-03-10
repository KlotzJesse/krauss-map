const fs = require('fs');
let code = fs.readFileSync('src/lib/hooks/use-map-layers.ts', 'utf8');

code = code.replace(/allMapLayers\.forEach\(\(layer\) => \{/g, 'allMapLayers.forEach((layer: any) => {');
code = code.replace(/allLayers\.forEach\(\(layer\) => \{/g, 'allLayers.forEach((layer: any) => {');

fs.writeFileSync('src/lib/hooks/use-map-layers.ts', code);
