import { cn } from '../utils/format';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800', className)} aria-hidden />;
}

export function VideoPreviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading video info">
      <div className="flex flex-col gap-5 sm:flex-row">
        <Skeleton className="aspect-video w-full sm:w-72" />
        <div className="flex-1 space-y-3 py-1">
          <Skeleton className="h-6 w-11/12" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}

export function PlaylistSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading playlist">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-4 w-1/4" />
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="aspect-video w-28" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
