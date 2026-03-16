export default function AssignmentsLoading() {
  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-full gap-0 overflow-hidden animate-pulse">
      <div className="flex min-w-0 flex-1 flex-col h-full">
        {/* Header */}
        <header className="mb-5 shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-9 w-24 rounded-lg bg-brand-primary/10" />
            <div className="h-8 w-36 rounded-full bg-brand-primary/5" />
          </div>
        </header>

        {/* Kanban columns */}
        <div className="flex h-full min-h-0 min-w-0 w-full gap-4">
          {(
            [
              { title: "w-20", accent: "#10b981", cards: 3 },
              { title: "w-28", accent: "#f59e0b", cards: 2 },
              { title: "w-24", accent: "#6b7280", cards: 1 },
            ] as const
          ).map((col, colIdx) => (
            <div key={colIdx} className="flex-1 min-w-0 flex flex-col h-full">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: col.accent, opacity: 0.4 }}
                />
                <div className={`h-3.5 ${col.title} rounded bg-brand-primary/8`} />
                <div className="h-5 w-5 rounded-md bg-brand-primary/5 ml-auto" />
              </div>

              {/* Cards */}
              <div className="flex-1 min-h-0 rounded-xl border border-brand-primary/8 bg-brand-primary/[0.015] p-2 space-y-2">
                {Array.from({ length: col.cards }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-brand-primary/5 bg-white p-3 space-y-2"
                    style={{ opacity: 1 - i * 0.15 }}
                  >
                    <div className="h-4 w-3/4 rounded bg-brand-primary/8" />
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-16 rounded-full bg-brand-primary/5" />
                      <div className="h-3 w-12 rounded bg-brand-primary/5" />
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <div className="h-5 w-5 rounded-full bg-brand-primary/8" />
                      <div className="h-5 w-5 rounded-full bg-brand-primary/6" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
