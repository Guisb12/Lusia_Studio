"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PeriodColumn } from "./PeriodColumn";
import { getPeriodLabel } from "@/lib/grades/calculations";
import type { BoardSubject, GradeSettings, SubjectPeriod } from "@/lib/grades";

interface GradeBoardProps {
  subjects: BoardSubject[];
  settings: GradeSettings;
  onCardClick: (subject: BoardSubject, period: SubjectPeriod) => void;
}

export function GradeBoard({ subjects, settings, onCardClick }: GradeBoardProps) {
  const numPeriods = settings.period_weights.length;
  const activeSubjects = subjects.filter((s) => s.enrollment.is_active);
  const [activePeriod, setActivePeriod] = useState(0);

  const periods = Array.from({ length: numPeriods }, (_, i) => {
    const periodNumber = i + 1;
    const weight = settings.period_weights[i];
    const label = getPeriodLabel(periodNumber, settings.regime);
    const items = activeSubjects.map((subject) => {
      const period = subject.periods.find((p) => p.period_number === periodNumber);
      return { subject, period };
    });
    return { periodNumber, weight, label, items };
  });

  return (
    <div>
      {/* Mobile period tabs — hidden on md+ */}
      <div className="flex items-center gap-1 mb-4 border-b border-brand-primary/5 md:hidden">
        {periods.map((p, i) => (
          <button
            key={p.periodNumber}
            onClick={() => setActivePeriod(i)}
            className={cn(
              "flex-1 px-3 py-2.5 text-sm transition-all relative",
              activePeriod === i
                ? "text-brand-primary font-medium"
                : "text-brand-primary/50 hover:text-brand-primary/70",
            )}
          >
            {p.label}
            <span className="ml-1 text-[10px] text-brand-primary/30 font-mono">
              {p.weight % 1 === 0 ? p.weight.toFixed(0) : p.weight.toFixed(2)}%
            </span>
            {activePeriod === i && (
              <motion.div
                layoutId="gradePeriodTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      {/* Mobile: single column for active period */}
      <div className="md:hidden">
        <PeriodColumn
          key={periods[activePeriod].periodNumber}
          label={periods[activePeriod].label}
          weight={periods[activePeriod].weight}
          educationLevel={settings.education_level}
          items={periods[activePeriod].items}
          onCardClick={onCardClick}
          hideHeader
        />
      </div>

      {/* Desktop: multi-column grid — hidden on mobile */}
      <div
        className="hidden md:grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${numPeriods}, minmax(0, 1fr))`,
        }}
      >
        {periods.map((p) => (
          <PeriodColumn
            key={p.periodNumber}
            label={p.label}
            weight={p.weight}
            educationLevel={settings.education_level}
            items={p.items}
            onCardClick={onCardClick}
          />
        ))}
      </div>
    </div>
  );
}
