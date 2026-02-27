"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGradeScale } from "@/lib/grades/calculations";

interface GradeOverrideDialogProps {
  educationLevel: string;
  calculatedGrade: number | null;
  onConfirm: (grade: number, reason: string) => void;
  onCancel: () => void;
  saving: boolean;
}

export function GradeOverrideDialog({
  educationLevel,
  calculatedGrade,
  onConfirm,
  onCancel,
  saving,
}: GradeOverrideDialogProps) {
  const scale = getGradeScale(educationLevel);
  const [grade, setGrade] = useState<string>(
    calculatedGrade !== null ? String(calculatedGrade) : "",
  );
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    const parsed = parseInt(grade, 10);
    if (!isNaN(parsed) && reason.trim()) {
      onConfirm(parsed, reason.trim());
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onCancel} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-brand-warning" />
            <h3 className="text-lg font-semibold text-brand-primary">
              Ajustar Nota
            </h3>
          </div>

          <p className="text-sm text-brand-primary/50 mb-4">
            A nota calculada é{" "}
            <strong>{calculatedGrade ?? "—"}</strong>. Podes ajustar para um valor
            diferente (ex: ajuste do Conselho de Turma).
          </p>

          <div className="space-y-3 mb-6">
            <div>
              <label className="text-xs text-brand-primary/50 mb-1 block">
                Nova nota da pauta
              </label>
              <input
                type="number"
                min={scale.min}
                max={scale.max}
                step={1}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full rounded-xl border border-brand-primary/10 px-4 py-2.5 text-center text-xl font-bold text-brand-primary focus:outline-none focus:border-brand-accent transition-colors"
              />
            </div>

            <div>
              <label className="text-xs text-brand-primary/50 mb-1 block">
                Motivo do ajuste (obrigatório)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Professor subiu a nota no conselho de turma"
                rows={2}
                className="w-full rounded-xl border border-brand-primary/10 px-4 py-2.5 text-sm text-brand-primary placeholder:text-brand-primary/30 focus:outline-none focus:border-brand-accent transition-colors resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onCancel} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={
                grade === "" ||
                isNaN(parseInt(grade, 10)) ||
                !reason.trim()
              }
              loading={saving}
              className="flex-1"
            >
              Confirmar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
