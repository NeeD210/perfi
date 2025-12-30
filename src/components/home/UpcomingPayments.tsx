import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Repeat, CreditCard, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Obligation {
  id: string;
  type: "installment" | "recurring" | "card_statement";
  date: number;
  description: string;
  amount: number;
  accountName?: string;
}

interface UpcomingPaymentsProps {
  obligations: Obligation[];
}

export function UpcomingPayments({ obligations }: UpcomingPaymentsProps) {
  const formatCurrency = (value: number) => {
    return `$${Math.abs(value).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "recurring":
        return Repeat;
      case "card_statement":
        return CreditCard;
      case "installment":
      default:
        return Receipt;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case "recurring":
        return "text-blue-500 bg-blue-100 dark:bg-blue-900/30";
      case "card_statement":
        return "text-purple-500 bg-purple-100 dark:bg-purple-900/30";
      case "installment":
      default:
        return "text-orange-500 bg-orange-100 dark:bg-orange-900/30";
    }
  };

  if (obligations.length === 0) {
    return (
      <Card className="rounded-xl shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-muted-foreground text-sm">No upcoming payments</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Upcoming
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {obligations.map((obligation) => {
          const Icon = getIcon(obligation.type);
          const iconColorClass = getIconColor(obligation.type);

          return (
            <div
              key={obligation.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div
                className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0",
                  iconColorClass
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{obligation.description}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(obligation.date), "MMM d, yyyy")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-red-600">
                  -{formatCurrency(obligation.amount)}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

