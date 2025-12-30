const { execSync } = require('child_process');

console.log('Running backfill for cards with closingDay = 31...');

try {
  const args = JSON.stringify({});
  const escapedArgs = `"${args.replace(/"/g, '\\"')}"`;
  
  console.log('Executing backfill...');
  const output = execSync(`npx convex run migrations/index:backfillCardStatementsForClosingDay31 ${escapedArgs}`, { 
    encoding: 'utf-8',
    stdio: 'inherit'
  });
  
  console.log('Backfill completed successfully.');
} catch (error) {
  console.error('Backfill failed:', error.message);
  process.exit(1);
}

