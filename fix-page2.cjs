const fs = require("fs");
let code = fs.readFileSync(
  "src/app/(map)/postal-codes/[areaId]/page.tsx",
  "utf8"
);

code = code.replace(
  'import { db } from "@/lib/db";\nimport { areas, areaVersions } from "@/lib/schema/schema";',
  'import { getAreaById, getVersion } from "@/lib/db/data-functions";'
);

code = code.replace('import { eq, and } from "drizzle-orm";', "");

code = code.replace(
  "const { areaId: areaIdParam } = await params;\n  const search = await searchParams;",
  "const [{ areaId: areaIdParam }, search] = await Promise.all([\n    params,\n    searchParams,\n  ]);"
);

code = code.replace(
  "const { areaId: areaIdParam } = await params;\n  const search = await searchParams;",
  "const [{ areaId: areaIdParam }, search] = await Promise.all([\n    params,\n    searchParams,\n  ]);"
);

code = code.replace(
  /await db\.query\.areaVersions\.findFirst\(\{\s*where: and\(\s*eq\(areaVersions\.areaId,\s*areaId\),\s*eq\(areaVersions\.versionNumber,\s*versionId!\)\s*\),\s*\}\)/g,
  "await getVersion(areaId, versionId!)"
);

code = code.replace(
  /await db\.query\.areas\.findFirst\(\{\s*where:\s*eq\(areas\.id,\s*areaId\),\s*\}\)/g,
  "await getAreaById(areaId)"
);

fs.writeFileSync("src/app/(map)/postal-codes/[areaId]/page.tsx", code);
