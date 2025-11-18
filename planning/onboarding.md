# Onboarding Strategy & Implementation Plan

## Overview

This document outlines a comprehensive two-phase onboarding strategy for PerFi that leverages our existing ledger infrastructure to create a personalized, AI-driven user experience. The onboarding flow is designed to maximize user engagement, showcase app capabilities, and drive subscription conversions.

## Current System Strengths for Onboarding

Our existing system provides excellent foundations:
- ✅ **Complete ledger system** with accounts, budgets, and transfers
- ✅ **Dual-write architecture** (legacy + ledger) for smooth migration
- ✅ **Budget system** with flexible scoping (singleAccount, multipleAccounts, accountType)
- ✅ **Account management** with hierarchical structure
- ✅ **Category/payment type management** with automatic ledger integration
- ✅ **Recurring transaction system** with automated processing
- ✅ **Pre-aggregation system** for performance optimization

## Two-Phase Onboarding Flow

### Phase 1: Pre-Registration Financial Assessment

#### Step 1: User Profile & Financial Goals

```typescript
interface OnboardingProfile {
  // Personal Information
  age: number;
  income: number;
  employmentStatus: 'employed' | 'freelancer' | 'student' | 'retired';
  familySize: number;
  
  // Financial Goals
  primaryGoal: 'save_money' | 'debt_payoff' | 'budget_tracking' | 'investment_prep';
  secondaryGoals: string[];
  targetSavingsAmount?: number;
  debtPayoffTimeline?: number;
  
  // Financial Situation
  monthlyIncome: number;
  monthlyFixedExpenses: number;
  hasDebt: boolean;
  debtAmount?: number;
  emergencyFund: boolean;
  emergencyFundAmount?: number;
}
```

**UI Components:**
- Multi-step wizard with progress indicator
- Interactive goal selection with visual icons
- Financial situation assessment with sliders/inputs
- Real-time validation and helpful tips

#### Step 2: AI-Powered Financial Strategy Generation

Based on the profile, generate a personalized financial plan:

```typescript
interface FinancialStrategy {
  userProfile: 'conservative' | 'moderate' | 'aggressive';
  recommendedBudget: {
    essentials: number; // 50-60%
    wants: number;     // 20-30%
    savings: number;   // 20-30%
  };
  actionPlan: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  suggestedCategories: CategoryTemplate[];
  suggestedRecurringExpenses: RecurringTemplate[];
}
```

**AI Strategy Features:**
- Personalized budget allocation based on income and goals
- Customized category recommendations
- Actionable next steps tailored to user's situation
- Risk profile assessment (conservative/moderate/aggressive)
- Debt payoff strategies if applicable
- Emergency fund recommendations

#### Step 3: Trial Offer & Registration

**Trial Offer Presentation:**
- Display AI-generated strategy with visual charts
- Highlight personalized insights and recommendations
- Show value proposition: "Get your personalized financial plan"
- Offer $1 trial for 1 month, then $8/month
- Collect payment information securely
- Proceed to Auth0 registration

### Phase 2: Post-Registration Data Setup

#### Step 1: Account Setup

```typescript
interface AccountSetup {
  bankAccounts: {
    name: string;
    type: 'checking' | 'savings';
    currentBalance: number;
    institution: string;
  }[];
  
  creditCards: {
    name: string;
    currentBalance: number;
    creditLimit: number;
    closingDay: number;
    dueDay: number;
    interestRate?: number;
  }[];
  
  otherAssets: {
    name: string;
    type: 'investment' | 'crypto' | 'cash';
    currentValue: number;
  }[];
}
```

**Implementation:**
- Leverage existing `accounts` table and `createAccount` functions
- Use dual-write system for seamless integration
- Auto-create corresponding ledger accounts
- Support hierarchical account structure

#### Step 2: Category Customization

**Features:**
- Display AI-suggested categories based on user profile
- Allow customization of expense/income categories
- Visual category editor with icons and colors
- Auto-create corresponding ledger accounts via dual-write
- Preview of category structure before confirmation

#### Step 3: Recurring Income & Expenses

```typescript
interface RecurringSetup {
  income: {
    description: string;
    amount: number;
    frequency: Frequency;
    nextDueDate: number;
    accountId: string;
  }[];
  
  expenses: {
    description: string;
    amount: number;
    frequency: Frequency;
    nextDueDate: number;
    categoryId: string;
    paymentTypeId: string;
  }[];
}
```

**Implementation:**
- Use existing `recurring_entries` and `recurring_lines` tables
- Leverage existing recurring transaction system
- Auto-generate recurring templates from AI suggestions
- Support all frequency types (daily, weekly, monthly, etc.)

#### Step 4: Initial Budget Creation

**Budget Strategy:**
- Auto-generate budgets based on AI recommendations
- Use flexible budget system with `accountType` scope for broad categories
- Create monthly budgets for main expense categories
- Set up savings goals as budgets
- Leverage existing `budgets` table and budget execution system

**Budget Templates by Profile:**
- **Conservative**: Higher savings allocation, detailed expense tracking
- **Moderate**: Balanced approach with moderate risk tolerance
- **Aggressive**: Focus on growth, investment preparation

#### Step 5: Historical Data Import (Optional)

**Import Options:**
- CSV upload for recent transactions (last 3 months)
- Bank statement import (PDF/CSV)
- Manual entry of key historical transactions
- Integration with existing transaction migration system

## Technical Implementation

### New Database Tables

```typescript
// Onboarding progress tracking
onboarding_sessions: defineTable({
  userId: v.id("users"),
  phase: v.union(v.literal("profile"), v.literal("setup"), v.literal("complete")),
  profileData: v.optional(v.any()),
  strategyData: v.optional(v.any()),
  setupProgress: v.optional(v.any()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
})

// AI-generated strategies
financial_strategies: defineTable({
  userId: v.id("users"),
  profileType: v.string(),
  budgetRecommendations: v.any(),
  actionPlan: v.any(),
  categorySuggestions: v.any(),
  createdAt: v.number(),
})

// Template categories for different profiles
category_templates: defineTable({
  profileType: v.string(),
  categories: v.array(v.object({
    name: v.string(),
    transactionType: v.string(),
    priority: v.number(),
  })),
})

// Subscription management
subscriptions: defineTable({
  userId: v.id("users"),
  planId: v.string(),
  status: v.union(v.literal("trial"), v.literal("active"), v.literal("cancelled")),
  trialEndsAt: v.number(),
  nextBillingDate: v.number(),
  createdAt: v.number(),
})
```

### Backend Functions

#### Onboarding Management (`convex/onboarding.ts`)

```typescript
// Save onboarding profile data
export const saveOnboardingProfile = mutation({
  args: {
    profileData: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    
    await ctx.db.insert("onboarding_sessions", {
      userId,
      phase: "profile",
      profileData: args.profileData,
      createdAt: Date.now(),
    });
  },
});

// Generate AI financial strategy
export const generateFinancialStrategy = mutation({
  args: {
    profileData: v.any(),
  },
  handler: async (ctx, args) => {
    // Call external AI service (OpenAI, Anthropic, etc.)
    const strategy = await generateStrategyWithAI(args.profileData);
    
    // Store strategy
    await ctx.db.insert("financial_strategies", {
      userId: await getAuthenticatedUserId(ctx),
      profileType: strategy.profileType,
      budgetRecommendations: strategy.budgetRecommendations,
      actionPlan: strategy.actionPlan,
      categorySuggestions: strategy.categorySuggestions,
      createdAt: Date.now(),
    });
    
    return strategy;
  },
});

// Complete onboarding setup
export const completeOnboardingSetup = mutation({
  args: {
    accountSetup: v.any(),
    categories: v.any(),
    recurringTransactions: v.any(),
    budgets: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    
    // Create accounts using existing account management
    for (const account of args.accountSetup.bankAccounts) {
      await ctx.runMutation(internal.ledger.accounts.createAccount, {
        userId,
        accountType: account.type === 'checking' ? 'asset' : 'asset',
        description: account.name,
        defaultCurrency: 'ARS',
      });
    }
    
    // Create categories using existing category system
    await ctx.runMutation(api.expenses.updateCategories, {
      categories: args.categories,
    });
    
    // Create recurring transactions
    for (const recurring of args.recurringTransactions) {
      await ctx.runMutation(api.recurring.addRecurringTransaction, {
        description: recurring.description,
        amount: recurring.amount,
        frequency: recurring.frequency,
        nextDueDate: recurring.nextDueDate,
        categoryId: recurring.categoryId,
        paymentTypeId: recurring.paymentTypeId,
      });
    }
    
    // Create budgets using existing budget system
    for (const budget of args.budgets) {
      await ctx.runMutation(api.ledger.budgets.createBudget, {
        accountId: budget.accountId,
        amount: budget.amount,
        frequency: budget.frequency,
        nextDueDate: budget.nextDueDate,
        scopeType: budget.scopeType,
        scopeRefs: budget.scopeRefs,
      });
    }
    
    // Mark onboarding as complete
    await ctx.db.patch(userId, { onboardingCompleted: true });
  },
});
```

### Frontend Components

#### Pre-Registration Flow (`src/components/onboarding/`)

```typescript
// ProfileAssessment.tsx - Multi-step profile collection
export function ProfileAssessment() {
  const [currentStep, setCurrentStep] = useState(0);
  const [profileData, setProfileData] = useState<OnboardingProfile>();
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <ProgressIndicator current={currentStep} total={3} />
      
      {currentStep === 0 && <PersonalInfoStep />}
      {currentStep === 1 && <FinancialGoalsStep />}
      {currentStep === 2 && <FinancialSituationStep />}
      
      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}>
          Previous
        </Button>
        <Button onClick={() => setCurrentStep(Math.min(2, currentStep + 1))}>
          {currentStep === 2 ? 'Generate Strategy' : 'Next'}
        </Button>
      </div>
    </div>
  );
}

// StrategyDisplay.tsx - AI-generated strategy presentation
export function StrategyDisplay({ strategy }: { strategy: FinancialStrategy }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Your Personalized Financial Plan</h2>
        <p className="text-muted-foreground">Based on your profile: {strategy.userProfile}</p>
      </div>
      
      <BudgetRecommendation budget={strategy.recommendedBudget} />
      <ActionPlan plan={strategy.actionPlan} />
      <CategorySuggestions categories={strategy.suggestedCategories} />
      
      <TrialOffer />
    </div>
  );
}
```

#### Post-Registration Setup (`src/components/onboarding/setup/`)

```typescript
// AccountSetup.tsx - Account configuration
export function AccountSetup() {
  const [accounts, setAccounts] = useState<AccountSetup>({ bankAccounts: [], creditCards: [], otherAssets: [] });
  
  return (
    <div className="space-y-6">
      <BankAccountsSection accounts={accounts.bankAccounts} onChange={setAccounts} />
      <CreditCardsSection cards={accounts.creditCards} onChange={setAccounts} />
      <OtherAssetsSection assets={accounts.otherAssets} onChange={setAccounts} />
    </div>
  );
}

// CategoryCustomization.tsx - Category editor
export function CategoryCustomization({ suggestions }: { suggestions: CategoryTemplate[] }) {
  const [categories, setCategories] = useState(suggestions);
  
  return (
    <div className="space-y-4">
      <h3>Customize Your Categories</h3>
      <CategoryGrid categories={categories} onChange={setCategories} />
      <CategoryEditor onAdd={addCategory} />
    </div>
  );
}
```

### AI Integration

#### Strategy Generation Service

```typescript
// External AI service integration
async function generateStrategyWithAI(profileData: OnboardingProfile): Promise<FinancialStrategy> {
  const prompt = `
    Based on this user profile, generate a personalized financial strategy:
    
    Age: ${profileData.age}
    Income: $${profileData.monthlyIncome}/month
    Employment: ${profileData.employmentStatus}
    Family Size: ${profileData.familySize}
    Primary Goal: ${profileData.primaryGoal}
    Has Debt: ${profileData.hasDebt}
    Debt Amount: ${profileData.debtAmount || 0}
    
    Generate:
    1. Risk profile (conservative/moderate/aggressive)
    2. Budget allocation (essentials/wants/savings percentages)
    3. Immediate action items
    4. Short-term goals (3-6 months)
    5. Long-term goals (1+ years)
    6. Suggested expense categories
    7. Suggested recurring expenses
  `;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });
  
  const data = await response.json();
  return parseAIResponse(data.choices[0].message.content);
}
```

### Payment Integration

#### Subscription Management

```typescript
// Payment processing integration
interface SubscriptionPlan {
  trialPeriod: number; // 30 days
  trialPrice: number;   // $1
  regularPrice: number; // $8/month
  features: string[];
}

// Stripe integration for payment processing
export const createSubscription = mutation({
  args: {
    planId: v.string(),
    paymentMethodId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    
    // Create Stripe subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: args.planId }],
      trial_period_days: 30,
      payment_method: args.paymentMethodId,
    });
    
    // Store subscription in database
    await ctx.db.insert("subscriptions", {
      userId,
      planId: args.planId,
      status: "trial",
      trialEndsAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
      nextBillingDate: Date.now() + (30 * 24 * 60 * 60 * 1000),
      createdAt: Date.now(),
    });
    
    return subscription;
  },
});
```

## Integration with Existing Systems

### Leveraging Current Infrastructure

1. **Budget System Integration**
   - Use existing flexible budget system with `accountType` scope
   - Leverage budget execution and historical tracking
   - Utilize pre-aggregation system for performance

2. **Account Management**
   - Use existing `accounts` table and creation functions
   - Leverage hierarchical account structure
   - Integrate with dual-write system

3. **Category/Payment Type Management**
   - Use existing category and payment type systems
   - Leverage automatic ledger account creation
   - Utilize dual-write for seamless integration

4. **Recurring Transaction System**
   - Use existing recurring transaction infrastructure
   - Leverage automated processing and cron jobs
   - Utilize ledger integration for double-entry

5. **Transaction Management**
   - Use existing expense/income management
   - Leverage verification workflow
   - Utilize pre-aggregation for performance

### Data Flow Architecture

```
Pre-Registration:
User Input → Profile Assessment → AI Strategy Generation → Trial Offer → Payment → Registration

Post-Registration:
Auth0 Registration → Account Setup → Category Customization → Recurring Setup → Budget Creation → Historical Import → Welcome Dashboard
```

## Revenue Model Integration

### Subscription Tiers

```typescript
const SUBSCRIPTION_PLANS = {
  trial: {
    price: 1, // $1
    duration: 30, // days
    features: ['Full app access', 'AI financial strategy', 'Personalized budgets', 'Unlimited transactions']
  },
  monthly: {
    price: 8, // $8/month
    features: ['Everything in trial', 'Advanced analytics', 'Bank integration', 'Priority support']
  }
};
```

### Conversion Strategy

1. **Trial Value Demonstration**
   - Immediate AI-generated insights
   - Personalized budget recommendations
   - Clear progress tracking
   - Educational content about financial health

2. **Retention Tactics**
   - Daily/weekly progress notifications
   - Budget alerts and recommendations
   - Financial milestone celebrations
   - Educational content delivery

3. **Upgrade Incentives**
   - Advanced analytics and reporting
   - Bank account integration
   - Investment tracking
   - Priority customer support

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Database schema updates
- [ ] Basic onboarding session tracking
- [ ] Profile assessment UI components
- [ ] AI strategy generation service

### Phase 2: Core Onboarding (Weeks 3-4)
- [ ] Pre-registration flow implementation
- [ ] Post-registration setup flow
- [ ] Integration with existing systems
- [ ] Basic payment integration

### Phase 3: AI & Personalization (Weeks 5-6)
- [ ] Advanced AI strategy generation
- [ ] Personalized category suggestions
- [ ] Dynamic budget recommendations
- [ ] Strategy-based action plans

### Phase 4: Payment & Subscription (Weeks 7-8)
- [ ] Stripe payment integration
- [ ] Subscription management
- [ ] Trial-to-paid conversion flow
- [ ] Billing and invoice management

### Phase 5: Advanced Features (Weeks 9-10)
- [ ] Historical data import
- [ ] Bank statement processing
- [ ] Advanced analytics dashboard
- [ ] Educational content integration

### Phase 6: Testing & Optimization (Weeks 11-12)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] User experience testing
- [ ] Conversion rate optimization

## Success Metrics

### Key Performance Indicators (KPIs)

1. **Conversion Metrics**
   - Trial signup rate: Target 15-20%
   - Trial-to-paid conversion: Target 25-30%
   - Monthly churn rate: Target <5%

2. **Engagement Metrics**
   - Onboarding completion rate: Target 80%
   - Time to first budget creation: Target <24 hours
   - Daily active users: Target 60% of paid users

3. **Financial Metrics**
   - Customer acquisition cost (CAC): Target <$20
   - Lifetime value (LTV): Target >$100
   - LTV/CAC ratio: Target >5:1

4. **User Experience Metrics**
   - Onboarding satisfaction score: Target >4.5/5
   - Feature adoption rate: Target >70%
   - Support ticket volume: Target <5% of users

## Risk Mitigation

### Technical Risks
- **AI Service Reliability**: Implement fallback strategies and caching
- **Payment Processing**: Use Stripe's robust infrastructure and error handling
- **Data Migration**: Leverage existing dual-write system for safety
- **Performance**: Utilize pre-aggregation system for scalability

### Business Risks
- **Low Conversion**: A/B test different trial offers and pricing
- **High Churn**: Implement retention strategies and user feedback loops
- **Competition**: Focus on AI-powered personalization as differentiator
- **Regulatory**: Ensure compliance with financial data regulations

## Conclusion

This comprehensive onboarding strategy leverages PerFi's existing robust infrastructure while adding AI-powered personalization and a clear path to monetization. The two-phase approach ensures users receive immediate value while building a strong foundation for long-term success.

The integration with existing systems minimizes development risk while maximizing the value of current investments. The AI-driven approach differentiates PerFi from basic budgeting apps and justifies the subscription model through personalized insights and recommendations.

By following this roadmap, PerFi will create a compelling onboarding experience that drives user engagement, showcases app capabilities, and builds a sustainable revenue stream.
