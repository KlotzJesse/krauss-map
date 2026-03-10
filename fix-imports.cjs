const fs = require("fs");
[
  "src/app/actions/granularity-actions.ts",
  "src/app/actions/layer-actions.ts",
  "src/app/actions/version-actions.ts",
].forEach((f) => {
  let c = fs.readFileSync(f, "utf8");
  c = c.replace(/import\\s*{\\s*,/g, "import {");
  fs.writeFileSync(f, c);
});
