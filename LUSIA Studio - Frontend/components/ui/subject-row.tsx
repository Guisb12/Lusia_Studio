"use client";

import { Lock, X } from "lucide-react";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function GradeDisplay({ grades }: { grades: string[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {grades.map((grade) => (
        <span
          key={grade}
          className="inline-flex items-center justify-center h-6 min-w-[32px] px-1.5 rounded-md text-[10px] font-satoshi font-semibold bg-brand-primary/8 text-brand-primary/60"
        >
          {grade}º
        </span>
      ))}
    </div>
  );
}

interface SubjectRowProps {
  name: string;
  icon?: string | null;
  color?: string | null;
  isSelected: boolean;
  isDisabled?: boolean;
  description?: string;
  gradeBadges?: string[];
  warningTooltip?: string;
  onToggle?: () => void;
  onRemove?: () => void;
}

export function SubjectRow({
  name,
  icon,
  color: colorProp,
  isSelected,
  isDisabled,
  description,
  gradeBadges,
  warningTooltip,
  onToggle,
  onRemove,
}: SubjectRowProps) {
  const Icon = getSubjectIcon(icon);
  const color = colorProp || "#6B7280";

  const handleClick = () => {
    if (isDisabled) return;
    if (isSelected && onRemove) {
      onRemove();
    } else if (onToggle) {
      onToggle();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left group",
        isDisabled
          ? "opacity-70 cursor-default"
          : isSelected
            ? "bg-brand-accent/5"
            : "hover:bg-brand-primary/3",
      )}
    >
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}12` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-sm font-satoshi font-medium text-brand-primary truncate block">
          {name}
        </span>
        {description && (
          <span className="text-xs text-brand-primary/40 mt-0.5 block">
            {description}
          </span>
        )}
        {gradeBadges && gradeBadges.length > 0 && (
          <div className="mt-1">
            <GradeDisplay grades={gradeBadges} />
          </div>
        )}
      </div>

      {warningTooltip && (
        <div className="relative group/warn shrink-0">
          <div className="h-5 w-5 rounded-full bg-amber-50 border border-amber-300 flex items-center justify-center cursor-help">
            <span className="text-[10px] font-bold text-amber-500 leading-none">?</span>
          </div>
          <div className="absolute bottom-full right-0 mb-2 w-44 rounded-lg bg-brand-primary px-2.5 py-2 text-[11px] text-white leading-snug opacity-0 group-hover/warn:opacity-100 transition-opacity duration-150 pointer-events-none z-30">
            {warningTooltip}
            <div className="absolute top-full right-2.5 border-4 border-transparent border-t-brand-primary" />
          </div>
        </div>
      )}

      {isDisabled ? (
        <Lock className="h-3.5 w-3.5 text-brand-primary/20 shrink-0" />
      ) : isSelected ? (
        onRemove ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="h-6 w-6 rounded-md flex items-center justify-center text-brand-primary/30 hover:text-brand-error hover:bg-brand-error/10 transition-all shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="h-5 w-5 rounded-md bg-brand-accent flex items-center justify-center shrink-0">
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )
      ) : (
        <div className="h-5 w-5 rounded-md border-2 border-brand-primary/15 group-hover:border-brand-accent/30 transition-colors shrink-0" />
      )}
    </button>
  );
}
