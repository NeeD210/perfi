const { execSync } = require('child_process');

const userId = "k579d0k5gh9wq3x817k2mdty2s7g4mhy";
const functionName = "migrations/verifyUser:verifyUserIntegrity";

console.log(`Running verification for user ${userId} in PRODUCTION...`);

try {
  // Prepare JSON argument
  const args = JSON.stringify({ userId });
  
  // Escape for Windows Command Prompt (cmd.exe)
  // Escape double quotes with backslash, wrap whole string in double quotes
  const escapedArgs = `"${args.replace(/"/g, '\\"')}"`;
  
  const command = `npx convex run ${functionName} ${escapedArgs} --prod`;
  
  console.log(`Executing: ${command}`);
  const output = execSync(command, { encoding: 'utf-8' });
  console.log(output);
} catch (error) {
  console.error("Verification failed to execute:");
  console.error(error.message);
  if (error.stdout) console.log(error.stdout);
  if (error.stderr) console.error(error.stderr);
  process.exit(1);
}
