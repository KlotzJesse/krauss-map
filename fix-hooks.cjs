const fs = require('fs');
let code = fs.readFileSync('src/components/shared/hooks/use-feature-selection.ts', 'utf8');
code = code.replace(/data\.features\.forEach\(\(feature\) => \{\n\s*if \(\n\s*feature\.geometry\.type/g, 'data.features.forEach((feature) => {\n        if (!feature || !feature.geometry) return;\n        if (\n          feature.geometry.type');
fs.writeFileSync('src/components/shared/hooks/use-feature-selection.ts', code);
