export default function SkeletonScreen() {
  return (
    <div className="app-container p-4">
      <div className="mb-4 h-12 animate-pulse rounded-2xl bg-white/80 dark:bg-slate-800" />
      <div className="grid gap-3">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="h-24 animate-pulse rounded-2xl bg-white/80 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}

