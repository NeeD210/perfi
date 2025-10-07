# Guide to Writing Self-Contained PRDs

This guide provides a framework for creating Product Requirement Documents (PRDs) that are complete, actionable, and require no external context to implement.

## Core Principles

### 1. Self-Containment
A self-contained PRD means a developer can implement the feature **without** needing to:
- Read other planning documents such as @summary.md or @accounting.md
- Ask clarifying questions about requirements
- Hunt for specifications across multiple files
- Infer technical details from context

**Everything needed is in the PRD itself.**

### 2. Clarity Over Brevity
It's better to be clear than concise and ambiguous. Include:
- Explicit field types and constraints
- Example values and formats
- Edge cases and error conditions
- Success and failure scenarios

### 3. Technical Precision
Use exact terminology and specifications:
- ✅ "epoch milliseconds" not "timestamp"
- ✅ "ISO 4217 currency code" not "currency"
- ✅ "signed integer in minor units" not "amount"
- ✅ "1-31" not "day of month"

## PRD Structure Template

### 1. Introduction (Required)
**Purpose**: Provide context and motivation

**Include:**
- What is being built (1-2 sentences)
- Why it's being built (business value)
- How it fits into the larger system
- What phase/step this represents

**Example:**
```markdown
## Introduction

This PRD covers the foundational schema and validation layer for PerFi's 
accounting core migration. The goal is to establish a double-entry ledger 
system that will replace the current transaction-based model, enabling 
advanced financial features like multi-currency support, transfers, debt 
tracking, and investment portfolios.

This is the first step in a multi-phase migration using the strangler 
pattern—new tables will coexist with legacy tables until the full 
migration is complete.
```

### 2. Context & Background (Required)
**Purpose**: Explain the current state and target state

**Include:**
- Current system description
- Pain points or limitations
- Target system vision
- Technology stack being used
- Key concepts or domain knowledge

**Example:**
```markdown
## Context & Background

### Current System
- Uses simplified transaction model with `expenses` table
- Float64 amounts (prone to rounding errors)
- No multi-currency support

### Target System
- Double-entry ledger with debits/credits
- Integer amounts (no floating point)
- Full multi-currency support

### Technology Stack
- Backend: Convex (TypeScript)
- Database: Convex NoSQL
- Validation: Convex `v` validator library
```

### 3. User Stories (Required)
**Purpose**: Define who needs what and why

**Format**: 
```
As a [role], I want to [action], so that [benefit].
```

**Include:**
- Primary users (developers, end-users, admins)
- Core actions they need to perform
- Value/benefit they receive

**Tips:**
- Use 3-6 stories (not too many)
- Cover different aspects of the feature
- Include both functional and technical needs

**Example:**
```markdown
## User Stories

**US1:** *As a developer, I need a well-defined schema for the new ledger 
system, so I can build mutations and queries with confidence that the data 
structure is correct.*

**US2:** *As a developer, I need strict validators that enforce data 
integrity, so invalid data cannot enter the system.*

**US3:** *As a data engineer, I need the new tables to coexist with legacy 
tables, so we can migrate data gradually without breaking the existing app.*
```

### 4. Acceptance Criteria (Required)
**Purpose**: Define concrete, testable conditions for "done"

**Structure**: One section per user story

**Include:**
- Specific, measurable conditions
- Input/output examples
- Error conditions
- Edge cases

**Format**:
```markdown
### For US1 (Feature Name):

**Condition 1:**
- The system must...
- When X happens, then Y occurs
- Example: [concrete example]

**Condition 2:**
- ...
```

**Tips:**
- Use checkboxes for testable items
- Be explicit about required vs. optional
- Include negative cases (what should NOT happen)

**Example:**
```markdown
## Acceptance Criteria

### For US1 (Schema Definition):

**New Tables Created:**
1. `accounts` - Chart of accounts
2. `journal_entries` - Transaction headers
3. `journal_lines` - Transaction lines

**Each table must have:**
- All required fields defined with correct types
- Optional fields marked with `?`
- Proper foreign key references using `Id<'tableName'>`
- Soft delete fields: `softdelete: boolean`, `deletedAt?: number`
```

### 5. Detailed Specifications (Required)
**Purpose**: Provide complete technical details

**Include for each component:**

#### For Database Tables:
```markdown
### TableName Table

**Purpose**: One-sentence description

**Fields:**
```typescript
{
  id: v.id("tableName"),
  fieldName: v.string(),
  amount: v.number(), // signed integer in minor units
  // ... all fields with types and comments
}
```

**Indexes:**
- `index_name`: `(field1, field2 desc)`

**Business Rules:**
- Rule 1 description
- Rule 2 description
- Validation logic
- Constraints
```

#### For APIs/Mutations:
```markdown
### mutationName

**Purpose**: What it does

**Input:**
```typescript
{
  param1: string,  // description
  param2: number,  // description
}
```

**Output:**
```typescript
{
  resultId: Id<"table">,
  status: "success" | "error"
}
```

**Business Logic:**
1. Step 1
2. Step 2
3. Step 3

**Validations:**
- Check X
- Ensure Y
- Prevent Z

**Error Conditions:**
- Throws `ConvexError` when...
- Returns null when...
```

#### For UI Components:
```markdown
### ComponentName

**Purpose**: What it displays/does

**Props:**
```typescript
interface Props {
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
}
```

**Behavior:**
- On mount: ...
- On click: ...
- On error: ...

**Visual States:**
- Default
- Loading
- Error
- Disabled

**Accessibility:**
- ARIA labels: ...
- Keyboard navigation: ...
```

### 6. Technical Implementation Details (Recommended)
**Purpose**: Guide the implementation approach

**Include:**
- File structure and locations
- Code organization
- Key algorithms or logic
- Integration points
- Configuration

**Example:**
```markdown
## Technical Implementation Details

### File Structure

Create new schema in: `convex/ledger/schema.ts`

### Validation Helpers

Create: `convex/ledger/validators.ts`

```typescript
import { v } from "convex/values";

export const currencyCodeValidator = v.string();
// Custom validation: 3 uppercase letters
```

### Migration Considerations

1. No changes to existing `convex/schema.ts`
2. Use separate namespace for new tables
3. Export strategy: merge or separate
```

### 7. Constraints & Non-Functional Requirements (Recommended)
**Purpose**: Define quality attributes and limitations

**Include:**

**Performance:**
- Response time targets
- Throughput requirements
- Resource limits

**Data Integrity:**
- Validation rules
- Referential integrity
- Consistency guarantees

**Compatibility:**
- Version requirements
- Backward compatibility
- Migration paths

**Security:**
- Authentication/authorization
- Data protection
- Audit requirements

**Example:**
```markdown
## Constraints & Non-Functional Requirements

### Performance
- Index queries must execute in < 50ms for datasets < 10k entries
- Enum validation overhead < 1ms per field

### Data Integrity
- All foreign keys use proper `v.id("tableName")` type
- Soft delete must be boolean (not optional)

### Security
- All tables must include `userId` for multi-tenancy
- Audit fields required for compliance
```

### 8. Out of Scope (Required)
**Purpose**: Explicitly state what is NOT included

**Include:**
- Related features for later
- Assumptions about future work
- Intentional limitations
- Deferred decisions

**Example:**
```markdown
## Out of Scope

The following are explicitly **NOT** included in this step:

- Writing mutations or queries (covered in Step 2.1)
- Data migration/backfill (Step 2.2)
- UI changes (Phase 6)
- FX rate fetching service (Step 1.2)
```

### 9. Success Metrics (Required)
**Purpose**: Define measurable completion criteria

**Include:**
- Checkboxes for each deliverable
- Quantitative metrics where possible
- Quality gates
- Documentation requirements

**Example:**
```markdown
## Success Metrics

- [ ] All 10 tables defined in schema
- [ ] All enums defined with correct values
- [ ] Schema passes all validation tests
- [ ] Convex dashboard shows all tables
- [ ] No conflicts with existing tables
- [ ] Performance benchmarks met
- [ ] Documentation updated
```

### 10. Risks & Mitigations (Recommended)
**Purpose**: Anticipate and plan for problems

**Format:**
| Risk | Impact | Mitigation |
|------|--------|------------|
| Description | High/Med/Low | How to prevent/handle |

**Example:**
```markdown
## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Index performance degrades | High | Monitor queries; add composite indexes |
| Enum values need to change | Medium | Use string literals; document migration |
| Circular account references | Medium | Implement cycle detection in mutation |
```

### 11. Appendix (Optional but Helpful)
**Purpose**: Provide supporting information

**Include:**
- Glossary of terms
- References and links
- Related PRDs
- Code examples
- Diagrams

**Example:**
```markdown
## Appendix

### Glossary
- **Double-Entry Ledger**: Accounting system where every transaction 
  affects at least two accounts
- **Zero-Sum Invariant**: Sum of debits equals sum of credits

### References
- Convex Docs: https://docs.convex.dev/database/schemas
- ISO 4217: https://www.iso.org/iso-4217-currency-codes.html

### Related PRDs
- Step 1.2: Base Currency & FX Infrastructure
- Step 2.1: Account Seeding
```

## Best Practices

### DO:
✅ **Include Examples**: Show expected inputs/outputs, edge cases, error messages
```markdown
**Example valid currency code**: "USD", "ARS", "EUR"
**Example invalid**: "usd", "US", "Dollar"
```

✅ **Specify Exact Types**: Don't leave interpretation to the reader
```markdown
❌ amount: number
✅ amount: number // signed integer in minor units (cents for USD, pesos for ARS)
```

✅ **List All Enum Values**: Even if they seem obvious
```markdown
status: v.union(
  v.literal("planned"),
  v.literal("posted"),
  v.literal("voided")
)
```

✅ **Define Success AND Failure**: Show both happy and unhappy paths
```markdown
**Success**: Returns `{ id: "123", status: "created" }`
**Failure**: Throws `ConvexError("Amount must be positive")` when amount <= 0
```

✅ **Include Business Context**: Explain WHY, not just WHAT
```markdown
// WHY: ARS doesn't use decimal places in practice
currencyScale: ARS: 0, USD: 2
```

### DON'T:
❌ **Assume Prior Knowledge**: Don't reference external docs without including the key info
```markdown
❌ "Uses the same logic as the current system"
✅ "Uses daily cron at midnight UTC to process due recurring transactions"
```

❌ **Leave Ambiguity**: Every field should have a clear definition
```markdown
❌ date: number
✅ date: number // epoch milliseconds (effective date in UTC)
```

❌ **Skip Edge Cases**: Address the tricky scenarios
```markdown
✅ "For months with fewer days than closingDay (e.g., Feb 30), use last day of month"
```

❌ **Forget Soft Deletes**: Always clarify behavior with deleted records
```markdown
✅ "Soft-deleted accounts remain referenced in historical journal_lines"
```

❌ **Mix Concerns**: Keep each PRD focused on one step/feature
```markdown
❌ Including UI implementation in a schema PRD
✅ Reference UI PRD for interface details
```

## Common Pitfalls

### 1. **Incomplete Type Specifications**
**Problem**: "amount is a number"
**Solution**: "amount is a signed integer representing minor units (cents for USD, pesos for ARS with scale 0)"

### 2. **Missing Validation Rules**
**Problem**: Only defining happy path
**Solution**: Include all validations, constraints, and error conditions

### 3. **Unclear Dependencies**
**Problem**: Assuming reader knows related systems
**Solution**: Include "Context & Background" section with current state

### 4. **Vague Success Criteria**
**Problem**: "Schema should work correctly"
**Solution**: "All 10 tables defined, all indexes created, passes validation tests, no conflicts"

### 5. **No Migration Strategy**
**Problem**: Undefined coexistence with legacy systems
**Solution**: Explicit migration approach, data mapping, rollback plan

## Self-Containment Checklist

Before finalizing a PRD, verify:

- [ ] A developer unfamiliar with the project could implement this feature
- [ ] All technical terms are defined (or in glossary)
- [ ] All data types, formats, and constraints are explicit
- [ ] All external dependencies are explained or linked
- [ ] All business rules are documented
- [ ] Success criteria are measurable and complete
- [ ] Edge cases and error conditions are covered
- [ ] Examples are provided for complex concepts
- [ ] File locations and structure are specified
- [ ] Testing requirements are clear
- [ ] Out-of-scope items are explicitly listed

## Example: Good vs. Bad

### ❌ Bad PRD Excerpt:
```markdown
## Schema

Create the accounts table with the usual fields.

Add indexes for performance.

Use the standard validation patterns.
```

**Problems**: 
- "Usual fields" is undefined
- "Standard validation" is ambiguous
- No specifics on indexes
- Requires external knowledge

### ✅ Good PRD Excerpt:
```markdown
## accounts Table

**Purpose**: Chart of accounts representing the ledger structure

**Fields:**
```typescript
{
  id: v.id("accounts"),
  userId: v.id("users"),
  description: v.string(), // account name, max 100 chars
  accountType: v.union(
    v.literal("asset"),
    v.literal("liability"),
    v.literal("equity"),
    v.literal("income"),
    v.literal("expense")
  ),
  creationTime: v.number(), // epoch milliseconds
  softdelete: v.boolean(), // true = deleted, false = active
  deletedAt: v.optional(v.number()), // epoch ms when deleted
}
```

**Indexes:**
- `by_user`: Query all accounts for a user, sorted by creation
- `by_user_type`: Filter accounts by type for a user

**Validation:**
- `description` must be non-empty and <= 100 characters
- `accountType` must be one of the 5 literal values
- `softdelete` defaults to `false` on creation
- `deletedAt` required when `softdelete = true`
```

**Why it's good**:
- Every field explicitly typed and documented
- Enum values listed completely
- Index purposes explained
- Validation rules clear
- No assumptions required

## Summary

A self-contained PRD should answer:
1. **What** is being built (Introduction, User Stories)
2. **Why** it's needed (Context & Background)
3. **How** it should work (Detailed Specifications)
4. **When** it's done (Acceptance Criteria, Success Metrics)
5. **What** could go wrong (Risks & Mitigations)
6. **What** is NOT included (Out of Scope)

When in doubt, **over-specify rather than under-specify**. It's easier to skip details you don't need than to hunt for missing information.

Remember: The goal is for a developer to read ONLY this PRD and successfully implement the feature without external references or clarifying questions.

