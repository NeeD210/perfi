import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Category {
  accountId: string;
  name: string;
  amount: number;
  percentOfTotal: number;
  color?: string;
}

interface TopCategoriesProps {
  categories: Category[];
  totalExpenses: number;
}

const DEFAULT_COLORS = ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"];

export function TopCategories({ categories, totalExpenses }: TopCategoriesProps) {
  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  if (categories.length === 0) {
    return (
      <Card className="rounded-xl shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Top Spending</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <p className="text-muted-foreground text-sm">No expenses this month</p>
        </CardContent>
      </Card>
    );
  }

  // Find max amount for scaling bars
  const maxAmount = Math.max(...categories.map((c) => c.amount));

  return (
    <Card className="rounded-xl shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Top Spending</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.slice(0, 5).map((cat, index) => {
          const barWidth = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
          const color = cat.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

          return (
            <div key={cat.accountId} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate max-w-[140px]">
                  {cat.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {formatCurrency(cat.amount)}
                  </span>
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {cat.percentOfTotal.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
