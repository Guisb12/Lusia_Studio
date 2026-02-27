"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Layers, PenLine, Copy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DirectGradeInput } from "./DirectGradeInput";
import { EvaluationCriteria } from "./EvaluationCriteria";
import { GradeOverrideDialog } from "./GradeOverrideDialog";
import {
  updatePeriodGrade,
  overridePeriodGrade,
  fetchElements,
  replaceElements,
  updateElementGrade,
  copyElementsToOtherPeriods,
} from "@/lib/grades";
import { getPeriodLabel, calculatePeriodGrade } from "@/lib/grades/calculations";
import type {
  BoardSubject,
  SubjectPeriod,
  GradeSettings,
  EvaluationElement,
} from "@/lib/grades";

type InputMode = "direct" | "criteria";

interface SubjectDetailSheetProps {
  subject: BoardSubject;
  period: SubjectPeriod;
  settings: GradeSettings;
  onClose: () => void;
}

export function SubjectDetailSheet({
  subject,
  period: initialPeriod,
  settings,
  onClose,
}: SubjectDetailSheetProps) {
  const [period, setPeriod] = useState(initialPeriod);
  const [mode, setMode] = useState<InputMode>(
    initialPeriod.elements && initialPeriod.elements.length > 0
      ? "criteria"
      : "direct",
  );
  const [elements, setElements] = useState<EvaluationElement[]>(
    initialPeriod.elements || [],
  );
  const [loading, setLoading] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [saving, setSaving] = useState(false);

  const periodLabel = getPeriodLabel(period.period_number, settings.regime);

  // Fetch elements on mount if in criteria mode
  useEffect(() => {
    if (mode === "criteria" && elements.length === 0) {
      fetchElements(period.id)
        .then(setElements)
        .catch(() => {});
    }
  }, [mode, period.id, elements.length]);

  // Handle direct grade save
  const handleDirectSave = async (
    grade: number | null,
    qualitative: string | null,
  ) => {
    setSaving(true);
    try {
      const updated = await updatePeriodGrade(period.id, {
        pauta_grade: grade,
        qualitative_grade: qualitative,
      });
      setPeriod((p) => ({ ...p, ...updated }));
    } catch {
      // Error handled in UI
    } finally {
      setSaving(false);
    }
  };

  // Handle element grade update
  const handleElementGradeUpdate = async (
    elementId: string,
    rawGrade: number | null,
  ) => {
    try {
      const updated = await updateElementGrade(elementId, rawGrade);
      setElements((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e)),
      );
    } catch {
      // Silent for inline edits
    }
  };

  // Handle elements save (full replace)
  const handleElementsSave = async (
    newElements: {
      element_type: string;
      label: string;
      icon?: string | null;
      weight_percentage: number;
      raw_grade?: number | null;
    }[],
  ) => {
    setSaving(true);
    try {
      const saved = await replaceElements(period.id, newElements);
      setElements(saved);
    } catch {
      // Error
    } finally {
      setSaving(false);
    }
  };

  // Handle override
  const handleOverride = async (grade: number, reason: string) => {
    setSaving(true);
    try {
      const updated = await overridePeriodGrade(period.id, {
        pauta_grade: grade,
        override_reason: reason,
      });
      setPeriod((p) => ({ ...p, ...updated }));
      setShowOverride(false);
    } catch {
      // Error
    } finally {
      setSaving(false);
    }
  };

  // Handle copy elements
  const handleCopyElements = async () => {
    setLoading(true);
    try {
      await copyElementsToOtherPeriods(period.id);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  };

  // Compute live grade from elements
  const liveCalc = calculatePeriodGrade(
    elements.map((e) => ({
      weight_percentage: e.weight_percentage,
      raw_grade: e.raw_grade,
    })),
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-brand-primary/5 px-5 py-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-brand-primary">
                {subject.enrollment.subject_name}
              </h2>
              <p className="text-xs text-brand-primary/40">{periodLabel}</p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center hover:bg-brand-primary/[0.08] transition-colors"
            >
              <X className="h-4 w-4 text-brand-primary/50" />
            </button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 mt-3 bg-brand-primary/[0.03] rounded-lg p-1">
            <button
              onClick={() => setMode("direct")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "direct"
                  ? "bg-white text-brand-primary shadow-sm"
                  : "text-brand-primary/50 hover:text-brand-primary/70"
              }`}
            >
              <PenLine className="h-3.5 w-3.5" />
              Nota Direta
            </button>
            <button
              onClick={() => setMode("criteria")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "criteria"
                  ? "bg-white text-brand-primary shadow-sm"
                  : "text-brand-primary/50 hover:text-brand-primary/70"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Critérios
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Override indicator */}
          {period.is_overridden && (
            <div className="mb-4 rounded-xl bg-brand-warning/5 border border-brand-warning/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-brand-warning">
                <AlertTriangle className="h-4 w-4" />
                <span>Nota ajustada manualmente</span>
              </div>
              {period.override_reason && (
                <p className="text-xs text-brand-primary/50 mt-1 ml-6">
                  {period.override_reason}
                </p>
              )}
              <div className="flex items-center gap-2 ml-6 mt-1">
                <span className="text-xs text-brand-primary/40">
                  Calculada: {period.calculated_grade ?? "—"}
                </span>
                <span className="text-xs text-brand-primary/40">→</span>
                <span className="text-xs font-medium text-brand-primary">
                  Pauta: {period.pauta_grade}
                </span>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {mode === "direct" ? (
              <motion.div
                key="direct"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <DirectGradeInput
                  educationLevel={settings.education_level}
                  currentGrade={period.pauta_grade}
                  currentQualitative={period.qualitative_grade}
                  onSave={handleDirectSave}
                  saving={saving}
                />
              </motion.div>
            ) : (
              <motion.div
                key="criteria"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EvaluationCriteria
                  elements={elements}
                  educationLevel={settings.education_level}
                  liveCalculation={liveCalc}
                  onElementGradeUpdate={handleElementGradeUpdate}
                  onElementsSave={handleElementsSave}
                  saving={saving}
                />

                {/* Actions */}
                <div className="mt-4 space-y-2">
                  {/* Copy to other periods */}
                  {elements.length > 0 && (
                    <Button
                      variant="secondary"
                      onClick={handleCopyElements}
                      loading={loading}
                      className="w-full"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar critérios para outros períodos
                    </Button>
                  )}

                  {/* Override */}
                  {liveCalc.calculatedGrade !== null && (
                    <Button
                      variant="secondary"
                      onClick={() => setShowOverride(true)}
                      className="w-full"
                    >
                      Ajustar nota da pauta
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Override dialog */}
      {showOverride && (
        <GradeOverrideDialog
          educationLevel={settings.education_level}
          calculatedGrade={period.calculated_grade ?? liveCalc.calculatedGrade}
          onConfirm={handleOverride}
          onCancel={() => setShowOverride(false)}
          saving={saving}
        />
      )}
    </>
  );
}
