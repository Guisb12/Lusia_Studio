export default function StudentProfileLoading() {
  return (
    <div className="w-full animate-pulse">
      {/* Header */}
      <header className="shrink-0 mb-5">
        <div className="h-9 w-40 rounded-lg bg-brand-primary/10 mb-1.5" />
        <div className="h-4 w-64 rounded-md bg-brand-primary/5" />
      </header>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left sidebar: avatar card */}
        <div className="w-full lg:w-64 lg:shrink-0 space-y-3">
          <div className="rounded-2xl border border-brand-primary/5 bg-white p-5 flex flex-col items-center">
            <div className="h-20 w-20 rounded-full bg-brand-primary/8 mb-4" />
            <div className="h-5 w-32 rounded bg-brand-primary/8 mb-2" />
            <div className="h-3 w-40 rounded bg-brand-primary/5 mb-3" />
            <div className="h-5 w-16 rounded-full bg-brand-primary/6 mb-2" />
            <div className="flex gap-1.5 mt-1">
              <div className="h-5 w-14 rounded-full bg-brand-accent/8" />
              <div className="h-5 w-20 rounded-full bg-brand-primary/5" />
            </div>
          </div>

          {/* Grades summary card */}
          <div className="rounded-2xl border border-brand-primary/5 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-2.5 w-12 rounded bg-brand-primary/6" />
              <div className="h-3 w-3 rounded bg-brand-primary/5" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-brand-primary/5" />
              <div>
                <div className="h-2 w-10 rounded bg-brand-primary/5 mb-1" />
                <div className="h-5 w-8 rounded bg-brand-primary/8" />
              </div>
            </div>
          </div>

          <div className="h-11 rounded-lg bg-brand-primary/5" />
        </div>

        {/* Right: sections */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Academic info section */}
          <div className="rounded-2xl border border-brand-primary/5 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-primary/5">
              <div className="h-4 w-28 rounded bg-brand-primary/8" />
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-brand-primary/5 last:border-b-0">
                <div className="h-4 w-4 rounded bg-brand-primary/8 shrink-0" />
                <div className="h-3 w-24 rounded bg-brand-primary/5 shrink-0" />
                <div className="h-3.5 w-32 rounded bg-brand-primary/8 ml-auto" />
              </div>
            ))}
          </div>

          {/* Contact section */}
          <div className="rounded-2xl border border-brand-primary/5 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-primary/5">
              <div className="h-4 w-20 rounded bg-brand-primary/8" />
            </div>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-brand-primary/5 last:border-b-0">
                <div className="h-4 w-4 rounded bg-brand-primary/8 shrink-0" />
                <div className="h-3 w-20 rounded bg-brand-primary/5 shrink-0" />
                <div className="h-3.5 w-40 rounded bg-brand-primary/8 ml-auto" />
              </div>
            ))}
          </div>

          {/* Subjects section */}
          <div className="rounded-2xl border border-brand-primary/5 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-primary/5">
              <div className="h-4 w-24 rounded bg-brand-primary/8" />
            </div>
            <div className="p-4 flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-7 w-20 rounded-full bg-brand-primary/6" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
