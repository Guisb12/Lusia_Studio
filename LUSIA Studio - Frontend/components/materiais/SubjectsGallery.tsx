"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/icons";
import type { MaterialSubject } from "@/lib/materials";

/** Lighten a hex color by mixing with white (amount 0–1). */
function lightenHex(hex: string, amount: number): string {
    const n = hex.replace(/^#/, "");
    if (n.length !== 6) return hex;
    const r = Math.min(255, Math.round(parseInt(n.slice(0, 2), 16) + (255 - parseInt(n.slice(0, 2), 16)) * amount));
    const g = Math.min(255, Math.round(parseInt(n.slice(2, 4), 16) + (255 - parseInt(n.slice(2, 4), 16)) * amount));
    const b = Math.min(255, Math.round(parseInt(n.slice(4, 6), 16) + (255 - parseInt(n.slice(4, 6), 16)) * amount));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

interface SubjectsGalleryProps {
    subjects: MaterialSubject[];
    loading?: boolean;
    activeSubjectId?: string | null;
    onSubjectClick: (subject: MaterialSubject) => void;
    onAddSubjectClick?: () => void;
    compact?: boolean;
}

const SubjectCard = React.memo(function SubjectCard({
    subject,
    isActive,
    onClick,
    compact,
}: {
    subject: MaterialSubject;
    isActive?: boolean;
    onClick: () => void;
    compact?: boolean;
}) {
    const Icon = getSubjectIcon(subject.icon);
    const color = subject.color || "#6B7280";
    const frontFlapFill = lightenHex(color, 0.15);
    const frontFlapStroke = color;

    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex-shrink-0 text-left group cursor-pointer focus:outline-none transition-all duration-300",
                compact ? "w-[120px] h-[130px]" : "w-[170px] h-[180px]",
            )}
            style={{ background: "none", border: "none", padding: 0 }}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="10 20 180 110"
                width="100%"
                height="100%"
            >
                <defs>
                    <filter id={`folder-shadow-${subject.id}`} x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.18" />
                    </filter>
                    <filter id={`paper-shadow-${subject.id}`} x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.10" />
                    </filter>
                    <clipPath id={`flap-clip-${subject.id}`}>
                        <path d="M 20 125 A 15 15 0 0 0 35 140 L 165 140 A 15 15 0 0 0 180 125 L 180 63 A 15 15 0 0 0 165 48 L 100 48 C 85 48, 80 32, 65 32 L 35 32 A 15 15 0 0 0 20 47 Z" />
                    </clipPath>
                </defs>

                <g filter={`url(#folder-shadow-${subject.id})`}>
                    {/* Back folder */}
                    <rect x="20" y="20" width="160" height="120" rx="15" fill={color} />

                    {/* Papers */}
                    <g>
                        {/* Left paper */}
                        <g
                            filter={`url(#paper-shadow-${subject.id})`}
                            style={{
                                transformOrigin: "58px 98px",
                                transition: "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                transform: isActive ? "translateY(-26px) rotate(-18deg)" : undefined,
                            }}
                            className={isActive ? undefined : "group-hover:[transform:translateY(-26px)_rotate(-18deg)]"}
                        >
                            <rect x="34" y="28" width="48" height="70" rx="3" fill="#F4F4F4" stroke="#E5E5E5" strokeWidth="1" />
                            <rect x="41" y="38" width="20" height="4" rx="2" fill={color} opacity="0.7" />
                            <line x1="41" y1="50" x2="74" y2="50" stroke="#D8D8D8" strokeWidth="2.5" strokeLinecap="round" />
                            <line x1="41" y1="58" x2="64" y2="58" stroke="#D8D8D8" strokeWidth="2.5" strokeLinecap="round" />
                            <line x1="41" y1="66" x2="69" y2="66" stroke="#D8D8D8" strokeWidth="2.5" strokeLinecap="round" />
                            <line x1="41" y1="74" x2="55" y2="74" stroke="#D8D8D8" strokeWidth="2.5" strokeLinecap="round" />
                        </g>

                        {/* Right paper */}
                        <g
                            filter={`url(#paper-shadow-${subject.id})`}
                            style={{
                                transformOrigin: "136px 108px",
                                transition: "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                transform: isActive ? "translateY(-30px) rotate(18deg)" : undefined,
                            }}
                            className={isActive ? undefined : "group-hover:[transform:translateY(-30px)_rotate(18deg)]"}
                        >
                            <rect x="112" y="38" width="48" height="70" rx="3" fill="#F9F9F9" stroke="#E5E5E5" strokeWidth="1" />
                            <rect x="119" y="48" width="25" height="4" rx="2" fill={color} opacity="0.5" />
                            <line x1="119" y1="60" x2="152" y2="60" stroke="#E0E0E0" strokeWidth="2.5" strokeLinecap="round" />
                            <line x1="119" y1="68" x2="142" y2="68" stroke="#E0E0E0" strokeWidth="2.5" strokeLinecap="round" />
                            <line x1="119" y1="76" x2="147" y2="76" stroke="#E0E0E0" strokeWidth="2.5" strokeLinecap="round" />
                        </g>

                        {/* Middle paper */}
                        <g
                            filter={`url(#paper-shadow-${subject.id})`}
                            style={{
                                transformOrigin: "96px 102px",
                                transition: "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                transform: isActive ? "translateY(-38px) rotate(0deg)" : undefined,
                            }}
                            className={isActive ? undefined : "group-hover:[transform:translateY(-38px)_rotate(0deg)]"}
                        >
                            <rect x="72" y="32" width="48" height="70" rx="3" fill="#FFFFFF" stroke="#E5E5E5" strokeWidth="1" />
                            <rect x="79" y="42" width="22" height="4" rx="2" fill={color} opacity="0.9" />
                            <line x1="79" y1="54" x2="112" y2="54" stroke="#D0D0D0" strokeWidth="2.5" strokeLinecap="round" />
                            <line x1="79" y1="62" x2="104" y2="62" stroke="#D0D0D0" strokeWidth="2.5" strokeLinecap="round" />
                            <line x1="79" y1="70" x2="109" y2="70" stroke="#D0D0D0" strokeWidth="2.5" strokeLinecap="round" />
                            <line x1="79" y1="78" x2="95" y2="78" stroke="#D0D0D0" strokeWidth="2.5" strokeLinecap="round" />
                        </g>
                    </g>

                    {/* Front folder flap — lighter fill, same-tone outline */}
                    <path
                        d="M 20 125 A 15 15 0 0 0 35 140 L 165 140 A 15 15 0 0 0 180 125 L 180 63 A 15 15 0 0 0 165 48 L 100 48 C 85 48, 80 32, 65 32 L 35 32 A 15 15 0 0 0 20 47 Z"
                        fill={frontFlapFill}
                        stroke={frontFlapStroke}
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                    />

                    {/* Subject icon — left side, just below the folder tab (y≈47) */}
                    <foreignObject x="30" y="45" width="28" height="28">
                        <div
                            // @ts-ignore - xmlns required for SVG foreignObject
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Icon style={{ height: "24px", width: "24px", color: "#fff" }} />
                        </div>
                    </foreignObject>

                    {/* Grade/year tags — stacked vertically on the right */}
                    {subject.grade_levels && subject.grade_levels.length > 0 && (
                        <g>
                            {subject.grade_levels.slice(0, 4).map((grade, i) => (
                                <g key={grade}>
                                    <rect x={145} y={58 + i * 16} width="19" height="12" rx="4" fill="rgba(255,255,255,0.20)" />
                                    <text
                                        x={154.5}
                                        y={67 + i * 16}
                                        fontSize="7"
                                        fontWeight="700"
                                        fill="white"
                                        textAnchor="middle"
                                        style={{ fontFamily: "inherit" }}
                                    >
                                        {grade}º
                                    </text>
                                </g>
                            ))}
                            {subject.grade_levels.length > 4 && (
                                <g>
                                    <rect x={145} y={58 + 4 * 16} width="19" height="12" rx="4" fill="rgba(255,255,255,0.14)" />
                                    <text
                                        x={154.5}
                                        y={67 + 4 * 16}
                                        fontSize="7"
                                        fontWeight="700"
                                        fill="white"
                                        textAnchor="middle"
                                        style={{ fontFamily: "inherit" }}
                                    >
                                        +{subject.grade_levels.length - 4}
                                    </text>
                                </g>
                            )}
                        </g>
                    )}

                    {/* Bottom content — icon + title + subtitle */}
                    <foreignObject
                        x="20"
                        y="90"
                        width="160"
                        height="47"
                        clipPath={`url(#flap-clip-${subject.id})`}
                    >
                        <div
                            // @ts-ignore - xmlns required for SVG foreignObject
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "flex-end",
                                padding: "6px 10px",
                                boxSizing: "border-box",
                                gap: "2px",
                            }}
                        >
                            {/* Title */}
                            <div
                                style={{
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    color: "#fff",
                                    lineHeight: 1.25,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {subject.name}
                            </div>
                            {/* Subtitle */}
                            <div
                                style={{
                                    fontSize: "9px",
                                    color: "rgba(255,255,255,0.6)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {subject.education_level_label}
                            </div>
                        </div>
                    </foreignObject>
                </g>
            </svg>
        </button>
    );
});

function AddSubjectCard({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
    const color = "#9CA3AF"; // Gray color for add button

    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex-shrink-0 text-left group cursor-pointer focus:outline-none transition-all duration-300",
                compact ? "w-[120px] h-[130px]" : "w-[170px] h-[180px]",
            )}
            style={{ background: "none", border: "none", padding: 0 }}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="10 20 180 110"
                width="100%"
                height="100%"
            >
                <defs>
                    <filter id="add-folder-shadow" x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.18" />
                    </filter>
                </defs>

                <g filter="url(#add-folder-shadow)">
                    {/* Back folder */}
                    <rect x="20" y="20" width="160" height="120" rx="15" fill={color} opacity="0.6" stroke={color} strokeWidth="2" strokeDasharray="4 4" />

                    {/* Front folder flap */}
                    <path
                        d="M 20 125 A 15 15 0 0 0 35 140 L 165 140 A 15 15 0 0 0 180 125 L 180 63 A 15 15 0 0 0 165 48 L 100 48 C 85 48, 80 32, 65 32 L 35 32 A 15 15 0 0 0 20 47 Z"
                        fill={color}
                        opacity="0.6"
                        stroke={color}
                        strokeWidth="2"
                        strokeDasharray="4 4"
                    />

                    {/* Plus icon */}
                    <foreignObject x="30" y="45" width="28" height="28">
                        <div
                            // @ts-ignore - xmlns required for SVG foreignObject
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Plus style={{ height: "24px", width: "24px", color: "#fff" }} />
                        </div>
                    </foreignObject>

                    {/* Bottom content */}
                    <foreignObject
                        x="20"
                        y="90"
                        width="160"
                        height="47"
                    >
                        <div
                            // @ts-ignore - xmlns required for SVG foreignObject
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "flex-end",
                                padding: "6px 10px",
                                boxSizing: "border-box",
                                gap: "2px",
                            }}
                        >
                            {/* Title */}
                            <div
                                style={{
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    color: "#fff",
                                    lineHeight: 1.25,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                Adicionar Disciplina
                            </div>
                        </div>
                    </foreignObject>
                </g>
            </svg>
        </button>
    );
}

function SkeletonCard({ compact }: { compact?: boolean }) {
    return (
        <div className={cn(
            "flex-shrink-0 rounded-xl bg-white border-2 border-brand-primary/5 animate-pulse transition-all duration-300",
            compact ? "w-[120px] h-[100px]" : "w-[170px] h-[136px]",
        )}>
            <div className="h-full flex flex-col justify-between p-4">
                <div className="flex items-start justify-between">
                    <div className="h-8 w-8 rounded-lg bg-brand-primary/5" />
                    <div className="h-5 w-12 rounded-full bg-brand-primary/5" />
                </div>
                <div>
                    <div className="h-3.5 w-28 rounded bg-brand-primary/5 mb-1.5" />
                    <div className="h-2.5 w-16 rounded bg-brand-primary/5" />
                </div>
            </div>
        </div>
    );
}

export function SubjectsGallery({
    subjects,
    loading = false,
    activeSubjectId,
    onSubjectClick,
    onAddSubjectClick,
    compact = false,
}: SubjectsGalleryProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showLeftFade, setShowLeftFade] = useState(false);
    const [showRightFade, setShowRightFade] = useState(false);

    const handleSubjectClick = useCallback(
        (subject: MaterialSubject) => onSubjectClick(subject),
        [onSubjectClick],
    );

    const checkScrollPosition = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const { scrollLeft, scrollWidth, clientWidth } = container;
        const canScrollLeft = scrollLeft > 0;
        const canScrollRight = scrollLeft < scrollWidth - clientWidth - 1; // -1 for rounding issues

        setShowLeftFade(canScrollLeft);
        setShowRightFade(canScrollRight);
    };

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        // Check initial position
        checkScrollPosition();

        // Check on scroll
        container.addEventListener("scroll", checkScrollPosition);

        // Check on resize (content might change)
        const resizeObserver = new ResizeObserver(checkScrollPosition);
        resizeObserver.observe(container);

        return () => {
            container.removeEventListener("scroll", checkScrollPosition);
            resizeObserver.disconnect();
        };
    }, [subjects, loading]);

    return (
        <section className="relative">
            <div
                ref={scrollContainerRef}
                className="flex gap-4 overflow-x-auto pb-2 scrollbar-none"
                style={{ scrollbarWidth: "none" }}
            >
                {loading ? (
                    <>
                        <SkeletonCard compact={compact} />
                        <SkeletonCard compact={compact} />
                        <SkeletonCard compact={compact} />
                    </>
                ) : (
                    <>
                        {subjects.map((subject) => (
                            <SubjectCard
                                key={subject.id}
                                subject={subject}
                                isActive={subject.id === activeSubjectId}
                                onClick={() => handleSubjectClick(subject)}
                                compact={compact}
                            />
                        ))}
                        {onAddSubjectClick && (
                            <AddSubjectCard onClick={onAddSubjectClick} compact={compact} />
                        )}
                    </>
                )}
            </div>
            {/* Left fade mask */}
            {showLeftFade && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-10"
                    style={{
                        background: "linear-gradient(to right, #f6f3ef 0%, rgba(246, 243, 239, 0) 100%)",
                    }}
                />
            )}
            {/* Right fade mask */}
            {showRightFade && (
                <div
                    className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10"
                    style={{
                        background: "linear-gradient(to left, #f6f3ef 0%, rgba(246, 243, 239, 0) 100%)",
                    }}
                />
            )}
        </section>
    );
}
