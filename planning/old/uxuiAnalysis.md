## Home Page UX/UI Analysis (localhost:5173)

Date: 2025-08-16

### Overview
- The home route renders an unauthenticated landing/sign-in state.
- Title: "PerFi". Viewport tested: 1038x640 @ DPR 1.5.

### Visible UI (unauthenticated)
- Branding: Logo image with alt "PerFi App Logo".
- Message: "Sign in to get started" (rendered as generic text, not a semantic heading).
- Primary actions:
  - "Sign in with Google"
  - "Sign in with Email"
- Toaster region present for notifications.

### Navigation & IA
- No persistent navigation visible pre-auth.
- Clear primary path (authentication). No secondary links (privacy/terms/help) visible.

### Accessibility
- Landmarks: `main` present. No `header`/`nav` on this screen (reasonable for sign-in).
- Logo has descriptive alt. Good.
- Missing semantic heading (`h1`) for the page title; current prompt text is not a heading. Add an `h1` for better structure and screen reader context.
- Ensure buttons include accessible names (they do), and visible focus states are present (not verified via keyboard here—recommend quick audit).

### Performance signals (first load)
- Network: expected Vite dev assets; multiple heavy libs preloaded (charts, recharts, date-fns, Radix UI bundles). Consider code-splitting to avoid loading charts and large UI libs on the unauthenticated screen.
- External fonts (Google Fonts) requested; fine for dev, consider self-hosting for prod reliability.

### Console & runtime
- Auth state logs indicate unauthenticated and a short "Auth0 is loading" phase.
- React Router v7 future flag warnings present.

Logs (excerpt):
```
[WARNING] React Router Future Flag Warning: v7_startTransition
[WARNING] React Router Future Flag Warning: v7_relativeSplatPath
[LOG] App.tsx: Auth0 is loading, waiting...
[LOG] Skipping user creation: conditions not met (no user)
```

### Interaction notes
- Primary buttons appear clickable and visible. Not enough content to test scrolling.
- No spinner or skeleton beyond the brief Auth0 loading message; load is fast in dev, but a subtle progress indicator would help slower networks.

### Content
- Copy is minimal and clear for MVP. Consider a brief value prop below the heading (what PerFi does) to set context before sign-in.

### Issues/Risks
- Lack of semantic heading hierarchy (no `h1`).
- Unnecessary bundles loaded pre-auth (charts, analytics, complex UI components) increasing TTI.
- Repeated console logs could clutter debugging; consider gating to dev or deduping.
- React Router warnings indicate future behavioral changes; advisable to opt into flags and test.

### Recommendations (short list)
- Accessibility
  - Add `h1` for the page title (e.g., "Welcome to PerFi").
  - Verify keyboard focus ring visibility on the two sign-in buttons.
- Performance
  - Code-split charting and heavy UI modules so they are not included in the unauthenticated bundle.
  - Consider self-hosting fonts for production.
- UX copy
  - Add a one-liner value proposition under the heading.
  - Optionally add small links: "Privacy", "Terms", "Help" in footer for trust.
- Developer hygiene
  - Address React Router v7 future flags now to remove warnings and reduce upgrade risk.
  - Reduce noisy auth logs in production.

### Done / Observed
- Page URL: http://localhost:5173/
- Title: PerFi
- Elements found: logo image (alt ok), two primary sign-in buttons, toaster region.
- No blocking errors; page is functional.

---

## Post-login (authenticated) view

### Overview
- Authenticated session detected (Auth0) and user record ensured via backend.
- Primary screen shows a dashboard-style Home:
  - Top banner/header with logo and label "Home".
  - Period/section label: "August 2025" with "Expenses" label.
  - KPI card showing Total: `$10.000`.
  - Tabs/filters: "Current Month", "Income vs Expenses".
  - Transaction accordion/list entries (examples):
    - 15-Aug — Amount: `$-10.000`
    - 01-Aug — Amount: `+$20.000`
  - Bottom navigation with 5 icon-only buttons.

### Accessibility
- Header landmark appears as `banner`; `main` present; `navigation` present for bottom nav.
- Bottom nav buttons appear icon-only without visible text; ensure each has an accessible name via `aria-label` and/or visually hidden text.
- Transaction list items render as headings (level 3) wrapping a clickable button; confirm correct heading hierarchy and that buttons have clear accessible names beyond concatenated text.
- Dialog warnings in console: Missing `Description` or `aria-describedby` for `DialogContent` (likely Radix UI). Add a `Description` component or set `aria-describedby` linking to descriptive content.

### Data formatting & semantics
- Currency formatting shows `$10.000` and `$-10.000` using dot as thousands separator. Align with locale strategy (e.g., `es-AR` vs `en-US`) and be consistent across UI.
- Consider `- $10.000` or `-$10.000` instead of `$-10.000` for clarity; pick a single style.
- Use color semantics and icons (up/down) for income vs expenses with sufficient contrast and non-color cues.
- Dates shown as `15-Aug` and `01-Aug`—standardize format (and localize) per user preference.

### Navigation & IA
- "Home" is a helpful context, but consider breadcrumbs or a period switcher near "August 2025" for discoverability (month selector).
- Bottom nav: add tooltips on hover/focus and active state indication (aria-current="page").

### Performance
- Charts and multiple UI libraries load. On the Home route that shows KPIs/graphs, this is expected; still ensure code-splitting keeps unrelated heavy modules off initial route.
- Defer non-critical modules until after main content paint (e.g., chart plugins, datalabels).

### Console & runtime
- Auth logs indicate successful user creation/check.
- Convex mutation observed for recurring transaction add. No blocking errors.
- Repeated `DialogContent` accessibility warnings—fix recommended.

### Recommendations (authenticated view)
- Accessibility
  - Add accessible names to all icon-only nav buttons (aria-label) and consider visible labels on larger screens.
  - Fix Radix Dialog warnings by providing `Description` or `aria-describedby`.
  - Ensure each accordion header/button has a unique, concise accessible name.
  - Verify focus outlines are clearly visible for all interactive elements.
- UX
  - Add a month selector near "August 2025" with quick jump to previous/next month.
  - Clarify currency formatting and sign placement; localize to user settings.
  - Use consistent positive/negative styling with non-color cues.
  - Consider small summary chips for Income, Expenses, Net for the selected period.
- Performance
  - Confirm route-level code-splitting; lazy load charts where possible.
  - Preload only critical font weights; defer others.
- Dev hygiene
  - Resolve React Router v7 future flags by opting in and validating behavior.
  - Reduce verbose auth logs in production.

### Observed (authenticated)
- Header: logo + "Home".
- KPI: Total `$10.000` for "Expenses" in August 2025.
- Tabs: "Current Month" / "Income vs Expenses".
- Transactions: entries for 15-Aug (expense) and 01-Aug (income).
- Bottom nav: 5 icon-only buttons, labels not visible.
- Console: Authenticated; dialog accessibility warnings present.


