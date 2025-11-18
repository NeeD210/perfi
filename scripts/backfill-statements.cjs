const { execSync } = require('child_process');

const userId = "k579d0k5gh9wq3x817k2mdty2s7g4mhy";

console.log(`Fixing card data and backfilling statements for user ${userId}...`);

try {
  // 1. Fix Data & Get Accounts
  console.log("Step 1: Fixing card metadata...");
  const fixArgs = JSON.stringify({ userId });
  const escapedFixArgs = `"${fixArgs.replace(/"/g, '\\"')}"`;
  const output = execSync(`npx convex run migrations/fixCardData:fixAndBackfillStatements ${escapedFixArgs} --prod`, { encoding: 'utf-8' });
  
  // Parse output (might need cleaning if logs are present)
  // Convex run output is usually pure JSON if successful
  const cards = JSON.parse(output);
  console.log(`Found ${cards.length} cards to process.`);

  // 2. Calculate Statements for last month (October 2025)
  const year = 2025;
  const month = 9; // October (0-indexed)
  
  for (const card of cards) {
      const targetDate = new Date(Date.UTC(year, month, 1));
      // Set day, clamping to max days in month
      const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const actualDay = Math.min(card.closingDay, maxDay);
      targetDate.setUTCDate(actualDay);
      
      const ts = targetDate.getTime();
      
      console.log(`Step 2: Calculating statement for Account ${card.accountId} (Closing Day ${card.closingDay}) on ${targetDate.toISOString()}...`);
      
      const args = JSON.stringify({ cardAccountId: card.accountId, closingDate: ts });
      const escaped = `"${args.replace(/"/g, '\\"')}"`;
      
      try {
        execSync(`npx convex run ledger/cardStatements:calculateStatement ${escaped} --prod`, { stdio: 'inherit' });
        console.log("Success.");
      } catch (e) {
        console.log("Calculation failed (check logs above).");
      }
  }
  
} catch (error) {
  console.error("Script failed:", error);
}
