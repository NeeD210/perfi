# Phase 2 Migration Runbook

## Overview

This runbook provides step-by-step instructions for executing the automated Phase 2 migration from the legacy expense tracking system to the new double-entry accounting system.

## Pre-Migration Checklist

### 1. Environment Preparation
- [ ] Ensure Convex development server is running (`npx convex dev`)
- [ ] Verify all migration functions are deployed
- [ ] Check database connectivity
- [ ] Confirm backup procedures are in place

### 2. Data Validation
- [ ] Run data integrity checks
- [ ] Verify user count matches expectations
- [ ] Check for any data quality issues
- [ ] Validate payment type `isCredit` field is set correctly

### 3. System Readiness
- [ ] Confirm migration scripts are up to date
- [ ] Test migration functions in development
- [ ] Verify error handling mechanisms
- [ ] Check monitoring and logging systems

## Migration Execution

### Step 1: Check Migration Status
```bash
npx convex run migrations/bulkPhase2Migration:checkBulkMigrationStatus
```

**Expected Output:**
```json
{
  "failedUsers": 0,
  "isRunning": false,
  "processedUsers": 0,
  "progressPercentage": 0,
  "successfulUsers": 0,
  "totalUsers": 7
}
```

### Step 2: Execute Bulk Migration
```bash
npx convex run migrations/bulkPhase2Migration:runBulkPhase2Migration
```

**Expected Output:**
- Real-time progress logging
- User-by-user migration status
- Final summary with statistics

### Step 3: Verify Migration Results
```bash
npx convex run migrations/bulkPhase2Migration:checkBulkMigrationStatus
```

**Expected Output:**
```json
{
  "failedUsers": 0,
  "isRunning": false,
  "processedUsers": 7,
  "progressPercentage": 100,
  "successfulUsers": 7,
  "totalUsers": 7
}
```

## Migration Monitoring

### Real-time Progress Tracking
The migration provides comprehensive logging including:
- User processing status
- Account creation counts
- Transaction entry creation
- Installment entry creation
- Error handling and warnings

### Key Metrics to Monitor
- **Total Users**: Number of users to be migrated
- **Processed Users**: Users completed (successful + failed)
- **Successful Users**: Users migrated without errors
- **Failed Users**: Users that encountered errors
- **Progress Percentage**: Overall completion percentage

### Expected Log Patterns
```
[LOG] 'Bulk Phase 2 migration initialized: bulk_phase2_[timestamp]'
[LOG] 'Total users to migrate: [count]'
[LOG] 'Starting bulk Phase 2 migration: [migration_id]'
[LOG] 'Processing Phase 2 migration for user: [user_id]'
[LOG] '✅ User [user_id] migrated successfully'
[LOG] 'Batch completed: [processed] processed, [successful] successful, [failed] failed'
[LOG] 'Bulk Phase 2 migration completed: [total] users processed, [successful] successful, [failed] failed'
```

## Error Handling

### Common Issues and Solutions

#### 1. Missing Mappings
**Warning**: `Missing mappings for expense [id]: category=[bool], paymentType=[bool]`
**Solution**: This is expected for legacy data. The migration will skip these expenses gracefully.

#### 2. No Expense Mapping Found
**Warning**: `No expense mapping found for schedule [id], expense [id]`
**Solution**: This occurs when an expense couldn't be migrated due to missing mappings. The installment is skipped.

#### 3. Migration Stalls
**Symptom**: Progress stops updating
**Solution**: 
```bash
# Check status
npx convex run migrations/bulkPhase2Migration:checkBulkMigrationStatus

# Reset if needed
npx convex run migrations/bulkPhase2Migration:resetBulkMigrationProgress
```

#### 4. Partial Failures
**Symptom**: Some users fail to migrate
**Solution**: 
```bash
# Check detailed status
npx convex run migrations/bulkPhase2Migration:checkBulkMigrationStatus

# Reset and retry
npx convex run migrations/bulkPhase2Migration:resetBulkMigrationProgress
npx convex run migrations/bulkPhase2Migration:runBulkPhase2Migration
```

## Post-Migration Validation

### 1. Data Integrity Checks
- [ ] Verify zero-sum accounting maintained
- [ ] Check account balances are correct
- [ ] Validate journal entry counts
- [ ] Confirm installment entries are proper

### 2. System Functionality Tests
- [ ] Test transaction creation
- [ ] Verify account displays
- [ ] Check reporting accuracy
- [ ] Validate payment processing

### 3. User Acceptance Testing
- [ ] Spot check key users
- [ ] Verify financial reports
- [ ] Test edge cases
- [ ] Confirm data accuracy

## Rollback Procedures

### Emergency Rollback
If critical issues are discovered:

1. **Stop Migration**
   ```bash
   # Check if migration is running
   npx convex run migrations/bulkPhase2Migration:checkBulkMigrationStatus
   ```

2. **Restore from Backup**
   - Restore database from pre-migration backup
   - Verify data integrity
   - Test system functionality

3. **Investigate Issues**
   - Review migration logs
   - Identify root cause
   - Fix underlying issues

4. **Re-run Migration**
   ```bash
   npx convex run migrations/bulkPhase2Migration:runBulkPhase2Migration
   ```

### Partial Rollback
For specific migration phases:

1. **Reset Specific Phase**
   ```bash
   npx convex run migrations/bulkPhase2Migration:resetBulkMigrationProgress --migrationType account_seeding
   ```

2. **Re-run Affected Phase**
   ```bash
   npx convex run migrations/bulkPhase2Migration:runBulkPhase2Migration
   ```

## Production Deployment

### Pre-Production Checklist
- [ ] Complete development environment testing
- [ ] Verify all migration functions work correctly
- [ ] Test rollback procedures
- [ ] Prepare production backup
- [ ] Schedule maintenance window
- [ ] Notify stakeholders

### Production Execution
1. **Backup Production Database**
2. **Deploy Migration Functions**
3. **Execute Migration**
   ```bash
   npx convex run migrations/bulkPhase2Migration:runBulkPhase2Migration
   ```
4. **Monitor Progress**
5. **Validate Results**
6. **Test System Functionality**
7. **Go Live**

### Post-Production Monitoring
- [ ] Monitor system performance
- [ ] Check for any issues
- [ ] Validate user reports
- [ ] Address any problems
- [ ] Document lessons learned

## Troubleshooting Guide

### Migration Won't Start
**Symptoms**: Function not found or deployment issues
**Solutions**:
- Ensure Convex dev server is running
- Check function deployment status
- Verify migration functions are available

### Slow Performance
**Symptoms**: Migration taking longer than expected
**Solutions**:
- Reduce batch size: `--batchSize 25`
- Reduce concurrency: `--maxConcurrentUsers 5`
- Check system resources

### Memory Issues
**Symptoms**: Out of memory errors
**Solutions**:
- Reduce batch size significantly
- Increase system memory
- Process users in smaller groups

### Data Corruption
**Symptoms**: Incorrect account balances or missing data
**Solutions**:
- Stop migration immediately
- Restore from backup
- Investigate root cause
- Fix issues before re-running

## Contact Information

### Migration Team
- **Primary Contact**: Development Team
- **Escalation**: Technical Lead
- **Emergency**: System Administrator

### Resources
- **Documentation**: `docs/automated-migration-solution.md`
- **Implementation**: `docs/implementation-summary.md`
- **Migration Plan**: `planning/phase2migrationPlan.md`
- **Convex Dashboard**: https://dashboard.convex.dev/d/majestic-squirrel-400

## Appendix

### Migration Commands Reference
```bash
# Check migration status
npx convex run migrations/bulkPhase2Migration:checkBulkMigrationStatus

# Run bulk migration
npx convex run migrations/bulkPhase2Migration:runBulkPhase2Migration

# Reset migration progress
npx convex run migrations/bulkPhase2Migration:resetBulkMigrationProgress

# Run with custom parameters
npx convex run migrations/bulkPhase2Migration:runBulkPhase2Migration --batchSize 25 --maxRetries 5

# Run recurring templates migration (per user)
npx convex run migrations/recurringToLedger:migrateRecurringTemplatesForUser --userId <userId>

# Run recurring templates migration via index wrapper
npx convex run migrations:migrateRecurringTemplatesForUser --userId <userId>
```

### Configuration Options
- `batchSize`: Users processed per batch (default: 50)
- `maxRetries`: Maximum retry attempts (default: 3)
- `maxConcurrentUsers`: Concurrent user processing (default: 10)

### Expected Migration Times
- **Small Environment** (< 100 users): 1-5 minutes
- **Medium Environment** (100-1000 users): 10-30 minutes
- **Large Environment** (1000+ users): 30+ minutes

### Success Criteria
- ✅ 100% user migration success rate
- ✅ Zero data integrity issues
- ✅ All accounts properly created
- ✅ All transactions migrated
- ✅ All installments processed
- ✅ All recurring templates migrated
- ✅ System functionality verified

### Development Environment Results
- ✅ **137 accounts** created across 7 users
- ✅ **187 journal entries** for historical transactions
- ✅ **123 installment entries** for credit card payments
- ✅ **15 recurring entries** migrated to ledger format
- ✅ **30 recurring lines** (double-entry accounting)
- ✅ **100% success rate** with zero manual intervention
