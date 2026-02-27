"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getGradeScale, QUALITATIVE_GRADES } from "@/lib/grades/calculations";

interface DirectGradeInputProps {
  educationLevel: string;
  currentGrade: number | null;
  currentQualitative: string | null;
  onSave: (grade: number | null, qualitative: string | null) => void;
  saving: boolean;
}

export function DirectGradeInput({
  educationLevel,
  currentGrade,
  currentQualitative,
  onSave,
  saving,
}: DirectGradeInputProps) {
  const scale = getGradeScale(educationLevel);
  const [grade, setGrade] = useState<string>(
    currentGrade !== null ? String(currentGrade) : "",
  );
  const [qualitative, setQualitative] = useState<string>(
    currentQualitative || "",
  );

  const handleSave = () => {
    if (scale.isQualitative) {
      onSave(null, qualitative || null);
    } else {
      const parsed = parseInt(grade, 10);
      onSave(isNaN(parsed) ? null : parsed, null);
    }
  };

  const isValid = scale.isQualitative
    ? qualitative !== ""
    : grade !== "" && !isNaN(parseInt(grade, 10));

  return (
    <div>
      <h3 className="text-sm font-medium text-brand-primary mb-3">
        Nota da Pauta
      </h3>

      {scale.isQualitative ? (
        /* Qualitative dropdown for 1º Ciclo */
        <div className="space-y-2 mb-4">
          {QUALITATIVE_GRADES.map((q) => (
            <button
              key={q}
              onClick={() => setQualitative(q)}
              className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors ${
                qualitative === q
                  ? "border-brand-accent bg-brand-accent/5 text-brand-accent font-medium"
                  : "border-brand-primary/10 text-brand-primary/60 hover:border-brand-primary/20"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      ) : (
        /* Numeric input */
        <div className="mb-4">
          <div className="relative">
            <input
              type="number"
              min={scale.min}
              max={scale.max}
              step={1}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder={`${scale.min}–${scale.max}`}
              className="w-full rounded-xl border border-brand-primary/10 px-4 py-3 text-center text-3xl font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors"
            />
          </div>
          <p className="text-xs text-brand-primary/40 text-center mt-2">
            Escala: {scale.min} a {scale.max} (aprovação: {scale.passing})
          </p>
        </div>
      )}

      <Button
        onClick={handleSave}
        disabled={!isValid}
        loading={saving}
        className="w-full"
      >
        Guardar Nota
      </Button>
    </div>
  );
}
