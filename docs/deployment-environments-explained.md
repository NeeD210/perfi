# Convex Deployment Environments Explained

## Your Current Setup

Based on your `.env.local` file and deployment logs:

### Dev Environment
- **Name:** `majestic-squirrel-400`
- **URL:** `https://majestic-squirrel-400.convex.cloud`
- **Configured in:** `.env.local`
- **Used by:** `npx convex dev` command
- **Env Var:** `CONVEX_DEPLOYMENT=dev:majestic-squirrel-400`

### Production Environment  
- **Name:** **Unknown (needs to be identified)**
- **Suspected:** May be `graceful-spaniel-507` OR a separate prod deployment
- **Used by:** `npx convex deploy` command (without dev flag)

---

## The Confusion Explained

When you run `npx convex deploy` (without any flags), Convex deploys to your **PRODUCTION** deployment by default, NOT dev.

However, we saw deployments going to `graceful-spaniel-507.convex.cloud` during our testing. This suggests:

**Possibility 1:** `graceful-spaniel-507` IS your production deployment  
**Possibility 2:** Your project configuration is set to deploy to that specific deployment  
**Possibility 3:** That's actually a third environment (preview/staging)

---

## How to Identify Your True Production

### Option 1: Check Convex Dashboard

1. Go to https://dashboard.convex.dev
2. Find your project
3. You should see TWO deployments:
   - **Dev:** majestic-squirrel-400 ✅ (confirmed)
   - **Prod:** ??? (need to identify)

Look for a deployment marked as "Production" or "Prod"

### Option 2: Use Convex CLI

```bash
# This will show your project's deployments
npx convex projects ls

# Or check current deployment info
npx convex env ls
```

### Option 3: Check Package.json Scripts

Sometimes deployments are configured in npm scripts:

```bash
# Check if there's a deploy script
cat package.json | Select-String "deploy"
```

---

## How Convex Deploy Works

### Default Behavior

```bash
npx convex deploy
# Deploys to: PRODUCTION (your team's prod deployment)

npx convex dev
# Uses: DEVELOPMENT (from .env.local: dev:majestic-squirrel-400)
```

### The `.env.local` File

```env
CONVEX_DEPLOYMENT=dev:majestic-squirrel-400  # Only affects `npx convex dev`
VITE_CONVEX_URL=https://majestic-squirrel-400.convex.cloud  # Frontend uses this
```

**Key Point:** `.env.local` ONLY affects:
- `npx convex dev` (sets dev deployment)
- Your frontend app (uses VITE_CONVEX_URL)

It does NOT affect `npx convex deploy` which always goes to production.

---

## What Happened During Our Testing

When we ran:
```bash
npx convex deploy
```

It deployed to `graceful-spaniel-507.convex.cloud`

This means **ONE of the following is true:**

1. ✅ `graceful-spaniel-507` **IS** your production deployment
2. ⚠️ You were accidentally deploying to the wrong environment
3. 🤔 Your project has a non-standard configuration

---

## How to Deploy to ACTUAL Production

### Step 1: Identify Your Production Deployment

**Check Convex Dashboard:**
- Go to dashboard.convex.dev
- Find your project
- Identify which deployment is marked "Production"
- Note the URL (e.g., `https://XXX.convex.cloud`)

### Step 2: Ensure You're Deploying to Production

**Method A: Use Default Behavior (Recommended)**

```bash
# This always deploys to your project's production deployment
npx convex deploy

# The CLI will tell you where it's deploying:
# "Deployed Convex functions to https://YOUR-PROD-URL.convex.cloud"
```

**Method B: Explicitly Set Production Deployment (if needed)**

If you need to override, you can set environment variables:

```bash
# For this session only:
$env:CONVEX_DEPLOYMENT = "prod:YOUR-PROD-NAME"
npx convex deploy

# Or create a separate .env.production file:
# .env.production
CONVEX_DEPLOYMENT=prod:your-production-deployment-name
```

Then:
```bash
npx convex deploy --env-file .env.production
```

---

## Recommended Approach for You

### Investigation First

```bash
# 1. List your deployments
npx convex deployments ls

# 2. Check current configuration
npx convex env get CONVEX_DEPLOYMENT

# 3. Review where our tests deployed to
# (We saw: graceful-spaniel-507.convex.cloud)
```

### Based on Investigation

**If `graceful-spaniel-507` IS production:**
```bash
# You've already been testing in production! 😱
# This means:
# - Your production snapshot was restored TO production (not ideal)
# - Your tests ran IN production (risky)
# - You need to restore the original production snapshot
```

**If `graceful-spaniel-507` is NOT production:**
```bash
# Good! Your tests were in a safe environment
# To deploy to actual production:
# 1. Identify true production deployment from dashboard
# 2. Take snapshot of THAT deployment
# 3. Run: npx convex deploy (should go to correct prod)
# 4. Follow the checklist
```

---

## Action Items for You

### 🔴 IMMEDIATE - Before Any Production Deployment

1. **Go to Convex Dashboard** (https://dashboard.convex.dev)
2. **Identify ALL your deployments:**
   - Which one is "Dev"? (Should be majestic-squirrel-400)
   - Which one is "Prod"? (??? - identify this)
   - What is graceful-spaniel-507? (Where we've been testing)

3. **Verify Which Environment We Tested In:**
   - If graceful-spaniel-507 = Production → ⚠️ Need to restore original
   - If graceful-spaniel-507 = Dev/Preview → ✅ All good, safe testing

4. **Take Snapshot of ACTUAL Production** (if different)

---

## Quick Diagnostic Commands

Run these to understand your setup:

```bash
# 1. What's in your .env.local?
cat .env.local | Select-String "CONVEX"

# 2. Where does convex deploy go?
npx convex deploy --dry-run

# 3. List all deployments
npx convex deployments ls

# 4. Check project info
cat convex/README.md 2>$null || echo "No README"
```

---

## Likely Scenario (My Guess)

Based on the evidence:

1. **Dev:** majestic-squirrel-400 (confirmed in .env.local)
2. **Prod:** Possibly graceful-spaniel-507 (where `npx convex deploy` went)
3. **Our tests:** Ran on graceful-spaniel-507

**If this is correct:**
- ⚠️ We may have been testing on PRODUCTION
- ⚠️ Need to verify production data hasn't changed
- ⚠️ May need to restore original production snapshot

---

## What You Should Do RIGHT NOW

1. **Check Convex Dashboard** - Identify which deployment is which
2. **Verify graceful-spaniel-507** - Is it dev, prod, or preview?
3. **Report back:** Tell me what you find
4. **Then we'll know:** How to safely deploy to production

**Don't deploy anything to production yet until we clarify this!** 🛑

Would you like me to help you check the dashboard or should I provide more guidance on identifying your deployments?

