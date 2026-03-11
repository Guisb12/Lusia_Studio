"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/icons";
import { Plus } from "lucide-react";

/** Darken a hex color by mixing with black (amount 0–1). */
function darkenHex(hex: string, amount: number): string {
    const n = hex.replace(/^#/, "");
    if (n.length !== 6) return hex;
    const r = Math.max(0, Math.round(parseInt(n.slice(0, 2), 16) * (1 - amount)));
    const g = Math.max(0, Math.round(parseInt(n.slice(2, 4), 16) * (1 - amount)));
    const b = Math.max(0, Math.round(parseInt(n.slice(4, 6), 16) * (1 - amount)));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

interface ClassCardProps {
    label: string;
    subjectColor?: string;
    subjectIcon?: string | null;
    memberCount?: number;
    isActive?: boolean;
    onClick: () => void;
    compact?: boolean;
}

export const ClassCard = React.memo(function ClassCard({
    label,
    subjectColor,
    subjectIcon,
    memberCount,
    isActive,
    onClick,
    compact,
}: ClassCardProps) {
    const color = subjectColor || "#6B7280";
    const colorDark = darkenHex(color, 0.35);
    const Icon = getSubjectIcon(subjectIcon);
    const rawId = React.useId();
    const uid = rawId.replace(/[^a-zA-Z0-9]/g, "");

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
                viewBox="0 0 240 230"
                width="100%"
                height="100%"
            >
                <defs>
                    <filter id={`ss-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.15" />
                    </filter>
                    <filter id={`ls-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.12" />
                    </filter>
                </defs>

                <g filter={`url(#ss-${uid})`}>
                    <rect x="15" y="15" width="210" height="145" rx="12" fill={colorDark} />
                    <rect
                        x="25" y="25" width="190" height="125" rx="6" fill={color}
                        style={{ transition: "filter 0.4s ease", filter: isActive ? "brightness(1.15)" : undefined }}
                        className={isActive ? undefined : "group-hover:[filter:brightness(1.15)]"}
                    />
                    <rect x="25" y="25" width="190" height="6" rx="3" fill="#000" opacity="0.1" />
                    <rect x="85" y="138" width="15" height="5" rx="2.5" fill="#fff" opacity="0.4" />
                    <rect x="140" y="138" width="15" height="5" rx="2.5" fill="#fff" opacity="0.4" />

                    <foreignObject x="70" y="25" width="100" height="100" style={{ pointerEvents: "none" }}>
                        <div
                            // @ts-ignore
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Icon style={{ height: "64px", width: "64px", color: "#fff", opacity: 0.9 }} />
                        </div>
                    </foreignObject>

                    {memberCount !== undefined && (
                        <g>
                            <rect x="30" y="36" width="54" height="16" rx="8" fill="rgba(0,0,0,0.25)" />
                            <text
                                x="57" y="47"
                                fontSize="9" fontWeight="700" fill="white" textAnchor="middle"
                                style={{ fontFamily: "inherit" }}
                            >
                                {memberCount} {memberCount === 1 ? "aluno" : "alunos"}
                            </text>
                        </g>
                    )}

                    <g
                        filter={`url(#ls-${uid})`}
                        style={{
                            transformOrigin: "58px 175px",
                            transition: "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
                            transform: isActive ? "translateY(-16px) rotate(-8deg)" : undefined,
                        }}
                        className={isActive ? undefined : "group-hover:[transform:translateY(-16px)_rotate(-8deg)]"}
                    >
                        <rect x="30" y="145" width="56" height="60" rx="22" fill="#fff" stroke="#CBD5E1" strokeWidth="2.5" />
                        <circle cx="58" cy="115" r="21" fill="#FDBA74" stroke="#FB923C" strokeWidth="1.5" />
                        <path d="M 45 145 Q 58 153 71 145" fill="none" stroke="#CBD5E1" strokeWidth="2" />
                        <path d="M 53 151 Q 51 162 53 170 M 63 151 Q 65 162 63 170" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    </g>

                    <g
                        filter={`url(#ls-${uid})`}
                        style={{
                            transformOrigin: "182px 175px",
                            transition: "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
                            transform: isActive ? "translateY(-16px) rotate(8deg)" : undefined,
                        }}
                        className={isActive ? undefined : "group-hover:[transform:translateY(-16px)_rotate(8deg)]"}
                    >
                        <rect x="154" y="145" width="56" height="60" rx="22" fill="#fff" stroke="#CBD5E1" strokeWidth="2.5" />
                        <circle cx="182" cy="115" r="21" fill="#FDBA74" stroke="#FB923C" strokeWidth="1.5" />
                        <path d="M 167 145 L 182 161 L 197 145" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                        <rect x="176" y="161" width="12" height="18" rx="2" fill="#fff" stroke="#CBD5E1" strokeWidth="1.5" />
                        <rect x="179" y="165" width="6" height="6" rx="1" fill={color} opacity="0.6" />
                    </g>

                    <g
                        filter={`url(#ls-${uid})`}
                        style={{
                            transformOrigin: "120px 175px",
                            transition: "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
                            transform: isActive ? "translateY(-22px) scale(1.05)" : undefined,
                        }}
                        className={isActive ? undefined : "group-hover:[transform:translateY(-22px)_scale(1.05)]"}
                    >
                        <rect x="85" y="135" width="70" height="70" rx="26" fill="#fff" stroke="#CBD5E1" strokeWidth="2.5" />
                        <circle cx="120" cy="100" r="25" fill="#FDBA74" stroke="#FB923C" strokeWidth="1.5" />
                        <rect x="104" y="152" width="32" height="40" rx="3" fill={color} />
                        <path d="M 108 152 L 108 192" stroke="#fff" strokeWidth="2" opacity="0.3" />
                        <rect x="114" y="160" width="14" height="4" rx="2" fill="#fff" opacity="0.6" />
                    </g>

                    <g filter={`url(#ls-${uid})`}>
                        <rect x="5" y="175" width="230" height="46" rx="12" fill={colorDark} />
                        <rect x="5" y="175" width="230" height="3" rx="1.5" fill="#fff" opacity="0.08" />
                    </g>

                    <foreignObject x="12" y="178" width="216" height="40">
                        <div
                            // @ts-ignore
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                paddingLeft: "8px",
                                paddingRight: "8px",
                                boxSizing: "border-box",
                            }}
                        >
                            <Icon style={{ height: "16px", width: "16px", color: "rgba(255,255,255,0.6)", flexShrink: 0 }} />
                            <div
                                style={{
                                    fontSize: "15px",
                                    fontWeight: "700",
                                    color: "#FFFFFF",
                                    lineHeight: 1.25,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {label}
                            </div>
                        </div>
                    </foreignObject>
                </g>
            </svg>
        </button>
    );
});

export function AddClassCard({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
    const color = "#94A3B8";
    const colorDark = darkenHex(color, 0.25);

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
                viewBox="0 0 240 230"
                width="100%"
                height="100%"
            >
                <defs>
                    <filter id="add-class-shadow" x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.10" />
                    </filter>
                </defs>

                <g filter="url(#add-class-shadow)">
                    <rect x="15" y="15" width="210" height="145" rx="12" fill={colorDark} opacity="0.5" stroke={color} strokeWidth="2" strokeDasharray="6 4" />
                    <rect x="25" y="25" width="190" height="125" rx="6" fill={color} opacity="0.4" stroke={color} strokeWidth="1.5" strokeDasharray="6 4" />

                    <foreignObject x="70" y="25" width="100" height="100" style={{ pointerEvents: "none" }}>
                        <div
                            // @ts-ignore
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Plus style={{ height: "48px", width: "48px", color: "#fff", opacity: 0.7 }} />
                        </div>
                    </foreignObject>

                    <rect x="5" y="175" width="230" height="46" rx="12" fill={colorDark} opacity="0.4" />

                    <foreignObject x="12" y="178" width="216" height="40">
                        <div
                            // @ts-ignore
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                paddingLeft: "8px",
                                paddingRight: "8px",
                                boxSizing: "border-box",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "15px",
                                    fontWeight: "700",
                                    lineHeight: 1.25,
                                    color: "rgba(255,255,255,0.7)",
                                }}
                            >
                                Criar Turma
                            </div>
                        </div>
                    </foreignObject>
                </g>
            </svg>
        </button>
    );
}
