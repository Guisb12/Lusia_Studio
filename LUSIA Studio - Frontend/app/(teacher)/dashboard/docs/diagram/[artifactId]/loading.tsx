export default function DiagramLoading() {
    return (
        <div className="flex flex-col h-full">
            {/* Header skeleton */}
            <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
                <div className="h-8 w-8 bg-brand-primary/[0.04] rounded-lg animate-pulse" />
                <div className="h-5 w-5 bg-brand-primary/[0.06] rounded animate-pulse" />
                <div className="h-5 w-52 bg-brand-primary/[0.06] rounded-lg animate-pulse" />
            </div>

            {/* Canvas skeleton — dot grid + ghost nodes */}
            <div
                className="flex-1 min-h-0 relative overflow-hidden"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                }}
            >
                {/* Central root node */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-20">
                    {/* Left branch */}
                    <div className="flex flex-col gap-4 items-end">
                        <div className="h-16 w-36 bg-brand-primary/[0.04] rounded-xl animate-pulse" />
                        <div className="h-14 w-32 bg-brand-primary/[0.03] rounded-xl animate-pulse" />
                    </div>

                    {/* Root */}
                    <div className="h-20 w-44 bg-brand-primary/[0.06] rounded-2xl animate-pulse shrink-0" />

                    {/* Right branch */}
                    <div className="flex flex-col gap-4 items-start">
                        <div className="h-16 w-36 bg-brand-primary/[0.04] rounded-xl animate-pulse" />
                        <div className="h-14 w-32 bg-brand-primary/[0.03] rounded-xl animate-pulse" />
                        <div className="h-14 w-28 bg-brand-primary/[0.03] rounded-xl animate-pulse" />
                    </div>
                </div>

                {/* Bottom controls skeleton */}
                <div className="absolute bottom-4 left-4 flex gap-0.5 bg-white/60 rounded-xl px-1.5 py-1.5">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-7 w-7 bg-brand-primary/[0.04] rounded-lg animate-pulse" />
                    ))}
                </div>
                <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/60 rounded-xl px-2.5 py-2">
                    <div className="h-3 w-3 bg-brand-primary/[0.04] rounded animate-pulse" />
                    <div className="h-1 w-24 bg-brand-primary/[0.06] rounded-full animate-pulse" />
                    <div className="h-3 w-3 bg-brand-primary/[0.04] rounded animate-pulse" />
                    <div className="h-3 w-8 bg-brand-primary/[0.04] rounded animate-pulse" />
                </div>
            </div>
        </div>
    );
}
