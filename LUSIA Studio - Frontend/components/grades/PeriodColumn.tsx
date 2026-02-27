"use client";

import { SubjectCard } from "./SubjectCard";
import type { BoardSubject, SubjectPeriod } from "@/lib/grades";

interface PeriodColumnProps {
  label: string;
  weight: number;
  educationLevel: string;
  items: { subject: BoardSubject; period: SubjectPeriod | undefined }[];
  onCardClick: (subject: BoardSubject, period: SubjectPeriod) => void;
  hideHeader?: boolean;
}

export function PeriodColumn({
  label,
  weight,
  educationLevel,
  items,
  onCardClick,
  hideHeader,
}: PeriodColumnProps) {
  return (
    <div className="flex flex-col">
      {/* Column header */}
      {!hideHeader && (
        <div className="mb-3 px-1">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold text-brand-primary">{label}</h3>
            <span className="text-xs text-brand-primary/40 font-mono">
              {weight % 1 === 0 ? weight.toFixed(0) : weight.toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {/* Subject cards */}
      <div className="space-y-2">
        {items.map(({ subject, period }) =>
          period ? (
            <SubjectCard
              key={subject.enrollment.id}
              subjectName={subject.enrollment.subject_name || "—"}
              subjectColor={subject.enrollment.subject_color || undefined}
              pautaGrade={period.pauta_grade}
              qualitativeGrade={period.qualitative_grade}
              isOverridden={period.is_overridden}
              isLocked={period.is_locked}
              educationLevel={educationLevel}
              hasElements={
                (period.elements && period.elements.length > 0) || false
              }
              onClick={() => onCardClick(subject, period)}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
