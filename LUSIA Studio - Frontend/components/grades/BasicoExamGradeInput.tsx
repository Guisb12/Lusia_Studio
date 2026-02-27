"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertExamPercentageToLevel } from "@/lib/grades/exam-config";
import type { SubjectCFD } from "@/lib/grades";

interface BasicoExamGradeInputProps {
  cfd: SubjectCFD;
  onSave: (cfdId: string, percentage: number) => void;
  onClose: () => void;
}

const LEVEL_LABELS: Record<number, string> = {
  1: "Muito Insuficiente",
  2: "Insuficiente",
  3: "Suficiente",
  4: "Bom",
  5: "Muito Bom",
};

export function BasicoExamGradeInput({ cfd, onSave, onClose }: BasicoExamGradeInputProps) {
  const [rawScore, setRawScore] = useState<string>(
    cfd.exam_grade_raw !== null ? String(cfd.exam_grade_raw) : "",
  );
  const [saving, setSaving] = useState(false);

  const parsed = parseInt(rawScore, 10);
  const isValid = !isNaN(parsed) && parsed >= 0 && parsed <= 100;
  const convertedLevel = isValid ? convertExamPercentageToLevel(parsed) : null;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await onSave(cfd.id, parsed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-brand-primary">
              Nota da Prova Final
            </h3>
            <button
              onClick={onClose}
              className="h-7 w-7 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center hover:bg-brand-primary/[0.08] transition-colors"
            >
              <X className="h-4 w-4 text-brand-primary/50" />
            </button>
          </div>

          <p className="text-sm text-brand-primary/50 mb-1">
            {cfd.subject_name}
          </p>
          <p className="text-xs text-brand-primary/40 mb-4">
            Insere a nota em percentagem (0 a 100).
          </p>

          <div className="mb-4">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={rawScore}
              onChange={(e) => setRawScore(e.target.value)}
              placeholder="0–100"
              className="w-full rounded-xl border border-brand-primary/10 px-4 py-3 text-center text-3xl font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors"
            />
          </div>

          {isValid && convertedLevel !== null && (
            <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 mb-4 text-center">
              <span className="text-xs text-brand-primary/40">
                {parsed}%
              </span>
              <span className="text-xs text-brand-primary/30 mx-2">&rarr;</span>
              <span className="text-sm font-bold text-brand-primary">
                Nível {convertedLevel}
              </span>
              <span className="text-xs text-brand-primary/40 ml-1.5">
                ({LEVEL_LABELS[convertedLevel]})
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isValid}
              loading={saving}
              className="flex-1"
            >
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
