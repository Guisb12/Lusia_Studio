export default function DashboardLoading() {
  return (
    <div className="w-full h-full p-0 animate-pulse">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-8 w-48 bg-brand-primary/10 rounded-lg mb-2" />
        <div className="h-4 w-72 bg-brand-primary/5 rounded-md" />
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-xl bg-brand-primary/5 border border-brand-primary/5"
          />
        ))}
      </div>
    </div>
  );
}
