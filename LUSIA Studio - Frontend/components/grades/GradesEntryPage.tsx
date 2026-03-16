"use client";

import { useEffect } from "react";
import { SetupWizard } from "@/components/grades/SetupWizard";
import { GradesPage } from "@/components/grades/GradesPage";
import { GradesShell } from "@/components/grades/GradesShell";
import { useUser } from "@/components/providers/UserProvider";
import type { GradeBoardData, GradeSettings } from "@/lib/grades";
import { useGradeBoardQuery, useGradeSettingsQuery } from "@/lib/queries/grades";
import {
  buildSessionStorageQuerySeedKey,
  useSessionStorageQuerySeed,
} from "@/lib/hooks/use-session-storage-query-seed";

interface GradesEntryPageProps {
  academicYear: string;
  initialSettings?: GradeSettings | null;
  initialBoardData?: GradeBoardData | null;
}

const GRADES_BOARD_STORAGE_VERSION = 1;

export function GradesEntryPage({
  academicYear,
  initialSettings,
  initialBoardData,
}: GradesEntryPageProps) {
  const { user } = useUser();
  const storageKey = buildSessionStorageQuerySeedKey(
    "grades:board",
    academicYear,
    GRADES_BOARD_STORAGE_VERSION,
  );
  const { seededData, seededUpdatedAt, persistSnapshot } =
    useSessionStorageQuerySeed<GradeBoardData>({
      storageKey,
      initialData: initialBoardData,
      isValidData: (value): value is GradeBoardData =>
        Boolean(
          value &&
            typeof value === "object" &&
            "subjects" in value &&
            Array.isArray((value as GradeBoardData).subjects),
        ),
    });

  const settingsQuery = useGradeSettingsQuery(academicYear, initialSettings);
  const boardQuery = useGradeBoardQuery(academicYear, seededData, {
    initialUpdatedAt: seededUpdatedAt,
  });
  const boardData = boardQuery.data;

  useEffect(() => {
    persistSnapshot(boardQuery.data, boardQuery.updatedAt);
  }, [boardQuery.data, boardQuery.updatedAt, persistSnapshot]);

  const inferredGradeLevel =
    Number.parseInt(user?.grade_level || "", 10) ||
    Number.parseInt(boardData?.subjects[0]?.enrollment.year_level || "10", 10) ||
    10;

  // Error: board query failed with no data to show
  if (boardQuery.error && !boardData) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-brand-primary/60">
          Não foi possível carregar as médias.
        </p>
        <button
          onClick={() => void boardQuery.refetch()}
          className="mt-4 rounded-xl border border-brand-primary/10 px-4 py-2 text-sm text-brand-primary transition-colors hover:border-brand-primary/20"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Determine effective settings from board data or separate settings query
  const effectiveSettings = boardData?.settings ?? settingsQuery.data;

  // Not configured (settings explicitly null, both queries done) → setup wizard
  if (
    effectiveSettings === null &&
    !settingsQuery.isLoading &&
    !boardQuery.isLoading
  ) {
    return (
      <SetupWizard onComplete={() => void boardQuery.refetch()} />
    );
  }

  // Board data not ready yet → show shell (settings-aware if available)
  if (!boardData) {
    return (
      <GradesShell
        settings={effectiveSettings ?? null}
        academicYear={academicYear}
      />
    );
  }

  // Board data ready → full page
  return (
    <GradesPage
      initialData={boardData}
      academicYear={academicYear}
      gradeLevel={inferredGradeLevel}
    />
  );
}
