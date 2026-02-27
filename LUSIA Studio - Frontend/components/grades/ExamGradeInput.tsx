"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertExamGrade } from "@/lib/grades/calculations";
import type { SubjectCFD } from "@/lib/grades";

interface ExamGradeInputProps {
  cfd: SubjectCFD;
  onSave: (cfdId: string, rawScore: number) => void;
  onClose: () => void;
}

export function ExamGradeInput({ cfd, onSave, onClose }: ExamGradeInputProps) {
  const [rawScore, setRawScore] = useState<string>(
    cfd.exam_grade_raw !== null
      ? String(cfd.exam_grade_raw)
      : cfd.exam_grade !== null
        ? String(cfd.exam_grade * 10)
        : "",
  );
  const [saving, setSaving] = useState(false);

  const parsedRaw = parseInt(rawScore, 10);
  const isValid = !isNaN(parsedRaw) && parsedRaw >= 0 && parsedRaw <= 200;
  const converted = isValid ? convertExamGrade(parsedRaw) : null;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await onSave(cfd.id, parsedRaw);
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
              Nota do Exame Nacional
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
            Insere a nota na escala de 0 a 200 (como publicada pelo IAVE).
          </p>

          <div className="mb-4">
            <input
              type="number"
              min={0}
              max={200}
              step={1}
              value={rawScore}
              onChange={(e) => setRawScore(e.target.value)}
              placeholder="0–200"
              className="w-full rounded-xl border border-brand-primary/10 px-4 py-3 text-center text-3xl font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors"
            />
          </div>

          {/* Conversion preview */}
          {isValid && converted !== null && (
            <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 mb-4 text-center">
              <span className="text-xs text-brand-primary/40">
                {parsedRaw}/200
              </span>
              <span className="text-xs text-brand-primary/30 mx-2">→</span>
              <span className="text-sm font-bold text-brand-primary">
                {converted}/20
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
