import { Card } from "@/components/ui/card";

export function CardSkeleton() {
  return (
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
}

