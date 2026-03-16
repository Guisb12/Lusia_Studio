export default function CalendarLoading() {
  return (
    <div className="max-w-full mx-auto w-full h-full flex flex-col animate-pulse">
      <header className="mb-4">
        <div className="h-8 w-40 rounded-lg bg-brand-primary/10" />
        <div className="mt-2 h-4 w-72 rounded-md bg-brand-primary/5" />
      </header>

      <div className="flex-1 min-h-0 overflow-hidden rounded-2xl border border-brand-primary/15 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-brand-primary/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-primary/10" />
            <div className="h-8 w-16 rounded-lg bg-brand-primary/10" />
            <div className="h-8 w-8 rounded-lg bg-brand-primary/10" />
            <div className="ml-2 h-6 w-48 rounded-md bg-brand-primary/10" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-32 rounded-full bg-brand-primary/10" />
            <div className="h-8 w-28 rounded-lg bg-brand-primary/10" />
          </div>
        </div>

        <div className="flex h-full min-h-0">
          <div className="w-14 shrink-0 border-r border-brand-primary/8 bg-brand-primary/[0.02]">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="h-20 border-b border-brand-primary/8 px-3 py-3">
                <div className="h-3 w-6 rounded bg-brand-primary/10" />
              </div>
            ))}
          </div>

          <div className="grid flex-1 grid-cols-7">
            {Array.from({ length: 7 }).map((_, dayIndex) => (
              <div key={dayIndex} className="border-r border-brand-primary/8 last:border-r-0">
                <div className="border-b border-brand-primary/8 px-3 py-3">
                  <div className="h-3 w-14 rounded bg-brand-primary/10" />
                </div>
                {Array.from({ length: 12 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="h-20 border-b border-brand-primary/8 px-2 py-2">
                    {rowIndex === (dayIndex % 5) + 1 && (
                      <div className="h-10 rounded-xl bg-brand-accent/10" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
