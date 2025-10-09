#!/usr/bin/env node
/**
 * Script to diagnose and repair all recurring templates for a user
 * Usage: node scripts/diagnose-user-templates.js <userId>
 */

import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("❌ Error: CONVEX_URL not found in environment");
  process.exit(1);
}

const userId = process.argv[2];
if (!userId) {
  console.error("❌ Error: Please provide a userId");
  console.log("Usage: node scripts/diagnose-user-templates.js <userId>");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

async function main() {
  console.log("🔍 Scanning all recurring templates...");
  console.log(`User ID: ${userId}\n`);

  try {
    // Step 1: Scan all templates
    const scanResult = await client.query("diagnostics:scanUserRecurringTemplates", {
      userId,
    });

    console.log("📊 SCAN RESULTS:");
    console.log(`   Total templates: ${scanResult.summary.total}`);
    console.log(`   ✅ Healthy: ${scanResult.summary.healthy}`);
    console.log(`   ⚠️  Need repair: ${scanResult.summary.needsRepair}`);
    console.log(`   ❌ Missing category mappings: ${scanResult.summary.missingCategoryMappings}`);
    console.log(`   ⚠️  Missing payment mappings: ${scanResult.summary.missingPaymentMappings}`);
    console.log(`\n${scanResult.recommendation}\n`);

    if (scanResult.brokenTemplates.length > 0) {
      console.log("🔧 BROKEN TEMPLATES:");
      scanResult.brokenTemplates.forEach((t, i) => {
        console.log(`\n   ${i + 1}. ${t.description}`);
        console.log(`      ID: ${t.recurringTransactionId}`);
        t.issues.forEach((issue) => console.log(`      • ${issue}`));
      });
      console.log("");
    }

    // Step 2: If repairs needed, preview with dry run
    if (scanResult.summary.needsRepair > 0) {
      console.log("🔍 Running DRY RUN preview...\n");

      const dryRunResult = await client.mutation(
        "diagnostics:repairAllUserTemplates",
        {
          userId,
          dryRun: true,
        }
      );

      console.log("📋 DRY RUN RESULTS:");
      console.log(`   Would scan: ${dryRunResult.summary.scanned}`);
      console.log(`   Would repair: ${dryRunResult.summary.repaired}`);
      console.log(`   Would fail: ${dryRunResult.summary.failed}`);
      console.log(`   Would skip: ${dryRunResult.summary.skipped}`);
      console.log(`\n${dryRunResult.message}\n`);

      if (dryRunResult.summary.failed > 0) {
        console.log("⚠️  EXPECTED FAILURES:");
        dryRunResult.failures.forEach((f, i) => {
          console.log(`\n   ${i + 1}. ${f.description}`);
          console.log(`      ID: ${f.recurringTransactionId}`);
          console.log(`      Error: ${f.error}`);
        });
        console.log("");
      }

      // Step 3: Execute repairs
      console.log("🔧 Executing repairs...\n");

      const repairResult = await client.mutation(
        "diagnostics:repairAllUserTemplates",
        {
          userId,
          dryRun: false,
        }
      );

      console.log("✅ REPAIR RESULTS:");
      console.log(`   Scanned: ${repairResult.summary.scanned}`);
      console.log(`   ✅ Repaired: ${repairResult.summary.repaired}`);
      console.log(`   ❌ Failed: ${repairResult.summary.failed}`);
      console.log(`   ⏭️  Skipped: ${repairResult.summary.skipped}`);
      console.log(`\n${repairResult.message}\n`);

      if (repairResult.summary.failed > 0) {
        console.log("❌ FAILURES:");
        repairResult.failures.forEach((f, i) => {
          console.log(`\n   ${i + 1}. ${f.description}`);
          console.log(`      ID: ${f.recurringTransactionId}`);
          console.log(`      Error: ${f.error}`);
        });
        console.log("");
      }

      // Step 4: Verify all fixed
      console.log("🔍 Verifying repairs...\n");

      const verifyResult = await client.query(
        "diagnostics:scanUserRecurringTemplates",
        {
          userId,
        }
      );

      console.log("📊 FINAL STATUS:");
      console.log(`   Total templates: ${verifyResult.summary.total}`);
      console.log(`   ✅ Healthy: ${verifyResult.summary.healthy}`);
      console.log(`   ⚠️  Need repair: ${verifyResult.summary.needsRepair}`);
      console.log(`\n${verifyResult.recommendation}\n`);

      if (verifyResult.summary.needsRepair === 0) {
        console.log("🎉 All templates successfully repaired!\n");
      } else {
        console.log("⚠️  Some templates still need attention. Check the details above.\n");
      }
    } else {
      console.log("✅ All templates are healthy. No repairs needed!\n");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.data) {
      console.error("Details:", JSON.stringify(error.data, null, 2));
    }
    process.exit(1);
  }
}

main();

