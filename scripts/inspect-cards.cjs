const { execSync } = require('child_process');

const userId = "k579d0k5gh9wq3x817k2mdty2s7g4mhy";
const functionName = "diagnostics/cardInspection:inspectCardData";

console.log(`Inspecting card data for user ${userId} in PRODUCTION...`);

try {
  const args = JSON.stringify({ userId });
  // Escape for Windows shell
  const escapedArgs = `"${args.replace(/"/g, '\\"')}"`;
  
  const command = `npx convex run ${functionName} ${escapedArgs} --prod`;
  
  console.log(`Executing: ${command}`);
  const output = execSync(command, { encoding: 'utf-8' });
  console.log(output);
} catch (error) {
  console.error("Inspection failed:");
  console.error(error.message);
  process.exit(1);
}




