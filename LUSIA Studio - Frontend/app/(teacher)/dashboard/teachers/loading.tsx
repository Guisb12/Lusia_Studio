export default function TeachersLoading() {
  return (
    <div className="max-w-full mx-auto w-full h-full flex gap-0 animate-pulse">
      <div className="min-w-0 w-full flex flex-col h-full">
        {/* Header */}
        <header className="mb-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-9 w-40 rounded-lg bg-brand-primary/10 mb-2" />
              <div className="h-4 w-72 rounded-md bg-brand-primary/5" />
            </div>
          </div>
        </header>

        {/* Search toolbar */}
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <div className="h-8 w-52 rounded-lg bg-brand-primary/8" />
          <div className="h-8 w-20 rounded-lg bg-brand-primary/5" />
          <div className="h-3 w-20 rounded bg-brand-primary/5 ml-auto" />
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 rounded-xl border border-brand-primary/8 bg-white overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 border-b border-brand-primary/5"
              style={{ opacity: 1 - i * 0.08 }}
            >
              <div className="h-9 w-9 rounded-full bg-brand-primary/8 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-3.5 w-32 rounded bg-brand-primary/8 mb-1.5" />
                <div className="h-2.5 w-48 rounded bg-brand-primary/5" />
              </div>
              <div className="h-5 w-16 rounded-full bg-brand-primary/6 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
