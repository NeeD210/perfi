# Backend and Frontend Optimization Plan for Enhanced Performance

## Introduction

This document outlines a comprehensive strategy to optimize the application, focusing on backend Convex functions and queries, as well as frontend React component rendering. The primary goals are:

*   **Reduce Loading Times:** Ensure faster initial page loads and data fetching.
*   **Improve Performance with Large Datasets:** Maintain responsiveness and efficiency as data volume grows.
*   **Minimize Unnecessary Re-renders:** Optimize React components to prevent performance degradation.
*   **Enhance Overall User Experience:** Provide a smoother, faster, and more reliable application.

## Tasks and Progress

### Phase A: Schema and Indexing Strategy
- [x] Analyze current query patterns and identify critical queries
- [x] Review existing indexes and their usage
- [x] Add optimized indexes for critical queries
- [x] Monitor query performance in Convex dashboard
  - Current performance metrics (24/5/2025):
    - `listExpenses`: 1ms
    - `getHistoricPaymentTypes`: 1ms
    - `getCategoriesWithIdsIncludingDeleted`: 1ms
    - `listAllTransactions`: 1ms
    - `getProjectedPayments`: 25-28ms (improved from 33ms)
      - Processing 21 payment schedules
      - Filtered to 7 active schedules
      - 4 recurring transactions
      - Generated 11 recurring items
      - Final result: 18 total items
      - Performance improvements:
        - Date range filtering optimized with compound indexes
        - Softdelete filtering using proper index syntax
        - Recurring transaction generation optimized with batch processing
        - Memory usage reduced with pre-allocated arrays
- [x] Implement additional indexes if needed based on monitoring
  - Completed improvements:
    - Compound index `by_user_dueDate_softdelete` on paymentSchedules is already implemented
    - Compound index `by_user_isActive_softdelete` on recurringTransactions is already implemented
  - Next steps:
    - Monitor query performance with existing indexes
    - Consider additional indexes if performance metrics indicate need
- [x] Consider denormalization opportunities
  - Completed improvements:
    - Implemented caching strategy for frequently accessed data
    - Added cache invalidation for user-specific data
    - Optimized date calculations with pre-calculated multipliers
    - Implemented batch processing for recurring transactions

### Phase B: Query Optimization
- [x] Optimize `getProjectedPayments` query
  - Completed improvements:
    - Implemented caching with configurable durations
    - Added batch processing for recurring transactions
    - Optimized date calculations with pre-calculated multipliers
    - Reduced memory allocations with pre-allocated arrays
    - Improved filtering with proper index usage
  - Current performance:
    - Total execution time: 25-28ms (improved from 33ms)
    - Memory usage: Reduced through batch processing
    - Query count: Optimized with single batch queries
- [ ] Implement pagination for large dataset queries
- [x] Review and optimize filtering operations
- [x] Reduce query count through query combination
- [x] Implement efficient data fetching patterns

### Phase C: Frontend Optimization
- [ ] Implement React.memo for list components
- [ ] Add useMemo for expensive calculations
- [ ] Optimize component rendering with useCallback
- [ ] Implement virtualization for long lists
- [ ] Review and optimize conditional rendering

### Phase D: Monitoring and Maintenance
- [x] Set up performance monitoring alerts
- [x] Create performance benchmarks
- [x] Document optimization results
- [ ] Plan for ongoing performance maintenance

## I. Backend Optimization (Convex)

Optimizing Convex functions and database interactions is crucial for overall application speed and scalability.

### A. Schema and Indexing Strategy

Proper schema design and effective indexing are the foundation of a performant backend.

1.  **Analyze Query Patterns:**
    *   Identify the most frequently executed queries and their common filter/sort conditions.
    *   Pay special attention to queries powering the `ProjectionPage`, such as `api.projections.getProjectedPayments` and `api.expenses.getCategoriesWithIdsIncludingDeleted`.

2.  **Optimize Indexes:**
    *   **Ensure Coverage:** Verify that all critical queries, especially those involving filtering (`eq`), sorting (`order`), and searching, are fully supported by database indexes.
    *   **Review Existing Indexes:** Check for redundant indexes (multiple indexes on the same field or similar compound indexes) or underutilized indexes.
    *   **Compound Indexes:** Use compound indexes effectively for queries that filter or sort on multiple fields. The order of fields in a compound index matters and should match the query's usage.
    *   **Convex Naming Conventions:** Follow `by_field1_and_field2` for index names for clarity.
    *   **Specificity:** For queries like `getProjectedPayments`, ensure indexes cover fields like `date`, `type`, `transactionType`, `originalExpenseId`, `recurringTransactionId`, `categoryId`, etc., as appropriate.

3.  **Data Normalization vs. Denormalization:**
    *   **Trade-offs:** Understand the balance. Normalization reduces data redundancy and improves consistency but might require more joins (or multiple queries). Denormalization can speed up reads by reducing joins but increases storage and makes updates more complex.
    *   **Consider for Projections:** For read-heavy scenarios like financial projections, strategically denormalizing some data (e.g., embedding `categoryName` directly into projected items if updates are manageable) could improve query speed. However, this must be weighed against the complexity of keeping denormalized data consistent.

4.  **Schema Design for Projections:**
    *   Evaluate if the data structure returned by `getProjectedPayments` is optimal or if any pre-aggregation or reshaping can be done at the data source or within the Convex query itself to simplify frontend processing.

### B. Query Optimization

Efficient queries fetch only necessary data and process it quickly.

1.  **Minimize Data Fetched:**
    *   **Selective Fields:** Ensure queries only retrieve fields that are actually used by the frontend. Avoid fetching entire documents if only a few fields are needed.
    *   **Convex `returns` Validator:** Utilize `v.object()` with specific fields in the `returns` validator of your Convex query and action definitions to enforce this.

2.  **Efficient Filtering and Sorting:**
    *   **Leverage Indexes:** Always use `withIndex` for filtering and ensure sorting operations (`order`) can utilize an index.
    *   **Database-Side Operations:** Push as much filtering, sorting, and aggregation logic to the database as possible. Avoid fetching large datasets to the client for processing.
    *   **Convex Rule Adherence:** Strictly avoid using `.filter()` on query results if the filtering can be achieved with an index (`withIndex`).

3.  **Pagination for Large Datasets:**
    *   **Implement Everywhere Needed:** For any query that can return a large number of items (e.g., transaction histories, lists that feed into projections), implement robust pagination.

4.  **Reduce Query Count:**
    *   **Combine Queries:** Where feasible, combine multiple related queries into a single, more comprehensive query to reduce network overhead and potential race conditions.
    *   **Caching:** While Convex provides some caching, consider if any application-level caching strategies or more aggressive frontend memoization of query results are beneficial for frequently accessed, rarely changing data.

5.  **Optimizing `getProjectedPayments`:**
    *   **Deep Dive:** Analyze this specific query in `convex/projections.ts`. How are `installment` and `recurring` transactions identified and aggregated?
    *   **Efficiency:** Are there loops fetching related data (N+1 problem)? Can these be optimized by fetching related data in batches or restructuring the query?
    *   **Complex Calculations:** If this query involves complex calculations on raw data, evaluate if some of these can be pre-calculated, done incrementally, or shifted to a scheduled task if real-time accuracy isn't paramount for all aspects.
    *   **Note:** Pagination has been removed from `getProjectedPayments` for simplicity and performance. All projection items are now returned in a single array.

### C. Mutation and Action Optimization

Efficient mutations and actions ensure data integrity and responsiveness.

1.  **Batch Operations:**
    *   When inserting or updating multiple documents, design mutations to accept arrays of data to process them in a single transaction where possible, reducing overhead.

2.  **Minimize Data Written:**
    *   **Partial Updates:** Use `ctx.db.patch` for updating existing documents to only modify the fields that have changed, rather than replacing the entire document with `ctx.db.replace`.

3.  **Background Tasks:**
    *   Offload non-critical, long-running, or resource-intensive operations (e.g., generating complex reports, data synchronization, AI-driven analysis if not immediately needed) to internal actions (`internalAction`) or scheduled tasks (`crons`). This keeps user-facing mutations fast.

4.  **Idempotency:**
    *   Design mutations to be idempotent where appropriate, meaning calling them multiple times with the same arguments has the same effect as calling them once. This is crucial for reliability, especially with network retries.

### D. Function Design (Convex Rules Adherence)

Following Convex best practices ensures maintainable and efficient backend code.

1.  **New Function Syntax:** Consistently use the new function syntax (`query({...})`, `mutation({...})`, etc.).
2.  **Validators:** Always include comprehensive `args` and `returns` validators for all Convex functions. This improves type safety, documentation, and helps prevent invalid data.
3.  **Internal vs. Public Functions:** Correctly distinguish between public API functions (`query`, `mutation`, `action`) and private helper functions (`internalQuery`, `internalMutation`, `internalAction`).
4.  **Function Calling:** Adhere to rules for `ctx.runQuery`, `ctx.runMutation`, `ctx.runAction`, including specifying return types for calls within the same file to avoid TypeScript circularity issues.

## II. Frontend Optimization (React - `ProjectionPage.tsx`)

A performant frontend is key to a good user experience, especially for data-intensive pages like projections.

### A. State Management and Data Fetching

Efficiently managing state and fetching data is fundamental.

1.  **Efficient Data Fetching with `useQuery`:**
    *   Ensure `useQuery` from `convex/react` is used optimally. Convex's React bindings generally handle re-fetching well, but ensure dependencies are correctly managed if you have complex argument objects.
    *   For paginated data that might feed into projections, ensure `initialNumItems` is reasonable.

2.  **Minimize Redundant API Calls:**
    *   Leverage Convex's reactive nature. Data fetched once via `useQuery` should update automatically when underlying data changes. Avoid manual re-fetching unless absolutely necessary.

3.  **Loading States:**
    *   Implement clear, non-disruptive loading indicators (e.g., skeletons, spinners) while data is being fetched or processed. This improves perceived performance.

4.  **Error Handling:**
    *   Use React Error Boundaries to catch rendering errors in components.
    *   Provide user-friendly messages and recovery options when API calls fail or unexpected issues occur.

### B. Component Rendering Performance

Minimizing re-renders and optimizing component updates is crucial.

1.  **Memoization:**
    *   **`React.memo`:** Wrap functional components in `React.memo` if they render frequently with the same props. This is particularly useful for list items like `TransactionItem` or sections like `MonthAccordion`.
    *   **`useMemo`:**
        *   For expensive calculations derived from props or state (e.g., `totalExpenses`, `totalIncome`, `netFlow`, `monthlyData`, `barChartData`, `groupedData` in `ProjectionPage.tsx`).
        *   To memoize objects or arrays passed as props to child components, preventing unnecessary re-renders of those children if the data hasn't actually changed. Example: the `config` prop for `ChartBarLineCombined`.
        *   Refactor `getCategoryName` to compute a `Map` for categories once using `useMemo` and reuse it, significantly speeding up lookups.
    *   **`useCallback`:**
        *   Wrap functions (especially event handlers) that are passed as props to memoized child components in `useCallback`. This ensures that the child component doesn't re-render just because the parent re-rendered and created a new function instance.

2.  **Virtualization for Long Lists:**
    *   If the accordion sections can contain a very large number of transaction items, or if there are many months displayed, rendering all items at once can severely impact performance.
    *   Consider using a virtualization library (e.g., `react-window`, `tanstack-virtual`) for these lists. Virtualization only renders the items currently visible in the viewport, dramatically improving performance for long lists.

3.  **Optimize Conditional Rendering:**
    *   Ensure that conditional rendering logic doesn't cause components to be unnecessarily unmounted and remounted, which can lead to loss of state and performance overhead.
    *   Prefer conditional rendering of content *within* a component rather than conditionally rendering the entire component if only parts change.

4.  **Code Splitting:**
    *   If `ProjectionPage.tsx` or its dependencies become very large, consider using `React.lazy` and `Suspense` for code splitting. This allows loading parts of the page or specific components on demand, reducing the initial bundle size and improving load times.

### C. Data Structures and Computations

Efficient client-side data handling matters.

1.  **Efficient Data Manipulation:**
    *   When processing the `projections` array (filtering, reducing, mapping, grouping):
        *   Use efficient JavaScript array methods and object manipulations.
        *   Profile these operations using browser dev tools if they seem slow, especially with larger datasets.
        *   The previously mentioned `getCategoryName` optimization (using a `Map`) is a prime example.

2.  **Avoid Computations in Render Path:**
    *   Move all significant data transformations, calculations, and derivations out of the direct render path (i.e., the main body of the functional component). Instead, perform these inside `useMemo` hooks.

### D. Debouncing and Throttling

For user inputs that trigger re-calculations or data re-fetches (e.g., date range pickers, search/filter inputs if added later):

*   **Debounce:** Delay function execution until after a certain period of inactivity (e.g., user stops typing).
*   **Throttle:** Limit the rate at which a function can be executed (e.g., once every 200ms).
*   The existing `DateRangePicker` might already handle some of this, but it's a general strategy to keep in mind.

### C. Frontend Optimization Checklist

#### 1. HomePage.tsx
- [x] Implement React.memo for list components
  - Transaction list items
  - Chart components
- [x] Add useMemo for expensive calculations
  - Category totals calculations
  - Monthly data aggregations
  - Chart data transformations
- [x] Optimize component rendering with useCallback
  - Event handlers for chart type switching
  - Category name lookup functions
- [x] Implement virtualization for transaction lists
- [x] Review and optimize conditional rendering
  - Chart type switching
  - Loading states

#### 2. ProjectionPage.tsx
- [x] Implement React.memo for list components (already done)
- [x] Add useMemo for expensive calculations (already done)
- [x] Optimize component rendering with useCallback (already done)
- [x] Implement virtualization for long lists (already done)
- [ ] Review and optimize conditional rendering
  - Loading states
  - Error states
  - Empty states

#### 3. ConfigPage.tsx
- [ ] Implement React.memo for list components
  - Category lists
  - Payment type lists
- [ ] Add useMemo for expensive calculations
  - Category filtering
  - Payment type filtering
- [ ] Optimize component rendering with useCallback
  - Category management functions
  - Payment type management functions
- [ ] Review and optimize conditional rendering
  - View switching
  - Loading states

#### 4. AddExpensePage.tsx
- [ ] Implement React.memo for form components
- [ ] Add useMemo for expensive calculations
  - Category filtering
  - Payment type filtering
- [ ] Optimize component rendering with useCallback
  - Form submission handlers
  - Validation functions
- [ ] Review and optimize conditional rendering
  - Form validation states
  - Loading states

#### 5. ManageTransactionsPage.tsx
- [ ] Implement React.memo for list components
  - Transaction list items
  - Recurring transaction lists
- [ ] Add useMemo for expensive calculations
  - Transaction filtering
  - Category lookups
  - Payment type lookups
- [ ] Optimize component rendering with useCallback
  - Transaction management functions
  - Swipe handlers
  - Tab switching functions
- [ ] Implement virtualization for transaction lists
- [ ] Review and optimize conditional rendering
  - Tab switching
  - Loading states
  - Swipe states

#### 6. TransactionsNavigationPage.tsx
- [ ] Implement React.memo for navigation cards
- [ ] Optimize component rendering with useCallback
  - Navigation handlers
- [ ] Review and optimize conditional rendering
  - Loading states

#### General Optimization Tasks Across All Pages
1. [ ] Implement proper loading states and skeletons
2. [ ] Add error boundaries for better error handling
3. [ ] Optimize data fetching patterns
4. [ ] Implement proper code splitting
5. [ ] Add proper TypeScript types for all components
6. [ ] Implement proper accessibility features
7. [ ] Add proper test coverage

## III. Monitoring and Profiling

You can't optimize what you don't measure.

### A. Backend Monitoring

1.  **Convex Dashboard:**
    *   Regularly use the Convex dashboard to monitor query performance (execution times, number of documents scanned vs. returned), function execution times, and identify any errors or warnings.
2.  **Logging:**
    *   Implement strategic logging (`console.log`, or a more structured logging solution if needed) within complex Convex functions or those suspected of performance issues to trace execution paths and variable states.

### B. Frontend Profiling

1.  **React Developer Tools Profiler:**
    *   Use the Profiler tab in React DevTools to identify performance bottlenecks in your React components. It helps visualize component render times, identify unnecessary re-renders, and understand commit phases.
2.  **Browser Performance Tools:**
    *   Leverage the browser's built-in performance profilers (e.g., Chrome DevTools "Performance" tab, Firefox "Performance" panel) to record and analyze JavaScript execution, rendering, and layout performance.

### C. Iterative Optimization Process

1.  **Measure Before Optimizing:** Don't engage in premature optimization. Use profiling tools to identify actual bottlenecks first.
2.  **Benchmark Changes:** After applying an optimization, measure its impact to confirm it has improved performance and not introduced regressions.
3.  **Regular Review:** Performance optimization is not a one-time task. Periodically review and re-profile the application, especially as new features are added or data volume grows.

## IV. Action Plan & Prioritization (Example)

This is a suggested prioritization. Adjust based on observed performance issues.

1.  **High Priority (Immediate Gains):**
    *   **Frontend:**
        *   Implement `useMemo` for all major calculations and data transformations in `ProjectionPage.tsx` (e.g., `totalExpenses`, `totalIncome`, `netFlow`, `