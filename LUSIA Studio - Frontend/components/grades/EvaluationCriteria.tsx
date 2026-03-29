"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ELEMENT_TYPES, getElementTypeInfo } from "@/lib/grades";
import { getEvaluationGradeScale, type PeriodGradeResult } from "@/lib/grades/calculations";
import type { EvaluationElement } from "@/lib/grades";
import { cn } from "@/lib/utils";

interface EvaluationCriteriaProps {
  elements: EvaluationElement[];
  educationLevel: string;
  gradeScale?: string | null;
  liveCalculation: PeriodGradeResult;
  onElementGradeUpdate: (elementId: string, rawGrade: number | null) => void;
  onElementsSave: (
    elements: {
      element_type: string;
      label: string;
      icon?: string | null;
      weight_percentage: number | null;
      raw_grade?: number | null;
    }[],
  ) => void;
  onStructureChange?: () => void;
  saving: boolean;
}

interface LocalElement {
  _key: number;
  id?: string;
  element_type: string;
  label: string;
  weight_percentage: number | null;
  raw_grade: number | null;
  raw_grade_input: string;
}

function sanitizeEditableText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeNumericInput(value: string): string {
  let v = value.replace(",", ".");
  v = v.replace(/[^\d.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) {
    v = parts[0] + "." + parts.slice(1).join("");
  }
  return v;
}

function GradeInput({
  value,
  onChange,
  onBlurValue,
  min,
  max,
  step,
  placeholder = "—",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlurValue?: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode={step && step < 1 ? "decimal" : "numeric"}
      value={value}
      onChange={(e) => {
        const sanitized = sanitizeNumericInput(e.target.value);
        if (sanitized === "" || sanitized === ".") {
          onChange(sanitized);
          return;
        }
        const num = parseFloat(sanitized);
        if (!isNaN(num) && num <= max) {
          onChange(sanitized);
        }
      }}
      onBlur={(e) => {
        const v = e.target.value;
        if (v === "" || v === ".") {
          onBlurValue?.("");
          return;
        }
        const num = parseFloat(v);
        if (isNaN(num)) {
          onChange("");
          onBlurValue?.("");
          return;
        }
        const clamped = Math.min(Math.max(num, min), max);
        const nextValue = String(clamped);
        onChange(nextValue);
        onBlurValue?.(nextValue);
      }}
      placeholder={placeholder}
      className={cn(
        "w-14 rounded-lg border border-brand-primary/10 px-1.5 py-1 text-center text-sm font-semibold text-brand-primary",
        "placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors",
        className,
      )}
    />
  );
}

function TypePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const info = getElementTypeInfo(value);
  const SelectedIcon = info.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-brand-primary/10 bg-brand-primary/[0.03] pl-2 pr-1.5 py-1.5 cursor-pointer hover:border-brand-primary/20 hover:bg-brand-primary/[0.05] transition-colors"
        >
          <SelectedIcon className="h-3.5 w-3.5 text-brand-primary/50" />
          <ChevronDown className="h-3 w-3 text-brand-primary/30" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1 rounded-xl border-brand-primary/10 shadow-lg" align="start" sideOffset={4}>
        {ELEMENT_TYPES.map((t) => {
          const TIcon = t.icon;
          const isActive = value === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => { onChange(t.key); setOpen(false); }}
              className={cn(
                "flex items-center justify-between w-full gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-brand-primary/5 text-brand-primary font-medium"
                  : "text-brand-primary/70 hover:bg-brand-primary/[0.03]",
              )}
            >
              <div className="flex items-center gap-2">
                <TIcon className="h-3.5 w-3.5 text-brand-primary/50" />
                <span>{t.label}</span>
              </div>
              {isActive && (
                <Check className="h-3.5 w-3.5 text-brand-accent" />
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

let nextKey = 1;

export function EvaluationCriteria({
  elements,
  educationLevel,
  gradeScale,
  liveCalculation,
  onElementGradeUpdate,
  onElementsSave,
  onStructureChange,
  saving,
}: EvaluationCriteriaProps) {
  const scale = getEvaluationGradeScale(educationLevel, gradeScale);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localRef = useRef<LocalElement[]>([]);

  const [local, setLocal] = useState<LocalElement[]>(() =>
    elements.length > 0
      ? elements.map((e) => ({
          _key: nextKey++,
          id: e.id,
          element_type: e.element_type,
          label: e.label,
          weight_percentage: e.weight_percentage,
          raw_grade: e.raw_grade,
          raw_grade_input: e.raw_grade !== null ? String(e.raw_grade) : "",
        }))
      : [{ _key: nextKey++, element_type: "teste", label: "Teste 1", weight_percentage: 100, raw_grade: null, raw_grade_input: "" }],
  );

  localRef.current = local;

  // Sync from API response
  useEffect(() => {
    if (elements.length === 0) return;
    setLocal((prev) => {
      if (prev.length !== elements.length) {
        return elements.map((e) => ({
          _key: nextKey++,
          id: e.id,
          element_type: e.element_type,
          label: e.label,
          weight_percentage: e.weight_percentage,
          raw_grade: e.raw_grade,
          raw_grade_input: e.raw_grade !== null ? String(e.raw_grade) : "",
        }));
      }
      return prev.map((item, i) => ({
        ...item,
        id: elements[i].id,
        raw_grade: elements[i].raw_grade,
        raw_grade_input: elements[i].raw_grade !== null ? String(elements[i].raw_grade) : "",
      }));
    });
  }, [elements]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = localRef.current;
      onElementsSave(
        current.map((e) => ({
          element_type: e.element_type,
          label: e.label,
          weight_percentage: e.weight_percentage,
          raw_grade: e.raw_grade,
        })),
      );
      onStructureChange?.();
    }, 800);
  }, [onElementsSave, onStructureChange]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const updateLocal = useCallback(
    (idx: number, field: keyof LocalElement, value: unknown) => {
      setLocal((prev) =>
        prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
      );
      if (field !== "raw_grade") {
        scheduleSave();
      }
    },
    [scheduleSave],
  );

  const handleGradeChange = useCallback(
    (idx: number, value: string) => {
      const rawGrade = value === "" || value === "." ? null : parseFloat(value);
      setLocal((prev) =>
        prev.map((e, i) => (i === idx ? { ...e, raw_grade: rawGrade, raw_grade_input: value } : e)),
      );
    },
    [],
  );

  const commitGradeChange = useCallback(
    (idx: number, value: string) => {
      const item = localRef.current[idx];
      if (!item) {
        return;
      }

      const rawGrade = value === "" || value === "." ? null : parseFloat(value);
      if (item.id) {
        onElementGradeUpdate(item.id, rawGrade);
        return;
      }

      scheduleSave();
    },
    [onElementGradeUpdate, scheduleSave],
  );

  const addElement = useCallback(() => {
    setLocal((prev) => [
      ...prev,
      {
        _key: nextKey++,
        element_type: "teste",
        label: `Teste ${prev.filter((e) => e.element_type === "teste").length + 1}`,
        weight_percentage: 0,
        raw_grade: null,
        raw_grade_input: "",
      },
    ]);
    scheduleSave();
  }, [scheduleSave]);

  const removeElement = useCallback(
    (idx: number) => {
      setLocal((prev) => prev.filter((_, i) => i !== idx));
      scheduleSave();
    },
    [scheduleSave],
  );

  const totalWeight = local.reduce((sum, e) => sum + (e.weight_percentage ?? 0), 0);
  const isWeightValid = Math.abs(totalWeight - 100) < 0.01;

  return (
    <div>
      <h3 className="text-sm font-medium text-brand-primary mb-3">
        Elementos de Avaliação
      </h3>

      {/* Element rows — always editable */}
      <div className="space-y-1.5 mb-3">
        {local.map((element, idx) => (
          <div
            key={element._key}
            className="flex items-center gap-2 rounded-xl border border-brand-primary/5 bg-white px-2.5 py-2"
          >
            <TypePicker
              value={element.element_type}
              onChange={(value) => updateLocal(idx, "element_type", value)}
            />

            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(event) => {
                const nextLabel = sanitizeEditableText(event.currentTarget.textContent || "");
                updateLocal(idx, "label", nextLabel || getElementTypeInfo(element.element_type).label);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              className="flex-1 min-w-0 text-sm font-medium text-brand-primary outline-none truncate cursor-text"
            >
              {element.label}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <GradeInput
                value={String(element.weight_percentage)}
                onChange={(v) => updateLocal(idx, "weight_percentage", parseFloat(v) || 0)}
                min={0}
                max={100}
                placeholder="0"
                className="w-11 text-xs"
              />
              <span className="text-[11px] text-brand-primary/35">%</span>
            </div>

            <GradeInput
              value={element.raw_grade_input}
              onChange={(v) => handleGradeChange(idx, v)}
              onBlurValue={(v) => commitGradeChange(idx, v)}
              min={scale.min}
              max={scale.max}
              step={0.1}
              className="w-12"
            />

            <button
              onClick={() => removeElement(idx)}
              className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-brand-primary/25 hover:text-brand-error hover:bg-brand-error/5 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addElement}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-primary/10 px-3 py-2 text-xs text-brand-primary/40 hover:text-brand-primary/60 hover:border-brand-primary/20 transition-colors mb-3"
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar elemento
      </button>

      {/* Weight bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-brand-primary/40">Peso total</span>
          <span
            className={cn(
              "font-semibold",
              isWeightValid ? "text-brand-success" : "text-brand-error",
            )}
          >
            {totalWeight.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-brand-primary/5 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              isWeightValid ? "bg-brand-success" : "bg-brand-error",
            )}
            style={{ width: `${Math.min(totalWeight, 100)}%` }}
          />
        </div>
      </div>

      {/* Live calculation */}
      <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-brand-primary/40 mb-0.5">
              Nota Calculada
            </div>
            <div className="text-2xl font-bold text-brand-primary">
              {liveCalculation.calculatedGrade ?? "—"}
            </div>
            {liveCalculation.rawCalculated !== null && (
              <div className="text-xs text-brand-primary/40">
                Valor exato: {liveCalculation.rawCalculated.toFixed(4)}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-brand-primary/40">
              {liveCalculation.gradedCount}/{liveCalculation.totalCount}{" "}
              avaliações
            </div>
            {!liveCalculation.isComplete && (
              <div className="text-xs text-brand-warning mt-0.5">
                Nota projetada
              </div>
            )}
            {saving && (
              <div className="text-xs text-brand-primary/30 mt-0.5">
                A guardar...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
