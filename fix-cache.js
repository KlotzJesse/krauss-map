import fs from "node:fs";

import { sync } from "glob";

const files = sync("src/app/actions/*.ts");

for (const file of files) {
  let content = fs.readFileSync(file, "utf-8");
  content = content.replace(/,\\s*revalidatePath/g, "");
  content = content.replace(/\\s*revalidatePath,\\s*/g, " ");
  content = content.replace(/revalidatePath,\\s*/g, "");
  content = content.replace(
    new RegExp(
      'import\\\\s*{\\\\s*revalidatePath\\\\s*}\\\\s*from\\\\s*"next/cache";\\\\n?',
      "g"
    ),
    ""
  );
  content = content.replace(/revalidatePath\\([^)]+\\);?\\s*\\n/g, "");
  fs.writeFileSync(file, content);
}
console.log("Fixed caching!");
