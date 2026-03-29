"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getPautaGradeScale } from "@/lib/grades/calculations";

interface DirectGradeInputProps {
  educationLevel: string;
  gradeScale?: string | null;
  currentGrade: number | null;
  currentQualitative: string | null;
  onSave: (grade: number | null, qualitative: string | null) => void;
  saving: boolean;
}

export function DirectGradeInput({
  educationLevel,
  gradeScale,
  currentGrade,
  currentQualitative,
  onSave,
  saving,
}: DirectGradeInputProps) {
  const scale = getPautaGradeScale(educationLevel, gradeScale);
  const [grade, setGrade] = useState<string>(
    currentGrade !== null ? String(currentGrade) : "",
  );

  const handleSave = () => {
    const parsed = parseInt(grade, 10);
    onSave(isNaN(parsed) ? null : parsed, null);
  };

  const isValid = grade !== "" && !isNaN(parseInt(grade, 10));

  return (
    <div>
      <h3 className="text-sm font-medium text-brand-primary mb-3">
        Nota da Pauta
      </h3>

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
