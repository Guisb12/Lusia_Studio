"use client";

import { Lock, Layers } from "lucide-react";
import { isPassingGrade, getGradeScale } from "@/lib/grades/calculations";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { TooltipInfo } from "@/components/ui/tooltip-info";

export interface SubjectExamSummary {
  internalLabel: string;
  examGrade: number | null;
  internalGrade: number | null;
  finalGrade: number | null;
}

interface SubjectCardProps {
  subjectName: string;
  subjectColor?: string;
  subjectIcon?: string | null;
  pautaGrade: number | null;
  qualitativeGrade: string | null;
  isOverridden: boolean;
  isLocked: boolean;
  educationLevel: string;
  hasElements: boolean;
  onClick: () => void;
  onHover?: () => void;
  examSummary?: SubjectExamSummary | null;
}

export function SubjectCard({
  subjectName,
  subjectColor,
  subjectIcon,
  pautaGrade,
  qualitativeGrade,
  isOverridden,
  isLocked,
  educationLevel,
  hasElements,
  onClick,
  onHover,
  examSummary,
}: SubjectCardProps) {
  const Icon = getSubjectIcon(subjectIcon);
  const scale = getGradeScale(educationLevel);
  const displayGrade = scale.isQualitative ? qualitativeGrade : pautaGrade;
  const hasGrade = displayGrade !== null && displayGrade !== undefined;

  const passing =
    pautaGrade !== null ? isPassingGrade(pautaGrade, educationLevel) : null;

  const formatGrade = (grade: number | null) => {
    if (grade === null || grade === undefined) {
      return "—";
    }
    return Number.isInteger(grade) ? String(grade) : grade.toFixed(1).replace(".", ",");
  };

  return (
    <div className="w-full text-left rounded-xl border border-brand-primary/5 bg-white overflow-visible group">
      <button
        onClick={onClick}
        onMouseEnter={onHover}
        onFocus={onHover}
        onTouchStart={onHover}
        className="w-full text-left hover:bg-brand-primary/[0.02] hover:border-brand-primary/10 transition-all duration-200"
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Subject icon */}
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${subjectColor || "#94a3b8"}12` }}
        >
          <Icon className="h-4 w-4" style={{ color: subjectColor || "#94a3b8" }} />
        </div>

        {/* Subject name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-brand-primary truncate">
              {subjectName}
            </span>
            {hasElements && (
              <Layers className="h-3 w-3 text-brand-primary/25 shrink-0" />
            )}
            {isOverridden && (
              <span className="text-[10px] text-brand-warning shrink-0">
                Ajustada
              </span>
            )}
            {isLocked && <Lock className="h-3 w-3 text-brand-primary/30 shrink-0" />}
          </div>
          {examSummary && (
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-brand-primary/40">
              <span className="inline-flex items-center gap-1">
                <span>{examSummary.internalLabel}</span>
                <TooltipInfo
                  content="A nota que editas aqui e a nota interna. A nota final da disciplina e calculada automaticamente quando existe exame nacional."
                  className="translate-y-[1px]"
                />
              </span>
              <span className="text-brand-primary/20">•</span>
              <span className="font-medium text-brand-accent/80">
                Exame {formatGrade(examSummary.examGrade)}
              </span>
            </div>
          )}
        </div>

        {/* Grade badge */}
        <div className={cn("relative shrink-0", examSummary ? "h-10 w-[3.6rem]" : "h-8 w-10")}>
          {examSummary && (
            <div
              className={cn(
                "absolute bottom-0 right-0 z-0 min-w-[2.35rem] rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold shadow-sm",
                examSummary.finalGrade === null
                  ? "bg-brand-primary/[0.04] text-brand-primary/25"
                  : "bg-brand-accent/10 text-brand-accent",
              )}
            >
              {formatGrade(examSummary.finalGrade)}
            </div>
          )}
          <div
            className={cn(
              "absolute left-0 top-0 z-10 min-w-[2.5rem] text-center rounded-lg px-2 py-1 text-sm font-bold transition-colors",
              !hasGrade
                ? "bg-brand-primary/[0.04] text-brand-primary/25"
                : passing
                  ? "bg-brand-success/10 text-brand-success"
                  : "bg-brand-error/10 text-brand-error",
            )}
          >
            {hasGrade ? displayGrade : "—"}
          </div>
        </div>
        </div>
      </button>
    </div>
  );
}
