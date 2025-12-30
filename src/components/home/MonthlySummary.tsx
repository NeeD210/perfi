import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";

interface MonthlySummaryProps {
  month: number;
  totalIncome: number;
  totalExpenses: number;
  netChange: number;
}

export function MonthlySummary({
  month,
  totalIncome,
  totalExpenses,
  netChange,
}: MonthlySummaryProps) {
  const formatCurrency = (value: number) => {
    return `$${Math.abs(value).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const monthName = format(new Date(month), "MMMM yyyy");

  // Ensure values are numbers and use absolute values for bar scaling
  const income = Number(totalIncome) || 0;
  const expenses = Number(totalExpenses) || 0;
  const incomeAbs = Math.abs(income);
  const expensesAbs = Math.abs(expenses);
  const maxValue = Math.max(incomeAbs, expensesAbs);
  
  // Calculate bar widths as percentages using absolute values
  const incomeBarWidth = maxValue > 0 ? Math.round((incomeAbs / maxValue) * 100 * 100) / 100 : 0;
  const expenseBarWidth = maxValue > 0 ? Math.round((expensesAbs / maxValue) * 100 * 100) / 100 : 0;

  return (
    <Card className="rounded-xl shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{monthName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Income Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">Income</span>
            </div>
            <span className="text-lg font-semibold text-green-600">
              {formatCurrency(income)}
            </span>
          </div>
          <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${incomeBarWidth}%` }}
            />
          </div>
        </div>

        {/* Expenses Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">Expenses</span>
            </div>
            <span className="text-lg font-semibold text-red-600">
              {formatCurrency(expenses)}
            </span>
          </div>
          <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${expenseBarWidth}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
