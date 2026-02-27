"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPassingGrade } from "@/lib/grades/calculations";

interface AnnualGradeInputProps {
  subjectName: string;
  yearLevel: string;
  academicYear: string;
  currentGrade: number | null;
  onSave: (grade: number) => void;
  onClose: () => void;
}

export function AnnualGradeInput({
  subjectName,
  yearLevel,
  academicYear,
  currentGrade,
  onSave,
  onClose,
}: AnnualGradeInputProps) {
  const [grade, setGrade] = useState<string>(
    currentGrade !== null ? String(currentGrade) : "",
  );
  const [saving, setSaving] = useState(false);

  const parsed = parseInt(grade, 10);
  const isValid = !isNaN(parsed) && parsed >= 0 && parsed <= 20;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await onSave(parsed);
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
              Nota Final — {yearLevel}º ano
            </h3>
            <button
              onClick={onClose}
              className="h-7 w-7 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center hover:bg-brand-primary/[0.08] transition-colors"
            >
              <X className="h-4 w-4 text-brand-primary/50" />
            </button>
          </div>

          <p className="text-sm text-brand-primary/50 mb-1">{subjectName}</p>
          <p className="text-xs text-brand-primary/40 mb-4">
            Ano letivo {academicYear}
          </p>

          <div className="mb-4">
            <input
              type="number"
              min={0}
              max={20}
              step={1}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="0–20"
              className="w-full rounded-xl border border-brand-primary/10 px-4 py-3 text-center text-3xl font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors"
            />
          </div>

          {/* Pass/fail preview */}
          {isValid && (
            <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 mb-4 text-center">
              <span
                className={`text-sm font-bold ${
                  isPassingGrade(parsed, "secundario")
                    ? "text-brand-success"
                    : "text-brand-error"
                }`}
              >
                {parsed}/20 —{" "}
                {isPassingGrade(parsed, "secundario")
                  ? "Positiva"
                  : "Negativa"}
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
