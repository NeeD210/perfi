# PerFi Brand & Design System

This document defines the complete branding, visual identity, and UI design system for the PerFi personal finance application.

---

## Quick Reference

Most frequently used tokens for rapid development:

| Category | Token | Class/Value |
|----------|-------|-------------|
| **Primary Color** | `--primary` | `bg-primary`, `text-primary` |
| **Muted Text** | `--muted-foreground` | `text-muted-foreground` |
| **Card Background** | `--card` | `bg-card` |
| **Border** | `--border` | `border`, `border-border` |
| **Radius** | `--radius` | `rounded-lg` (8px) |
| **Spacing** | 16px | `p-4`, `gap-4` |
| **Font** | Poppins | `font-sans` |
| **Income** | Green | `text-green-600` |
| **Expense** | Red | `text-red-600` |
| **Shadow** | Default | `shadow-md` |

---

## Brand Identity

### Name & Tagline
- **Brand Name:** PerFi (Personal Finance)
- **Tagline:** "App" (displayed beneath logo)
- **Full Name:** PerFi App

### Logo System

The PerFi logo features the wordmark "PerFi" with a distinctive purple gradient dot accent above the "i".

| Variant | File | Usage |
|---------|------|-------|
| Light Mode Logo | `src/img/PerFi_logo.png` | Header on light backgrounds |
| Dark Mode Logo | `src/img/perfi_logo_dark.png` | Header on dark backgrounds |
| Black Wordmark | `src/img/perfi_black.png` | Alternative dark context |
| White Wordmark | `src/img/perfi_white.png` | Alternative light context |
| PFI Dark Icon | `src/img/PFI_dark.png` | Compact icon variant |
| PFI White Icon | `src/img/PFI_white.png` | Compact icon variant |

**Logo Characteristics:**
- Wordmark style with "PerFi" as primary text
- "App" subtitle in smaller, lighter weight text
- Signature purple gradient dot (spherical, 3D effect) replaces the dot on "i"
- Clean, modern sans-serif typography
- Height constraint: `h-10` (40px) in header, `h-16` (64px) on auth screens

---

## Color System

### Design Token Architecture

Colors are defined as HSL CSS variables in `src/index.css` and consumed via Tailwind utilities. This enables seamless theme switching.

### Light Theme Palette

| Token | HSL Value | Hex Approximate | Usage |
|-------|-----------|-----------------|-------|
| `--background` | `0 0% 100%` | `#FFFFFF` | Page backgrounds |
| `--foreground` | `222.2 84% 4.9%` | `#030712` | Primary text |
| `--card` | `0 0% 100%` | `#FFFFFF` | Card backgrounds |
| `--card-foreground` | `222.2 84% 4.9%` | `#030712` | Card text |
| `--popover` | `0 0% 100%` | `#FFFFFF` | Popover/dropdown backgrounds |
| `--popover-foreground` | `222.2 84% 4.9%` | `#030712` | Popover text |
| `--primary` | `222.2 47.4% 11.2%` | `#1E293B` | Primary buttons, active states |
| `--primary-foreground` | `210 40% 98%` | `#F8FAFC` | Text on primary |
| `--secondary` | `210 40% 96.1%` | `#F1F5F9` | Secondary buttons |
| `--secondary-foreground` | `222.2 47.4% 11.2%` | `#1E293B` | Text on secondary |
| `--muted` | `210 40% 96.1%` | `#F1F5F9` | Muted backgrounds |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `#64748B` | Secondary text |
| `--accent` | `210 40% 96.1%` | `#F1F5F9` | Accent backgrounds |
| `--accent-foreground` | `222.2 47.4% 11.2%` | `#1E293B` | Accent text |
| `--destructive` | `0 84.2% 60.2%` | `#EF4444` | Error states, delete actions |
| `--destructive-foreground` | `210 40% 98%` | `#F8FAFC` | Text on destructive |
| `--border` | `214.3 31.8% 91.4%` | `#E2E8F0` | Borders |
| `--input` | `214.3 31.8% 91.4%` | `#E2E8F0` | Input borders |
| `--ring` | `222.2 84% 4.9%` | `#030712` | Focus rings |

### Dark Theme Palette

| Token | HSL Value | Hex Approximate | Usage |
|-------|-----------|-----------------|-------|
| `--background` | `222.2 84% 4.9%` | `#030712` | Page backgrounds |
| `--foreground` | `210 40% 98%` | `#F8FAFC` | Primary text |
| `--card` | `222.2 84% 4.9%` | `#030712` | Card backgrounds |
| `--card-foreground` | `210 40% 98%` | `#F8FAFC` | Card text |
| `--primary` | `210 40% 98%` | `#F8FAFC` | Primary buttons |
| `--primary-foreground` | `222.2 47.4% 11.2%` | `#1E293B` | Text on primary |
| `--secondary` | `217.2 32.6% 17.5%` | `#1E293B` | Secondary elements |
| `--secondary-foreground` | `210 40% 98%` | `#F8FAFC` | Text on secondary |
| `--muted` | `217.2 32.6% 17.5%` | `#1E293B` | Muted backgrounds |
| `--muted-foreground` | `215 20.2% 65.1%` | `#94A3B8` | Secondary text |
| `--accent` | `217.2 32.6% 17.5%` | `#1E293B` | Accent backgrounds |
| `--destructive` | `0 62.8% 30.6%` | `#7F1D1D` | Error states (darker) |
| `--border` | `217.2 32.6% 17.5%` | `#1E293B` | Borders |
| `--ring` | `212.7 26.8% 83.9%` | `#CBD5E1` | Focus rings |

### Semantic Colors

| Purpose | Light Mode | Dark Mode | Tailwind Class |
|---------|------------|-----------|----------------|
| Income/Positive | `#10B981` | `#10B981` | `text-green-600` |
| Expense/Negative | `#EF4444` | `#EF4444` | `text-red-600` |
| Neutral Amount | Theme foreground | Theme foreground | `text-foreground` |

### Status & Feedback Colors

| Token | HSL Value | Hex | Usage |
|-------|-----------|-----|-------|
| `--success` | `142 76% 36%` | `#16A34A` | Success states, confirmations |
| `--success-foreground` | `0 0% 100%` | `#FFFFFF` | Text on success |
| `--warning` | `38 92% 50%` | `#F59E0B` | Warnings, caution states |
| `--warning-foreground` | `0 0% 0%` | `#000000` | Text on warning |
| `--info` | `199 89% 48%` | `#0EA5E9` | Informational messages |
| `--info-foreground` | `0 0% 100%` | `#FFFFFF` | Text on info |

### Gradient System

```css
/* Brand Gradient - Used in logo dot */
--gradient-brand: linear-gradient(135deg, #9333EA 0%, #7C3AED 50%, #6366F1 100%);

/* Surface Gradients */
--gradient-surface-light: linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(210 40% 96.1%) 100%);
--gradient-surface-dark: linear-gradient(180deg, hsl(222.2 84% 4.9%) 0%, hsl(217.2 32.6% 17.5%) 100%);

/* Accent Gradient - For special CTAs */
--gradient-accent: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
```

### Chart Category Colors

Used for data visualization in donut and bar charts:

```typescript
const categoryColors = [
  '#FF6384', // Rose/Pink
  '#36A2EB', // Blue
  '#FFCE56', // Yellow
  '#4BC0C0', // Teal
  '#9966FF', // Purple
  '#FF9F40', // Orange
  '#4ADE80', // Green
  '#F472B6', // Pink
  '#60A5FA', // Light Blue
  '#FBBF24', // Amber
];
```

### Opacity Scale

| Token | Value | Usage |
|-------|-------|-------|
| `opacity-disabled` | `0.5` | Disabled elements |
| `opacity-overlay` | `0.8` | Modal backdrops |
| `opacity-hover` | `0.9` | Hover state dimming |
| `opacity-muted` | `0.7` | Secondary/tertiary content |
| `opacity-ghost` | `0.1` | Ghost button backgrounds on hover |

```tsx
// Usage examples
<Button disabled className="opacity-50 cursor-not-allowed" />
<div className="fixed inset-0 bg-black/80" /> {/* Overlay */}
<Button className="hover:bg-primary/90" /> {/* Hover */}
```

### Fixed Utility Colors

| Purpose | Value | Usage |
|---------|-------|-------|
| Light absolute | `#FFFFFF` | `--color-light` |
| Dark absolute | `#171717` | `--color-dark` |

---

## Typography

### Font Stack

**Primary Font:** Poppins (Google Font)

```css
font-family:
  "Poppins",
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Roboto,
  "Helvetica Neue",
  Arial,
  "Noto Sans",
  sans-serif,
  "Apple Color Emoji",
  "Segoe UI Emoji",
  "Segoe UI Symbol",
  "Noto Color Emoji";
```

### Font Weight Scale

| Weight | Class | Usage |
|--------|-------|-------|
| 400 (Regular) | `font-normal` | Body text |
| 500 (Medium) | `font-medium` | Labels, buttons, navigation |
| 600 (Semibold) | `font-semibold` | Card titles, section headers |
| 700 (Bold) | `font-bold` | Page titles, amounts |

### Text Size Scale

| Size | Class | Usage |
|------|-------|-------|
| 12px | `text-xs` | Tertiary labels, timestamps |
| 14px | `text-sm` | Secondary text, descriptions |
| 16px | `text-base` | Body text, list items |
| 18px | `text-lg` | Section titles |
| 20px | `text-xl` | Card headers |
| 24px | `text-2xl` | Page titles, chart totals |
| 30px | `text-3xl` | Hero numbers, balances |

### Text Colors

| Purpose | Class | Description |
|---------|-------|-------------|
| Primary | `text-foreground` | Main content |
| Secondary | `text-muted-foreground` | Descriptions, hints |
| Tertiary | `text-muted-foreground/70` | Timestamps, metadata |
| Accent | `text-slate-600` / `.accent-text` | Decorative accent |
| Link | `text-blue-500` | Interactive links |
| Success | `text-green-600` | Positive values, confirmations |
| Error | `text-red-600` / `text-destructive` | Errors, negative values |

---

## Elevation & Shadows

### Shadow Scale

| Level | Token | CSS Value | Usage |
|-------|-------|-----------|-------|
| 0 | `shadow-none` | `none` | Flat elements |
| 1 | `shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Subtle lift |
| 2 | `shadow` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | Cards default |
| 3 | `shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Elevated cards |
| 4 | `shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | Dropdowns, popovers |
| 5 | `shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` | Modals, dialogs |
| 6 | `shadow-2xl` | `0 25px 50px -12px rgb(0 0 0 / 0.25)` | Maximum elevation |

### Shadow Usage by Component

```tsx
// Cards - default
<Card className="shadow" />

// Cards - hover state
<Card className="shadow hover:shadow-lg transition-shadow" />

// Dropdowns & Popovers
<PopoverContent className="shadow-lg" />

// Modals & Dialogs
<DialogContent className="shadow-xl" />

// FAB (Floating Action Button)
<Button className="shadow-lg hover:shadow-xl" />
```

### Z-Index Architecture

| Layer | Z-Index | Token | Usage |
|-------|---------|-------|-------|
| Base | `0` | `z-0` | Default content |
| Raised | `10` | `z-10` | Sticky elements in flow |
| Dropdown | `20` | `z-20` | Select menus, popovers |
| Sticky | `30` | `z-30` | Sticky headers |
| Fixed | `40` | `z-40` | Fixed nav, bottom bar |
| Modal Backdrop | `50` | `z-50` | Overlay behind modals |
| Modal | `60` | `z-[60]` | Dialog content |
| Toast | `70` | `z-[70]` | Notifications |
| Tooltip | `80` | `z-[80]` | Tooltips (always on top) |

```tsx
// Header
<header className="fixed top-0 left-0 right-0 z-40" />

// Bottom Navigation
<nav className="fixed bottom-0 left-0 right-0 z-40" />

// Modal Overlay
<div className="fixed inset-0 z-50 bg-black/80" />

// Modal Content
<div className="fixed z-[60] ..." />

// Toast Notifications
<div className="fixed top-4 right-4 z-[70]" />
```

---

## Spacing & Layout

### Base Radius

```css
--radius: 0.5rem; /* 8px */
```

| Size | Value | Usage |
|------|-------|-------|
| `rounded-sm` | 4px | Small elements, badges |
| `rounded-md` | 6px | Buttons, inputs |
| `rounded-lg` | 8px | Cards, containers |
| `rounded-xl` | 12px | Cards (primary), modals |
| `rounded-2xl` | 16px | Large cards, hero sections |
| `rounded-full` | 9999px | Icon buttons, avatars, pills |

### Container Constraints

```javascript
container: {
  center: true,
  padding: '2rem',
  screens: {
    '2xl': '1400px'
  }
}
```

### Standard Spacing

| Spacing | Class | Pixels | Usage |
|---------|-------|--------|-------|
| Page padding | `p-4` | 16px | Main content |
| Card padding | `p-4` / `p-6` | 16px / 24px | Card content |
| Gap between cards | `gap-4` | 16px | Lists, grids |
| Gap between sections | `gap-6` | 24px | Page sections |
| Form field spacing | `gap-4` | 16px | Form layouts |
| Label-to-input | `space-y-2` | 8px | Form fields |
| Icon-to-text | `gap-2` | 8px | Inline icon + text |
| Button content | `gap-2` | 8px | Icon + label in buttons |

---

## Component Patterns

### Buttons

**Variants (shadcn/ui New York style):**

| Variant | Appearance | Usage |
|---------|------------|-------|
| `default` | Solid primary bg, light text | Primary actions |
| `secondary` | Muted bg, dark text | Secondary actions |
| `outline` | Border only, transparent bg | Tertiary actions |
| `ghost` | No bg, hover reveals accent | Navigation, icon buttons |
| `destructive` | Red bg | Delete, cancel |
| `link` | Underlined text | Inline links |

**Sizes:**

| Size | Class | Dimensions |
|------|-------|------------|
| Default | `h-9 px-4 py-2` | 36px height |
| Small | `h-8 px-3 text-xs` | 32px height |
| Large | `h-10 px-8` | 40px height |
| Icon | `h-9 w-9` | 36px square |

**Button State Matrix:**

| State | Background | Border | Text | Shadow | Cursor |
|-------|------------|--------|------|--------|--------|
| Default | `primary` | none | `primary-foreground` | `shadow-sm` | `pointer` |
| Hover | `primary/90` | none | `primary-foreground` | `shadow-md` | `pointer` |
| Active | `primary/80` | none | `primary-foreground` | `shadow-sm` | `pointer` |
| Focus | `primary` | `ring-2 ring-ring` | `primary-foreground` | — | `pointer` |
| Disabled | `muted` | none | `muted-foreground` | none | `not-allowed` |
| Loading | `primary/80` | none | `primary-foreground` | — | `wait` |

```tsx
// Primary Button
<Button>Save Changes</Button>

// Secondary Button
<Button variant="secondary">Cancel</Button>

// Destructive Button
<Button variant="destructive">Delete</Button>

// Ghost Icon Button
<Button variant="ghost" size="icon">
  <Settings className="h-4 w-4" />
</Button>

// Loading State
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Saving...
</Button>

// Disabled State
<Button disabled className="opacity-50 cursor-not-allowed">
  Submit
</Button>
```

### Cards

```tsx
<Card className="rounded-xl border bg-card text-card-foreground shadow">
  <CardHeader className="flex flex-col space-y-1.5 p-6">
    <CardTitle className="font-semibold leading-none tracking-tight" />
    <CardDescription className="text-sm text-muted-foreground" />
  </CardHeader>
  <CardContent className="p-6 pt-0" />
  <CardFooter className="flex items-center p-6 pt-0" />
</Card>
```

**Interactive Cards:**

```tsx
<Card className="cursor-pointer transition-shadow hover:shadow-lg">
  {/* ... */}
</Card>
```

**Card with Status Indicator:**

```tsx
<Card className="relative overflow-hidden">
  <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
  {/* ... */}
</Card>
```

### Inputs

```tsx
// Base Input
<Input
  className="w-full px-3 py-2 rounded-md bg-transparent border border-input
             focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
/>

// Input with Error
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    className="border-destructive focus:ring-destructive"
    aria-invalid="true"
  />
  <p className="text-sm text-destructive">Please enter a valid email address.</p>
</div>

// Input with Success
<Input className="border-green-500 focus:ring-green-500" />
```

**Input States:**

| State | Border | Ring | Background |
|-------|--------|------|------------|
| Default | `border-input` | — | `bg-transparent` |
| Focus | `border-ring` | `ring-2 ring-ring` | `bg-transparent` |
| Error | `border-destructive` | `ring-destructive` | `bg-transparent` |
| Success | `border-green-500` | `ring-green-500` | `bg-transparent` |
| Disabled | `border-muted` | — | `bg-muted` |

### Drawers

- Used for mobile-first transaction entry forms
- Full-width, slides from bottom
- Max height: `max-h-[90vh]`
- Background: `bg-background`
- Rounded corners: `rounded-t-[10px]`

```tsx
<Drawer>
  <DrawerTrigger asChild>
    <Button>Open</Button>
  </DrawerTrigger>
  <DrawerContent className="max-h-[90vh]">
    <DrawerHeader>
      <DrawerTitle>Title</DrawerTitle>
      <DrawerDescription>Description</DrawerDescription>
    </DrawerHeader>
    <div className="p-4">{/* Content */}</div>
    <DrawerFooter>
      <Button>Submit</Button>
      <DrawerClose asChild>
        <Button variant="outline">Cancel</Button>
      </DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

### Accordions

- Animated expand/collapse (200ms ease-out)
- Bottom border between items: `border-b`
- Chevron rotates 180° on open
- Content padding: `pb-4 pt-0`

```tsx
<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>Section Title</AccordionTrigger>
    <AccordionContent>
      Content goes here.
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

---

## Loading & Skeleton States

### Skeleton Components

Base skeleton styling:

```tsx
// Base skeleton class
className="animate-pulse bg-muted rounded-md"
```

**Skeleton Variants:**

| Type | Class | Usage |
|------|-------|-------|
| Text line | `h-4 w-3/4 rounded bg-muted animate-pulse` | Paragraph text |
| Title | `h-6 w-1/2 rounded bg-muted animate-pulse` | Headings |
| Avatar | `h-10 w-10 rounded-full bg-muted animate-pulse` | User avatars |
| Card | `h-32 w-full rounded-xl bg-muted animate-pulse` | Card placeholders |
| Button | `h-9 w-24 rounded-md bg-muted animate-pulse` | Button placeholders |
| Amount | `h-8 w-20 rounded bg-muted animate-pulse` | Currency values |

**Transaction Row Skeleton:**

```tsx
const TransactionSkeleton = () => (
  <div className="flex items-center gap-4 p-4">
    <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
    <div className="flex-1 space-y-2">
      <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
      <div className="h-3 w-1/4 rounded bg-muted animate-pulse" />
    </div>
    <div className="h-5 w-16 rounded bg-muted animate-pulse" />
  </div>
);
```

**Card Skeleton:**

```tsx
const CardSkeleton = () => (
  <Card className="p-6">
    <div className="space-y-4">
      <div className="h-6 w-1/3 rounded bg-muted animate-pulse" />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
        <div className="h-4 w-4/5 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-10 w-24 rounded-md bg-muted animate-pulse" />
    </div>
  </Card>
);
```

### Loading Spinners

```tsx
import { Loader2 } from "lucide-react";

// Inline spinner
<Loader2 className="h-4 w-4 animate-spin" />

// Centered page loader
<div className="flex items-center justify-center h-64">
  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
</div>

// Button loading state
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Loading...
</Button>
```

### Progress Indicators

```tsx
// Linear Progress Bar
<div className="h-2 w-full bg-muted rounded-full overflow-hidden">
  <div 
    className="h-full bg-primary transition-all duration-300"
    style={{ width: `${progress}%` }}
  />
</div>

// Circular Progress (for budgets)
<div className="relative h-20 w-20">
  <svg className="h-full w-full -rotate-90">
    <circle
      className="text-muted stroke-current"
      strokeWidth="8"
      fill="transparent"
      r="36"
      cx="40"
      cy="40"
    />
    <circle
      className="text-primary stroke-current transition-all duration-300"
      strokeWidth="8"
      strokeLinecap="round"
      fill="transparent"
      r="36"
      cx="40"
      cy="40"
      strokeDasharray={`${progress * 2.26} 226`}
    />
  </svg>
  <span className="absolute inset-0 flex items-center justify-center text-sm font-medium">
    {progress}%
  </span>
</div>
```

---

## Error & Empty States

### Error States

**Inline Field Error:**

```tsx
<div className="space-y-2">
  <Label htmlFor="amount" className="text-destructive">Amount</Label>
  <Input
    id="amount"
    className="border-destructive focus-visible:ring-destructive"
    aria-invalid="true"
    aria-describedby="amount-error"
  />
  <p id="amount-error" className="text-sm text-destructive flex items-center gap-1">
    <AlertCircle className="h-3 w-3" />
    Please enter a valid amount.
  </p>
</div>
```

**Error Card/Banner:**

```tsx
const ErrorBanner = ({ message }: { message: string }) => (
  <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
    <p className="text-sm text-destructive">{message}</p>
  </div>
);
```

**Full Page Error:**

```tsx
const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center h-64 text-center p-6">
    <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
      <AlertCircle className="h-6 w-6 text-destructive" />
    </div>
    <h3 className="font-semibold text-lg mb-1">Something went wrong</h3>
    <p className="text-muted-foreground text-sm mb-4">{message}</p>
    {onRetry && (
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    )}
  </div>
);
```

### Empty States

**Empty List:**

```tsx
const EmptyState = ({ 
  icon: Icon, 
  title, 
  description, 
  action 
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) => (
  <div className="flex flex-col items-center justify-center h-64 text-center p-6">
    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
      <Icon className="h-6 w-6 text-muted-foreground" />
    </div>
    <h3 className="font-semibold text-lg mb-1">{title}</h3>
    <p className="text-muted-foreground text-sm mb-4 max-w-xs">{description}</p>
    {action && (
      <Button onClick={action.onClick}>
        <Plus className="mr-2 h-4 w-4" />
        {action.label}
      </Button>
    )}
  </div>
);

// Usage
<EmptyState
  icon={Wallet}
  title="No transactions yet"
  description="Start tracking your finances by adding your first transaction."
  action={{ label: "Add Transaction", onClick: () => {} }}
/>
```

**Empty Search Results:**

```tsx
const NoResults = ({ query }: { query: string }) => (
  <div className="flex flex-col items-center justify-center h-48 text-center">
    <Search className="h-8 w-8 text-muted-foreground mb-3" />
    <p className="text-muted-foreground">
      No results for "<span className="font-medium text-foreground">{query}</span>"
    </p>
  </div>
);
```

---

## Toast & Notifications

### Toast Variants

| Variant | Icon | Colors | Usage |
|---------|------|--------|-------|
| Default | — | `bg-background border` | Neutral messages |
| Success | `CheckCircle` | `bg-green-50 border-green-200 text-green-800` | Confirmations |
| Error | `XCircle` | `bg-red-50 border-red-200 text-red-800` | Error messages |
| Warning | `AlertTriangle` | `bg-amber-50 border-amber-200 text-amber-800` | Warnings |
| Info | `Info` | `bg-blue-50 border-blue-200 text-blue-800` | Informational |

### Toast Usage

```tsx
import { toast } from "@/components/ui/use-toast";

// Success
toast({
  title: "Transaction saved",
  description: "Your expense has been recorded.",
  variant: "default", // Use custom styling via className
  className: "bg-green-50 border-green-200",
});

// Error
toast({
  title: "Failed to save",
  description: "Please check your connection and try again.",
  variant: "destructive",
});

// With Action
toast({
  title: "Transaction deleted",
  description: "The transaction has been removed.",
  action: (
    <ToastAction altText="Undo" onClick={handleUndo}>
      Undo
    </ToastAction>
  ),
});
```

### Toast Positioning

- Position: Top-right on desktop, top-center on mobile
- Z-index: `z-[70]`
- Animation: Slide in from right, fade out

---

## Navigation

### Bottom Navigation Bar

**Structure:** 4-tab navigation + central FAB

```
[Home] [Projections] [+FAB] [Transactions] [Settings]
```

**Styling:**
- Fixed position: `fixed bottom-0 left-0 right-0 z-40`
- Background: `bg-background` with top border
- Padding: `p-4`
- Max width: `max-w-md mx-auto`
- Button style: `variant="ghost" size="icon" className="rounded-full"`

**Active State:**
- Active: `text-primary`
- Inactive: `text-muted-foreground`

**FAB (Floating Action Button):**
- Centered with `relative` positioning
- Style: `rounded-full bg-primary hover:bg-primary/90 shadow-lg`
- Icon: Plus sign
- Triggers popover menu for: Expense, Income, Recurring

```tsx
<nav className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t">
  <div className="max-w-md mx-auto flex items-center justify-around p-2">
    <NavButton icon={Home} label="Home" active={pathname === "/"} />
    <NavButton icon={AreaChart} label="Projections" />
    
    {/* FAB */}
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          size="icon" 
          className="h-14 w-14 rounded-full shadow-lg -mt-6"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>{/* Menu */}</PopoverContent>
    </Popover>
    
    <NavButton icon={List} label="Transactions" />
    <NavButton icon={Settings} label="Settings" />
  </div>
</nav>
```

### Header

- Fixed position: `fixed top-0 left-0 right-0 z-40`
- Background: `bg-background/80 backdrop-blur-sm`
- Border: bottom border
- Height: ~72px with `p-4`
- Logo on left, centered title, back arrow when in sub-pages

```tsx
<header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-sm border-b">
  <div className="max-w-md mx-auto flex items-center justify-between p-4">
    {showBack ? (
      <Button variant="ghost" size="icon" onClick={goBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
    ) : (
      <img src={logo} alt="PerFi" className="h-10" />
    )}
    
    {title && <h1 className="font-semibold">{title}</h1>}
    
    <div className="w-10" /> {/* Spacer for centering */}
  </div>
</header>
```

---

## Data Visualization

### Charts (Recharts/Chart.js)

**Donut Chart:**
- Inner radius: 60
- Stroke width: 5
- Center label: Total amount with "Total" subtitle
- Uses category colors palette

**Bar + Line Chart (Combined):**
- Stacked bars for expense categories
- Line overlay for income
- Grid: Dashed, vertical lines hidden
- Top label on bars showing totals
- Income line: Green (#10B981), 3px stroke, dots

**Chart Typography:**
- Labels: 12px, `fill-foreground`
- Income labels: `fill-green-600`

### Chart Container

```tsx
<Card className="p-4">
  <CardHeader className="pb-2">
    <CardTitle className="text-lg">Monthly Overview</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        {/* Chart component */}
      </ResponsiveContainer>
    </div>
  </CardContent>
</Card>
```

---

## Animation & Motion

### Duration Scale

| Token | Duration | Usage |
|-------|----------|-------|
| `duration-75` | 75ms | Micro-interactions (opacity) |
| `duration-150` | 150ms | Quick transitions (hover) |
| `duration-200` | 200ms | Standard transitions |
| `duration-300` | 300ms | Emphasis transitions |
| `duration-500` | 500ms | Page transitions, modals |

### Easing Functions

| Token | Value | Usage |
|-------|-------|-------|
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entrances (elements appearing) |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exits (elements leaving) |
| `ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Morphing, position changes |

### CSS Keyframes

```css
@keyframes accordion-down {
  from { height: 0; }
  to { height: var(--radix-accordion-content-height); }
}

@keyframes accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to { height: 0; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes slide-in-from-bottom {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@keyframes slide-out-to-bottom {
  from { transform: translateY(0); }
  to { transform: translateY(100%); }
}

@keyframes scale-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Staggered Animations

For list items and grid reveals:

```tsx
// Using inline styles for stagger delay
{items.map((item, index) => (
  <div
    key={item.id}
    className="animate-fade-in"
    style={{ animationDelay: `${index * 50}ms` }}
  >
    {/* Content */}
  </div>
))}
```

```css
/* CSS for stagger using custom property */
.stagger-item {
  animation: fade-in 300ms ease-out forwards;
  animation-delay: calc(var(--index) * 50ms);
  opacity: 0;
}
```

### Transition Defaults

| Property | Duration | Easing |
|----------|----------|--------|
| Colors | 150ms | ease |
| Opacity | 150ms | ease |
| Shadow | 200ms | ease |
| Transform | 200ms | ease-out |
| Accordion | 200ms | ease-out |
| Modal | 300ms | ease-out |
| Drawer | 300ms | ease-out |

### Interactive States

- Hover shadows: `hover:shadow-lg transition-shadow`
- Button hover: `hover:bg-primary/90 transition-colors`
- Link hover: `hover:underline`
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Active press: `active:scale-95 transition-transform`

### Reduced Motion Support

Always respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Icons

**Icon Library:** Lucide React

**Common Icons Used:**

| Icon | Component | Usage |
|------|-----------|-------|
| Home | `<Home />` | Home navigation |
| Settings | `<Settings />` | Settings navigation |
| Plus | `<Plus />` | Add action FAB |
| List | `<List />` | Transactions navigation |
| AreaChart | `<AreaChart />` | Projections navigation |
| ArrowLeft | `<ArrowLeft />` | Back navigation |
| TrendingDown | `<TrendingDown />` | Expense indicator |
| TrendingUp | `<TrendingUp />` | Income indicator |
| Repeat | `<Repeat />` | Recurring transactions |
| Calendar | `<CalendarIcon />` | Date picker |
| ChevronDown | `<ChevronDown />` | Accordion trigger |
| ChevronRight | `<ChevronRight />` | Navigation arrow |
| Sun / Moon | `<Sun />` / `<Moon />` | Theme toggle |
| Loader2 | `<Loader2 />` | Loading spinner |
| AlertCircle | `<AlertCircle />` | Error/warning indicator |
| CheckCircle | `<CheckCircle />` | Success indicator |
| XCircle | `<XCircle />` | Error indicator |
| X | `<X />` | Close button |
| Search | `<Search />` | Search input |
| Filter | `<Filter />` | Filter controls |
| MoreVertical | `<MoreVertical />` | Overflow menu |

**Icon Sizing:**

| Context | Size | Class |
|---------|------|-------|
| Navigation tabs | 24px | `h-6 w-6` |
| Menu items | 18px | `h-[18px] w-[18px]` |
| UI indicators | 20px | `h-5 w-5` |
| Inline with text | 16px | `h-4 w-4` |
| Buttons (sm) | 16px | `h-4 w-4` |
| Buttons (default) | 18px | `h-[18px] w-[18px]` |
| FAB | 24px | `h-6 w-6` |

---

## Theme System

### Implementation

Theme is managed via React Context (`ThemeContext.tsx`):

```tsx
type Theme = "light" | "dark";

// Persisted in localStorage
// Respects system preference on first load
// Toggles dark class on document.documentElement
```

### Dark Mode Strategy

- Class-based: `darkMode: ['class', 'class']` in Tailwind config
- Automatic detection of system preference
- User preference persisted in localStorage

### Theme Toggle Component

```tsx
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme}>
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
};
```

---

## Compound Components

### Transaction Row

```tsx
interface TransactionRowProps {
  description: string;
  category: string;
  amount: number;
  date: string;
  type: 'income' | 'expense';
  onClick?: () => void;
}

const TransactionRow = ({
  description,
  category,
  amount,
  date,
  type,
  onClick,
}: TransactionRowProps) => (
  <div
    className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors cursor-pointer"
    onClick={onClick}
  >
    <div className={cn(
      "h-10 w-10 rounded-full flex items-center justify-center",
      type === 'income' ? "bg-green-100" : "bg-red-100"
    )}>
      {type === 'income' ? (
        <TrendingUp className="h-5 w-5 text-green-600" />
      ) : (
        <TrendingDown className="h-5 w-5 text-red-600" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium truncate">{description}</p>
      <p className="text-sm text-muted-foreground">{category}</p>
    </div>
    <div className="text-right">
      <p className={cn(
        "font-semibold",
        type === 'income' ? "text-green-600" : "text-red-600"
      )}>
        {type === 'income' ? '+' : '-'}${Math.abs(amount).toFixed(2)}
      </p>
      <p className="text-xs text-muted-foreground">{date}</p>
    </div>
  </div>
);
```

### Category Badge

```tsx
interface CategoryBadgeProps {
  name: string;
  color?: string;
  size?: 'sm' | 'md';
}

const CategoryBadge = ({ name, color, size = 'md' }: CategoryBadgeProps) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full font-medium",
      size === 'sm' ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
      "bg-muted text-muted-foreground"
    )}
    style={color ? { backgroundColor: `${color}20`, color } : undefined}
  >
    {name}
  </span>
);
```

### Amount Display

```tsx
interface AmountDisplayProps {
  value: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSign?: boolean;
  currency?: string;
}

const AmountDisplay = ({
  value,
  size = 'md',
  showSign = true,
  currency = '$',
}: AmountDisplayProps) => {
  const isPositive = value >= 0;
  
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl font-semibold',
    xl: 'text-3xl font-bold',
  };
  
  return (
    <span
      className={cn(
        sizeClasses[size],
        isPositive ? 'text-green-600' : 'text-red-600'
      )}
    >
      {showSign && (isPositive ? '+' : '-')}
      {currency}{Math.abs(value).toFixed(2)}
    </span>
  );
};
```

---

## Component Library

### shadcn/ui Configuration

```json
{
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "iconLibrary": "lucide"
}
```

### Available Components

Core UI primitives from shadcn/ui (New York style):

- **Layout:** Card, Accordion, Separator, Sheet, Drawer
- **Forms:** Button, Input, Label, Select, Checkbox, Switch, Textarea, Calendar, DateRangePicker
- **Feedback:** Toast, Toaster, Dialog, Popover, Badge, Skeleton
- **Navigation:** Tabs
- **Data Display:** Chart (wrapper for Recharts)

---

## Responsive Design

### Breakpoints (Tailwind defaults)

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |
| `2xl` | 1536px | Extra large |

### Mobile-First Patterns

- Bottom navigation (tab bar) for mobile
- Drawer-based forms for transaction entry
- Touch targets: minimum 44x44px (icon buttons are 36px but have touch area padding)
- Content max-width on larger screens: `max-w-md`, `max-w-lg`, `max-w-2xl`

### Responsive Component Examples

```tsx
// Responsive padding
<div className="p-4 md:p-6 lg:p-8" />

// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" />

// Hide on mobile, show on desktop
<div className="hidden md:block" />

// Show on mobile, hide on desktop
<div className="md:hidden" />

// Responsive text
<h1 className="text-xl md:text-2xl lg:text-3xl font-bold" />
```

---

## Accessibility

### Focus States

- Visible focus rings on interactive elements
- `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`

### Color Contrast

- Primary text on background: High contrast (meets WCAG AA)
- Muted text: Medium contrast for secondary information
- Destructive actions use distinct red coloring

### Keyboard Navigation

- Accordion components support keyboard navigation
- Drawer components handle focus management
- All interactive elements are focusable

### Screen Reader Support

```tsx
// Always include sr-only labels for icon buttons
<Button variant="ghost" size="icon">
  <Settings className="h-5 w-5" />
  <span className="sr-only">Open settings</span>
</Button>

// Use aria-label for inputs without visible labels
<Input aria-label="Search transactions" placeholder="Search..." />

// Mark decorative icons
<TrendingUp className="h-5 w-5" aria-hidden="true" />

// Live regions for dynamic content
<div aria-live="polite" aria-atomic="true">
  {message}
</div>
```

### Touch Accessibility

- Minimum touch target: 44x44px
- Adequate spacing between touch targets (at least 8px)
- Visual feedback on touch (active states)

---

## File Structure

```
src/
├── index.css          # Global styles, CSS variables, Tailwind layers
├── lib/
│   └── utils.ts       # cn() utility for class merging
├── context/
│   └── ThemeContext.tsx  # Theme provider and hook
├── components/
│   ├── ui/            # shadcn/ui components
│   └── features/      # Domain-specific compound components
│       ├── TransactionRow.tsx
│       ├── CategoryBadge.tsx
│       └── AmountDisplay.tsx
├── img/               # Brand assets (logos)
└── pages/             # Page components

tailwind.config.js     # Tailwind configuration with design tokens
components.json        # shadcn/ui configuration
```

---

## Usage Guidelines

### Do's

- ✅ Use CSS variables for all colors
- ✅ Use semantic color tokens (primary, destructive, muted)
- ✅ Apply `cn()` utility for conditional classes
- ✅ Use established component patterns from shadcn/ui
- ✅ Follow mobile-first responsive design
- ✅ Support both light and dark themes
- ✅ Use Poppins font consistently
- ✅ Maintain consistent spacing (4px grid)
- ✅ Include loading and error states for all async operations
- ✅ Use the shadow scale for consistent elevation
- ✅ Respect reduced motion preferences
- ✅ Add sr-only labels to icon-only buttons

### Don'ts

- ❌ Don't use hardcoded hex colors (use Tailwind utilities)
- ❌ Don't create magic numbers for spacing
- ❌ Don't skip dark mode support in new components
- ❌ Don't use arbitrary font sizes outside the scale
- ❌ Don't ignore focus states on interactive elements
- ❌ Don't create new component patterns without justification
- ❌ Don't use z-index values outside the defined scale
- ❌ Don't skip skeleton/loading states for data fetching
- ❌ Don't forget to handle empty states
- ❌ Don't use inline styles for colors or spacing
