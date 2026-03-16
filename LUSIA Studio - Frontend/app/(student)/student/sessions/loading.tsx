export default function StudentSessionsLoading() {
  return (
    <div className="max-w-4xl w-full animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-9 w-56 rounded-lg bg-brand-primary/10" />
        <div className="h-4 w-72 rounded-md bg-brand-primary/5" />
      </div>
      <div className="h-10 w-44 rounded-lg bg-brand-primary/5" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-2xl border border-brand-primary/5 bg-white"
          />
        ))}
      </div>
    </div>
  );
}
