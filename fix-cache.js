const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/app/actions/*.ts');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/,\\s*revalidatePath/g, '');
  content = content.replace(/\\s*revalidatePath,\\s*/g, ' ');
  content = content.replace(/revalidatePath,\\s*/g, '');
  content = content.replace(/import\\s*{\\s*revalidatePath\\s*}\\s*from\\s*"next\\/cache";\\n?/g, '');
  content = content.replace(/revalidatePath\\([^)]+\\);?\\s*\\n/g, '');
  fs.writeFileSync(file, content);
});
console.log('Fixed caching!');
