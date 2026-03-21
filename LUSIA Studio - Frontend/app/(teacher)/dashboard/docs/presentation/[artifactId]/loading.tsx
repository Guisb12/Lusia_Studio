export default function PresentationLoading() {
    return (
        <div className="h-full flex flex-col">
            {/* Header skeleton */}
            <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-brand-primary/5 flex items-center gap-3">
                <div className="h-8 w-8 bg-brand-primary/[0.04] rounded-lg animate-pulse" />
                <div className="flex-1">
                    <div className="h-5 w-48 bg-brand-primary/[0.06] rounded-lg animate-pulse" />
                </div>
                <div className="h-4 w-16 bg-brand-primary/[0.04] rounded animate-pulse" />
            </div>

            {/* Canvas skeleton */}
            <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-3">
                <div className="w-full max-w-5xl">
                    <div className="aspect-video bg-brand-primary/[0.03] rounded-2xl animate-pulse" />
                </div>
            </div>

            {/* Nav bar skeleton */}
            <div className="shrink-0 border-t border-brand-primary/5 px-4 py-2.5">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <div className="h-8 w-20 bg-brand-primary/[0.04] rounded-xl animate-pulse" />
                    <div className="flex gap-1">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-1.5 w-1.5 bg-brand-primary/[0.06] rounded-full animate-pulse" />
                        ))}
                    </div>
                    <div className="h-8 w-20 bg-brand-primary/[0.04] rounded-xl animate-pulse" />
                </div>
            </div>
        </div>
    );
}
