export default function StudentAssignmentsLoading() {
  return (
    <div className="max-w-full mx-auto w-full h-full flex flex-col animate-pulse">
      <div className="flex flex-col h-full">
        {/* Header */}
        <header className="mb-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="h-9 w-40 rounded-lg bg-brand-primary/10" />
            <div className="h-8 w-48 rounded-full bg-brand-primary/5" />
          </div>
        </header>

        {/* Content: assignment list */}
        <div className="flex-1 min-h-0 rounded-xl border border-brand-primary/8 bg-white overflow-hidden">
          {/* Section header */}
          <div className="px-4 py-2 bg-brand-primary/[0.02] border-b border-brand-primary/5">
            <div className="h-3 w-24 rounded bg-brand-primary/8" />
          </div>

          {/* Assignment rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="px-4 py-3.5 border-b border-brand-primary/5 space-y-2"
              style={{ opacity: 1 - i * 0.1 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-brand-primary/8" />
                  <div className="h-4 w-44 rounded bg-brand-primary/8" />
                </div>
                <div className="h-5 w-16 rounded-full bg-brand-primary/6" />
              </div>
              <div className="flex items-center gap-3 pl-6">
                <div className="h-3 w-20 rounded bg-brand-primary/5" />
                <div className="h-3 w-24 rounded bg-brand-primary/5" />
              </div>
            </div>
          ))}

          {/* Completed section header */}
          <div className="px-4 py-2 bg-brand-primary/[0.02] border-b border-brand-primary/5">
            <div className="h-3 w-28 rounded bg-brand-primary/6" />
          </div>

          {/* Completed rows */}
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={`c-${i}`}
              className="px-4 py-3.5 border-b border-brand-primary/5 space-y-2"
              style={{ opacity: 0.5 - i * 0.1 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-brand-primary/6" />
                  <div className="h-4 w-36 rounded bg-brand-primary/6" />
                </div>
                <div className="h-5 w-20 rounded-full bg-brand-primary/5" />
              </div>
              <div className="flex items-center gap-3 pl-6">
                <div className="h-3 w-20 rounded bg-brand-primary/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
