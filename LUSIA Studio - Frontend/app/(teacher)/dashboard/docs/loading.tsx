export default function DocsLoading() {
    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-pulse">
            {/* Header */}
            <div className="mb-0">
                <div className="h-9 w-36 bg-brand-primary/10 rounded-lg mb-2" />
                <div className="h-4 w-64 bg-brand-primary/5 rounded-md" />
            </div>

            {/* Subject gallery row */}
            <div className="flex gap-2 mt-4 mb-1">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 w-24 rounded-full bg-brand-primary/8" />
                ))}
                <div className="h-8 w-8 rounded-full bg-brand-primary/5" />
            </div>

            {/* Table shell */}
            <div className="flex-1 mt-3 rounded-xl border border-brand-primary/8 overflow-hidden">
                {/* Toolbar */}
                <div className="h-12 border-b border-brand-primary/8 bg-brand-primary/[0.02] px-4 flex items-center gap-2">
                    <div className="h-7 w-48 rounded-lg bg-brand-primary/8" />
                    <div className="ml-auto flex gap-2">
                        <div className="h-7 w-32 rounded-lg bg-brand-primary/8" />
                        <div className="h-7 w-32 rounded-lg bg-brand-primary/8" />
                    </div>
                </div>

                {/* Header row */}
                <div className="h-10 border-b border-brand-primary/8 flex items-center gap-4 px-4">
                    {[4, 4, 44, 20, 12, 28, 24].map((w, i) => (
                        <div key={i} className={`h-3 w-${w} rounded bg-brand-primary/5`} />
                    ))}
                </div>

                {/* Data rows */}
                {Array.from({ length: 9 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-12 border-b border-brand-primary/5 flex items-center gap-4 px-4"
                        style={{ opacity: 1 - i * 0.08 }}
                    >
                        <div className="h-4 w-4 rounded bg-brand-primary/8" />
                        <div className="h-5 w-5 rounded bg-brand-primary/8" />
                        <div className="h-4 w-48 rounded bg-brand-primary/8" />
                        <div className="h-5 w-20 rounded-full bg-brand-primary/6" />
                        <div className="h-4 w-10 rounded bg-brand-primary/5" />
                        <div className="h-5 w-28 rounded-full bg-brand-primary/5 ml-auto" />
                        <div className="h-4 w-24 rounded bg-brand-primary/5" />
                    </div>
                ))}
            </div>
        </div>
    );
}
