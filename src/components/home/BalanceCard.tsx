import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface BalanceCardProps {
  current: number;
  trend: "up" | "down" | "stable";
  changePercent: number;
}

export function BalanceCard({ current, trend, changePercent }: BalanceCardProps) {
  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    return `$${absValue.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <Card className="rounded-xl shadow overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground font-medium">Net Balance</p>
          <p
            className={cn(
              "text-3xl font-bold",
              current >= 0 ? "text-foreground" : "text-red-600"
            )}
          >
            {current < 0 && "-"}
            {formatCurrency(current)}
          </p>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1 text-sm font-medium",
                trend === "up" && "text-green-600",
                trend === "down" && "text-red-600",
                trend === "stable" && "text-muted-foreground"
              )}
            >
              <TrendIcon className="h-4 w-4" />
              <span>
                {changePercent > 0 && "+"}
                {changePercent.toFixed(1)}%
              </span>
            </div>
            <span className="text-xs text-muted-foreground">vs last month</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

