"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ELEMENT_TYPES, getElementTypeInfo } from "@/lib/grades";
import { getGradeScale, type PeriodGradeResult } from "@/lib/grades/calculations";
import type { EvaluationElement } from "@/lib/grades";

interface EvaluationCriteriaProps {
  elements: EvaluationElement[];
  educationLevel: string;
  liveCalculation: PeriodGradeResult;
  onElementGradeUpdate: (elementId: string, rawGrade: number | null) => void;
  onElementsSave: (
    elements: {
      element_type: string;
      label: string;
      icon?: string | null;
      weight_percentage: number;
      raw_grade?: number | null;
    }[],
  ) => void;
  saving: boolean;
}

interface DraftElement {
  id?: string;
  element_type: string;
  label: string;
  weight_percentage: number;
  raw_grade: number | null;
}

export function EvaluationCriteria({
  elements,
  educationLevel,
  liveCalculation,
  onElementGradeUpdate,
  onElementsSave,
  saving,
}: EvaluationCriteriaProps) {
  const scale = getGradeScale(educationLevel);
  const [editing, setEditing] = useState(elements.length === 0);
  const [draft, setDraft] = useState<DraftElement[]>(
    elements.length > 0
      ? elements.map((e) => ({
          id: e.id,
          element_type: e.element_type,
          label: e.label,
          weight_percentage: e.weight_percentage,
          raw_grade: e.raw_grade,
        }))
      : [{ element_type: "teste", label: "Teste 1", weight_percentage: 100, raw_grade: null }],
  );

  const totalWeight = draft.reduce((sum, e) => sum + e.weight_percentage, 0);
  const isWeightValid = Math.abs(totalWeight - 100) < 0.01;

  const addElement = () => {
    setDraft((prev) => [
      ...prev,
      {
        element_type: "teste",
        label: `Teste ${prev.filter((e) => e.element_type === "teste").length + 1}`,
        weight_percentage: 0,
        raw_grade: null,
      },
    ]);
  };

  const removeElement = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateDraft = (idx: number, field: keyof DraftElement, value: unknown) => {
    setDraft((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    );
  };

  const handleSave = () => {
    onElementsSave(
      draft.map((e) => ({
        element_type: e.element_type,
        label: e.label,
        weight_percentage: e.weight_percentage,
        raw_grade: e.raw_grade,
      })),
    );
    setEditing(false);
  };

  // If not editing, show read-only view with inline grade inputs
  if (!editing && elements.length > 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-brand-primary">
            Critérios de Avaliação
          </h3>
          <button
            onClick={() => {
              setDraft(
                elements.map((e) => ({
                  id: e.id,
                  element_type: e.element_type,
                  label: e.label,
                  weight_percentage: e.weight_percentage,
                  raw_grade: e.raw_grade,
                })),
              );
              setEditing(true);
            }}
            className="text-xs text-brand-accent hover:text-brand-accent/80 transition-colors"
          >
            Editar critérios
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {elements.map((element) => {
            const info = getElementTypeInfo(element.element_type);
            return (
              <div
                key={element.id}
                className="flex items-center gap-3 rounded-xl border border-brand-primary/5 bg-white px-3 py-2.5"
              >
                <span className="text-base shrink-0">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-brand-primary truncate">
                    {element.label}
                  </div>
                  <div className="text-xs text-brand-primary/40">
                    {element.weight_percentage}%
                  </div>
                </div>
                <input
                  type="number"
                  min={scale.min}
                  max={scale.max}
                  step={0.1}
                  value={element.raw_grade ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    onElementGradeUpdate(
                      element.id,
                      val === "" ? null : parseFloat(val),
                    );
                  }}
                  placeholder="—"
                  className="w-16 rounded-lg border border-brand-primary/10 px-2 py-1.5 text-center text-sm font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors"
                />
              </div>
            );
          })}
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
                <div className="text-xs text-brand-primary/40 font-mono">
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Editing view — define/modify element structure
  return (
    <div>
      <h3 className="text-sm font-medium text-brand-primary mb-3">
        {elements.length === 0 ? "Definir Critérios" : "Editar Critérios"}
      </h3>

      <div className="space-y-2 mb-3">
        {draft.map((element, idx) => {
          const info = getElementTypeInfo(element.element_type);
          return (
            <div
              key={idx}
              className="rounded-xl border border-brand-primary/5 bg-white px-3 py-2.5"
            >
              <div className="flex items-center gap-2 mb-2">
                {/* Type selector */}
                <select
                  value={element.element_type}
                  onChange={(e) =>
                    updateDraft(idx, "element_type", e.target.value)
                  }
                  className="rounded-lg border border-brand-primary/10 px-2 py-1 text-xs text-brand-primary bg-white focus:outline-none focus:border-brand-accent"
                >
                  {ELEMENT_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>

                {/* Label */}
                <input
                  type="text"
                  value={element.label}
                  onChange={(e) => updateDraft(idx, "label", e.target.value)}
                  placeholder="Nome"
                  className="flex-1 rounded-lg border border-brand-primary/10 px-2 py-1 text-sm text-brand-primary placeholder:text-brand-primary/30 focus:outline-none focus:border-brand-accent"
                />

                {/* Remove */}
                <button
                  onClick={() => removeElement(idx)}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-brand-primary/30 hover:text-brand-error hover:bg-brand-error/5 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-brand-primary/40 w-10">
                  Peso:
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={element.weight_percentage}
                  onChange={(e) =>
                    updateDraft(
                      idx,
                      "weight_percentage",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  className="w-16 rounded-lg border border-brand-primary/10 px-2 py-1 text-center text-sm font-mono text-brand-primary focus:outline-none focus:border-brand-accent"
                />
                <span className="text-xs text-brand-primary/40">%</span>

                <span className="text-xs text-brand-primary/40 ml-2 w-10">
                  Nota:
                </span>
                <input
                  type="number"
                  min={scale.min}
                  max={scale.max}
                  step={0.1}
                  value={element.raw_grade ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateDraft(
                      idx,
                      "raw_grade",
                      val === "" ? null : parseFloat(val),
                    );
                  }}
                  placeholder="—"
                  className="w-16 rounded-lg border border-brand-primary/10 px-2 py-1 text-center text-sm font-mono text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Add element */}
      <button
        onClick={addElement}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-primary/10 px-3 py-2.5 text-xs text-brand-primary/40 hover:text-brand-primary/60 hover:border-brand-primary/20 transition-colors mb-3"
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar critério
      </button>

      {/* Weight validation bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-brand-primary/40">Peso total</span>
          <span
            className={`font-mono font-bold ${
              isWeightValid ? "text-brand-success" : "text-brand-error"
            }`}
          >
            {totalWeight.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-brand-primary/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isWeightValid ? "bg-brand-success" : "bg-brand-error"
            }`}
            style={{ width: `${Math.min(totalWeight, 100)}%` }}
          />
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={!isWeightValid || draft.length === 0}
        loading={saving}
        className="w-full"
      >
        <Save className="h-4 w-4 mr-2" />
        Guardar Critérios
      </Button>
    </div>
  );
}
