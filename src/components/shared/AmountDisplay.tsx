import { cn } from "@/lib/utils";

interface AmountDisplayProps {
  value: number;
  size?: "sm" | "md" | "lg" | "xl";
  showSign?: boolean;
  currency?: string;
  className?: string;
}

export function AmountDisplay({
  value,
  size = "md",
  showSign = true,
  currency = "$",
  className,
}: AmountDisplayProps) {
  const isPositive = value >= 0;

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl font-semibold",
    xl: "text-3xl font-bold",
  };

  // Format number with thousands separator
  const formatNumber = (num: number) => {
    return Math.abs(num).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  return (
    <span
      className={cn(
        sizeClasses[size],
        isPositive ? "text-green-600" : "text-red-600",
        className
      )}
    >
      {showSign && (isPositive ? "+" : "-")}
      {currency}
      {formatNumber(value)}
    </span>
  );
}

