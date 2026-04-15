"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/icons";
import type { MaterialSubject } from "@/lib/materials";
import { Artifact } from "@/lib/artifacts";
import { ArtifactIcon } from "@/components/docs/ArtifactIcon";

// ── Types ─────────────────────────────────────────────

interface LandingMaterialsShowcaseProps {
  subjects: MaterialSubject[];
  artifacts: Artifact[];
  activeSubjectId: string | null;
  onSubjectClick: (id: string | null) => void;
}

// ── Helpers ────────────────────────────────────────────

function lightenHex(hex: string, amount: number): string {
  const n = hex.replace(/^#/, "");
  if (n.length !== 6) return hex;
  const r = Math.min(255, Math.round(parseInt(n.slice(0, 2), 16) + (255 - parseInt(n.slice(0, 2), 16)) * amount));
  const g = Math.min(255, Math.round(parseInt(n.slice(2, 4), 16) + (255 - parseInt(n.slice(2, 4), 16)) * amount));
  const b = Math.min(255, Math.round(parseInt(n.slice(4, 6), 16) + (255 - parseInt(n.slice(4, 6), 16)) * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ── Subject Pill (smaller for landing) ───────────────────

function SubjectPill({
  name,
  color,
  icon,
}: {
  name: string;
  color: string | null;
  icon: string | null;
}) {
  const c = color ?? "#6B7280";
  const Icon = getSubjectIcon(icon);
  return (
    <span
      style={{
        color: c,
        backgroundColor: c + "18",
        border: `1.5px solid ${c}`,
        borderBottomWidth: "2.5px",
      }}
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none max-w-full"
    >
      <Icon className="h-2 w-2 shrink-0" style={{ color: c }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

// ── Year Pill (smaller for landing) ──────────────────────

function YearPill({ year }: { year: string }) {
  return (
    <span
      style={{
        color: "#4B5563",
        backgroundColor: "#F3F4F6",
        border: "1.5px solid #9CA3AF",
        borderBottomWidth: "2.5px",
      }}
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none tabular-nums"
    >
      {year}
    </span>
  );
}

// ── Scaled Subject Card with label on top (no margin) ─────────────────

function MiniSubjectCard({
  subject,
  isActive,
  onClick,
}: {
  subject: MaterialSubject;
  isActive?: boolean;
  onClick: () => void;
}) {
  const Icon = getSubjectIcon(subject.icon);
  const color = subject.color || "#6B7280";
  const frontFlapFill = lightenHex(color, 0.15);
  const frontFlapStroke = color;

  return (
    <button
      onClick={onClick}
      className="relative flex-shrink-0 text-left group cursor-pointer focus:outline-none transition-all duration-300"
      style={{ background: "none", border: "none", padding: 0, width: "85px", height: "88px" }}
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

          {/* Front folder flap */}
          <path
            d="M 20 125 A 15 15 0 0 0 35 140 L 165 140 A 15 15 0 0 0 180 125 L 180 63 A 15 15 0 0 0 165 48 L 100 48 C 85 48, 80 32, 65 32 L 35 32 A 15 15 0 0 0 20 47 Z"
            fill={frontFlapFill}
            stroke={frontFlapStroke}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Subject icon */}
          <foreignObject x="30" y="45" width="28" height="28">
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon className="w-5 h-5 text-white" />
            </div>
          </foreignObject>

          {/* Grade/year tags on the right */}
          {subject.grade_levels && subject.grade_levels.length > 0 && (
            <g>
              {subject.grade_levels.slice(0, 3).map((grade, i) => (
                <g key={grade}>
                  <rect x="145" y={58 + i * 14} width="17" height="10" rx="3" fill="rgba(255,255,255,0.20)" />
                  <text
                    x="153.5"
                    y={65 + i * 14}
                    fontSize="6"
                    fontWeight="700"
                    fill="white"
                    textAnchor="middle"
                    style={{ fontFamily: "inherit" }}
                  >
                    {grade.replace("º", "")}º
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Subject name on the folder flap - slightly bigger font */}
          <foreignObject x="20" y="98" width="160" height="40" clipPath={`url(#flap-clip-${subject.id})`}>
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                padding: "4px 10px",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#fff",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {subject.name}
              </div>
            </div>
          </foreignObject>
        </g>
      </svg>
    </button>
  );
}

// ── Docs Table (matching app style) ──────────────────────────────

function MiniDocsTable({
  artifacts,
  subjects,
}: {
  artifacts: Artifact[];
  subjects: MaterialSubject[];
}) {
  return (
    <div className="h-full overflow-auto px-2">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="border-b border-gray-200">
            <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-brand-primary/60 uppercase tracking-wide w-[50%]">
              Nome
            </th>
            <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-brand-primary/60 uppercase tracking-wide w-[25%]">
              Disciplina
            </th>
            <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-brand-primary/60 uppercase tracking-wide w-[25%]">
              Ano
            </th>
          </tr>
        </thead>
        <tbody>
          {artifacts.map((artifact) => {
            const subject = subjects.find(s => s.id === artifact.subject_id);
            const yearLevel = subject?.grade_levels?.[0] || artifact.year_level || "—";

            return (
              <tr
                key={artifact.id}
                className="border-b border-gray-100 hover:bg-brand-primary/[0.02] transition-colors"
              >
                <td className="py-1 px-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 shrink-0 flex items-center justify-center text-brand-primary/50">
                      <ArtifactIcon artifact={artifact} size={16} />
                    </div>
                    <span className="text-[11px] text-brand-primary font-medium truncate max-w-[140px]">
                      {artifact.artifact_name}
                    </span>
                  </div>
                </td>
                <td className="py-1 px-2">
                  {subject ? (
                    <SubjectPill
                      name={subject.name}
                      color={subject.color}
                      icon={subject.icon}
                    />
                  ) : (
                    <span className="text-[10px] text-gray-400">—</span>
                  )}
                </td>
                <td className="py-1 px-2">
                  <YearPill year={yearLevel} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ────────────────────────────────────

export function LandingMaterialsShowcase({
  subjects,
  artifacts,
  activeSubjectId,
  onSubjectClick,
}: LandingMaterialsShowcaseProps) {
  const filteredArtifacts = activeSubjectId
    ? artifacts.filter(a => a.subject_id === activeSubjectId)
    : artifacts;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Folder row - reduced padding */}
      <div className="flex items-center justify-center gap-2 px-2 pt-1 pb-1 border-b border-gray-100 bg-gray-50/30 shrink-0">
        {/* All/Todos button */}
        <button
          onClick={() => onSubjectClick(null)}
          className="relative flex-shrink-0 text-left group cursor-pointer focus:outline-none transition-all duration-300"
          style={{ background: "none", border: "none", padding: 0, width: "85px", height: "88px" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="10 20 180 110"
            width="100%"
            height="100%"
          >
            <defs>
              <filter id="folder-shadow-all" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.18" />
              </filter>
              <clipPath id="flap-clip-all">
                <path d="M 20 125 A 15 15 0 0 0 35 140 L 165 140 A 15 15 0 0 0 180 125 L 180 63 A 15 15 0 0 0 165 48 L 100 48 C 85 48, 80 32, 65 32 L 35 32 A 15 15 0 0 0 20 47 Z" />
              </clipPath>
            </defs>
            <g filter="url(#folder-shadow-all)">
              <rect x="20" y="20" width="160" height="120" rx="15" fill="#6B7280" />
              <path
                d="M 20 125 A 15 15 0 0 0 35 140 L 165 140 A 15 15 0 0 0 180 125 L 180 63 A 15 15 0 0 0 165 48 L 100 48 C 85 48, 80 32, 65 32 L 35 32 A 15 15 0 0 0 20 47 Z"
                fill="#9CA3AF"
                stroke="#6B7280"
                strokeWidth="1.5"
              />
              <text x="100" y="95" fontSize="32" textAnchor="middle" fill="white" fontWeight="bold">+</text>
              
              {/* Todos label on the flap - bigger font */}
              <foreignObject x="20" y="98" width="160" height="40" clipPath="url(#flap-clip-all)">
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-start",
                    padding: "4px 10px",
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: "700",
                      color: "#fff",
                      lineHeight: 1.2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    Todos
                  </div>
                </div>
              </foreignObject>
            </g>
          </svg>
        </button>

        {/* Subject folders */}
        {subjects.map((subject) => (
          <MiniSubjectCard
            key={subject.id}
            subject={subject}
            isActive={activeSubjectId === subject.id}
            onClick={() => onSubjectClick(activeSubjectId === subject.id ? null : subject.id)}
          />
        ))}
      </div>

      {/* Mini docs table - takes remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MiniDocsTable
          artifacts={filteredArtifacts}
          subjects={subjects}
        />
      </div>
    </div>
  );
}
