const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const userId = "k579d0k5gh9wq3x817k2mdty2s7g4mhy";
const functionName = "migrations/identifyMissing:getMissingMappings";
const outputFile = "missing_mappings.csv";

console.log(`Fetching missing mappings for user ${userId} from PRODUCTION...`);

try {
  // JSON args
  const args = JSON.stringify({ userId });
  const escapedArgs = `"${args.replace(/"/g, '\\"')}"`;
  
  const command = `npx convex run ${functionName} ${escapedArgs} --prod`;
  
  console.log(`Executing: ${command}`);
  
  // The output will be the CSV string wrapped in quotes because it's a string return value from Convex
  // We need to handle that.
  let output = execSync(command, { encoding: 'utf-8' });
  
  // Convex run output might include some logs or formatting. 
  // Usually it prints the return value directly if it's a primitive.
  // If it's a string, it might be printed as: "Expense ID,..."
  
  // Clean up output - remove newlines at start/end
  output = output.trim();
  
  // If it starts and ends with quotes (JSON string representation), strip them
  // But CSV content itself has newlines, so let's be careful.
  // Convex CLI often outputs just the value.
  
  // If the output is wrapped in quotes (like a JSON string), try to parse it.
  if (output.startsWith('"') && output.endsWith('"')) {
      try {
        output = JSON.parse(output);
      } catch (e) {
        // failed to parse as JSON string, assume raw
      }
  }

  fs.writeFileSync(outputFile, output);
  console.log(`Successfully wrote ${output.length} bytes to ${outputFile}`);
  
} catch (error) {
  console.error("Failed to fetch missing mappings:");
  console.error(error.message);
  if (error.stdout) console.log(error.stdout);
  process.exit(1);
}

