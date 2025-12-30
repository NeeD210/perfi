import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Loader2, Wallet } from "lucide-react";
import { BalanceCard, MonthlySummary, TopCategories, UpcomingPayments } from "@/components/home";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/shared";

export default function HomePage() {
  const dashboardData = useQuery(api.ledger.home.getHomeDashboard);

  // Loading state
  if (dashboardData === undefined) {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
        <CardSkeleton />
        <CardSkeleton />
        <div className="grid grid-cols-1 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  // Check if we have any data to show
  const hasNoData =
    dashboardData.netBalance.current === 0 &&
    dashboardData.monthSummary.totalIncome === 0 &&
    dashboardData.monthSummary.totalExpenses === 0 &&
    dashboardData.topCategories.length === 0;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
      {/* Net Balance */}
      <div
        className="animate-fade-in"
        style={{ animationDelay: "0ms" }}
      >
        <BalanceCard
          current={dashboardData.monthSummary.netChange}
          trend={dashboardData.netBalance.trend}
          changePercent={dashboardData.netBalance.changePercent}
        />
      </div>

      {/* Monthly Summary */}
      <div
        className="animate-fade-in"
        style={{ animationDelay: "50ms" }}
      >
        <MonthlySummary
          month={dashboardData.monthSummary.month}
          totalIncome={dashboardData.monthSummary.totalIncome}
          totalExpenses={dashboardData.monthSummary.totalExpenses}
          netChange={dashboardData.monthSummary.netChange}
        />
      </div>

      {/* Top Categories & Upcoming Payments Grid */}
      <div className="grid grid-cols-1 gap-4">
        <div
          className="animate-fade-in"
          style={{ animationDelay: "100ms" }}
        >
          <TopCategories
            categories={dashboardData.topCategories}
            totalExpenses={dashboardData.monthSummary.totalExpenses}
          />
        </div>

        <div
          className="animate-fade-in"
          style={{ animationDelay: "150ms" }}
        >
          <UpcomingPayments obligations={dashboardData.upcomingObligations} />
        </div>
      </div>

      {/* Empty state message when no transactions yet */}
      {hasNoData && (
        <div
          className="animate-fade-in mt-4"
          style={{ animationDelay: "200ms" }}
        >
          <EmptyState
            icon={Wallet}
            title="No transactions yet"
            description="Start tracking your finances by adding your first transaction."
            action={{
              label: "Add Transaction",
              onClick: () => {
                // This will be connected to the FAB in the navigation
                // For now, just a placeholder
                console.log("Add transaction clicked");
              },
            }}
          />
        </div>
      )}
    </div>
  );
}
