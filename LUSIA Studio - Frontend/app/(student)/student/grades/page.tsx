"use client";

import { useCallback, useEffect, useState } from "react";
import { SetupWizard } from "@/components/grades/SetupWizard";
import { GradesPage } from "@/components/grades/GradesPage";
import { useUser } from "@/components/providers/UserProvider";
import { fetchGradeBoard, getCurrentAcademicYear } from "@/lib/grades";
import type { GradeBoardData } from "@/lib/grades";

export default function GradesEntryPage() {
  const { user } = useUser();
  const [boardData, setBoardData] = useState<GradeBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const academicYear = getCurrentAcademicYear();
  const gradeLevel = parseInt(user?.grade_level || "10", 10);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchGradeBoard(academicYear);
      if (!data.settings) {
        setNeedsSetup(true);
      } else {
        setBoardData(data);
        setNeedsSetup(false);
      }
    } catch {
      setNeedsSetup(true);
    } finally {
      setLoading(false);
    }
  }, [academicYear]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] px-6 py-10">
        <SetupWizard onComplete={loadBoard} />
      </div>
    );
  }

  if (boardData) {
    return (
      <GradesPage
        initialData={boardData}
        academicYear={academicYear}
        gradeLevel={gradeLevel}
      />
    );
  }

  return null;
}
