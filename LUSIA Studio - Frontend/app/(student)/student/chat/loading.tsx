export default function StudentChatLoading() {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message area skeleton */}
      <div className="flex-1 overflow-hidden">
        <div className="px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
            <div className="flex justify-end">
              <div className="rounded-2xl rounded-tr-md bg-brand-primary/[0.06] px-4 py-2.5 max-w-[70%] space-y-1.5">
                <div className="h-3.5 w-48 bg-brand-primary/10 rounded" />
                <div className="h-3.5 w-32 bg-brand-primary/10 rounded" />
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <div className="h-8 w-8 rounded-full bg-brand-primary/[0.06] shrink-0" />
              <div className="space-y-1.5 flex-1 max-w-[80%]">
                <div className="h-3.5 w-64 bg-brand-primary/[0.06] rounded" />
                <div className="h-3.5 w-56 bg-brand-primary/[0.06] rounded" />
                <div className="h-3.5 w-40 bg-brand-primary/[0.06] rounded" />
              </div>
            </div>
            <div className="flex justify-end">
              <div className="rounded-2xl rounded-tr-md bg-brand-primary/[0.06] px-4 py-2.5 max-w-[70%]">
                <div className="h-3.5 w-36 bg-brand-primary/10 rounded" />
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <div className="h-8 w-8 rounded-full bg-brand-primary/[0.06] shrink-0" />
              <div className="space-y-1.5 flex-1 max-w-[80%]">
                <div className="h-3.5 w-72 bg-brand-primary/[0.06] rounded" />
                <div className="h-3.5 w-48 bg-brand-primary/[0.06] rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Input bar skeleton */}
      <div className="px-4 pb-4 animate-pulse">
        <div className="max-w-3xl mx-auto h-14 rounded-2xl border border-brand-primary/5 bg-brand-primary/[0.03]" />
      </div>
    </div>
  );
}
