export default function CFSLoading() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto animate-pulse">
      <div className="mb-4 h-4 w-32 rounded bg-brand-primary/8" />

      <div className="mb-6">
        <div className="h-10 w-72 rounded bg-brand-primary/10" />
        <div className="mt-2 h-4 w-56 rounded bg-brand-primary/6" />
      </div>

      <div className="mb-6 rounded-2xl border border-brand-primary/5 bg-brand-primary/[0.03] p-6">
        <div className="flex items-center gap-6">
          <div>
            <div className="mb-2 h-3 w-24 rounded bg-brand-primary/6" />
            <div className="h-10 w-24 rounded bg-brand-primary/10" />
          </div>
          <div className="h-12 w-px bg-brand-primary/10" />
          <div>
            <div className="mb-2 h-3 w-36 rounded bg-brand-primary/6" />
            <div className="h-10 w-24 rounded bg-brand-primary/10" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-primary/5">
        <div className="h-12 border-b border-brand-primary/5 bg-brand-primary/[0.02]" />
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-14 border-b border-brand-primary/5 bg-white"
            style={{ opacity: 1 - index * 0.08 }}
          />
        ))}
      </div>
    </div>
  );
}
