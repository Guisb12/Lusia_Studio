"use client";

import { Lock, AlertTriangle, Layers } from "lucide-react";
import { isPassingGrade, isNearBoundary, getGradeScale } from "@/lib/grades/calculations";

interface SubjectCardProps {
  subjectName: string;
  subjectColor?: string;
  pautaGrade: number | null;
  qualitativeGrade: string | null;
  isOverridden: boolean;
  isLocked: boolean;
  educationLevel: string;
  hasElements: boolean;
  onClick: () => void;
}

export function SubjectCard({
  subjectName,
  subjectColor,
  pautaGrade,
  qualitativeGrade,
  isOverridden,
  isLocked,
  educationLevel,
  hasElements,
  onClick,
}: SubjectCardProps) {
  const scale = getGradeScale(educationLevel);
  const displayGrade = scale.isQualitative ? qualitativeGrade : pautaGrade;
  const hasGrade = displayGrade !== null && displayGrade !== undefined;

  const passing =
    pautaGrade !== null ? isPassingGrade(pautaGrade, educationLevel) : null;
  const nearBoundary =
    pautaGrade !== null ? isNearBoundary(pautaGrade, educationLevel) : false;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-brand-primary/5 bg-white hover:bg-brand-primary/[0.02] hover:border-brand-primary/10 transition-all duration-200 overflow-hidden group"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Color indicator */}
        <div
          className="w-1 h-8 rounded-full shrink-0"
          style={{
            backgroundColor: subjectColor || "#94a3b8",
          }}
        />

        {/* Subject name */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-brand-primary truncate">
            {subjectName}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            {hasElements && (
              <Layers className="h-3 w-3 text-brand-primary/30" />
            )}
            {isOverridden && (
              <span className="text-[10px] text-brand-warning">
                Ajustada
              </span>
            )}
            {isLocked && <Lock className="h-3 w-3 text-brand-primary/30" />}
          </div>
        </div>

        {/* Grade badge */}
        <div
          className={`shrink-0 min-w-[2.5rem] text-center rounded-lg px-2 py-1 text-sm font-bold transition-colors ${
            !hasGrade
              ? "bg-brand-primary/[0.04] text-brand-primary/25"
              : nearBoundary
                ? "bg-brand-warning/10 text-brand-warning"
                : passing
                  ? "bg-brand-success/10 text-brand-success"
                  : "bg-brand-error/10 text-brand-error"
          }`}
        >
          {hasGrade ? displayGrade : "—"}
          {nearBoundary && (
            <AlertTriangle className="h-3 w-3 inline-block ml-0.5 -mt-0.5" />
          )}
        </div>
      </div>
    </button>
  );
}
