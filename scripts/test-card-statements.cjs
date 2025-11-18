const { execSync } = require('child_process');

const functionName = "ledger/testCardStatements:runCardStatementsTest";

console.log(`Running Card Statements Phase 5 Test...`);

try {
  // We don't need arguments for this one as it generates its own test data
  const command = `npx convex run ${functionName} --prod`;
  
  console.log(`Executing: ${command}`);
  const output = execSync(command, { encoding: 'utf-8' });
  console.log(output);
  
  if (output.includes('"success": false')) {
      console.error("Test FAILED");
      process.exit(1);
  }
  
} catch (error) {
  console.error("Test failed to execute:");
  console.error(error.message);
  if (error.stdout) console.log(error.stdout);
  if (error.stderr) console.error(error.stderr);
  process.exit(1);
}

