const fs = require("fs");
let code = fs.readFileSync(
  "src/app/(map)/postal-codes/[areaId]/page.tsx",
  "utf8"
);

// Replace imports: Add getAreaById, getVersion
code = code.replace(
  /import { db } from "@\/lib\/db";\\nimport { areas, areaVersions } from "@\/lib\/schema\/schema";/,
  `import { getAreaById, getVersion } from "@/lib/db/data-functions";`
);

// Promise.all in generateMetadata
code = code.replace(
  /const { areaId: areaIdParam } = await params;\\n  const search = await searchParams;/,
  `const [{ areaId: areaIdParam }, search] = await Promise.all([\n    params,\n    searchParams,\n  ]);`
);

// Promise.all in PostalCodesPage
code = code.replace(
  /const { areaId: areaIdParam } = await params;\\n  const search = await searchParams;/,
  `const [{ areaId: areaIdParam }, search] = await Promise.all([\n    params,\n    searchParams,\n  ]);`
);

// Replace DB queries in generateMetadata and PostalCodesPage
code = code.replace(
  /await db\.query\.areaVersions\.findFirst\\({\\s*where: and\\(\\s*eq\\(areaVersions\.areaId, areaId\\),\\s*eq\\(areaVersions\.versionNumber, versionId!\\)\\s*\\),\\s*}\\)/g,
  `await getVersion(areaId, versionId!)`
);

code = code.replace(
  /await db\.query\.areas\.findFirst\\({\\s*where: eq\\(areas\.id, areaId\\),\\s*}\\)/g,
  `await getAreaById(areaId)`
);

// Clean unused imports
code = code.replace(/import { eq, and } from "drizzle-orm";\n/, "");

fs.writeFileSync("src/app/(map)/postal-codes/[areaId]/page.tsx", code);
console.log("Fixed page!");
