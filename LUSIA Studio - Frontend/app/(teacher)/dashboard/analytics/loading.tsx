export default function AnalyticsLoading() {
  return (
    <div className="w-full animate-pulse">
      <div className="mb-6">
        <div className="h-8 w-48 rounded-lg bg-brand-primary/10 mb-2" />
        <div className="h-4 w-72 rounded-md bg-brand-primary/5" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-xl border border-brand-primary/5 bg-brand-primary/5"
          />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-brand-primary/5 bg-brand-primary/5" />
    </div>
  );
}
