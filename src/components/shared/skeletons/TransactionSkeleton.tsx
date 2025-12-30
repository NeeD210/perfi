export function TransactionSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/4 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-5 w-16 rounded bg-muted animate-pulse" />
    </div>
  );
}

