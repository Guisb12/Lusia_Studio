"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";
import { GradeBoard } from "./GradeBoard";
import { GradeSummaryBar } from "./GradeSummaryBar";
import { SubjectDetailSheet } from "./SubjectDetailSheet";
import { ExamSection } from "./ExamSection";
import { ExamSimulationSheet } from "./ExamSimulationSheet";
import { BasicoExamSection } from "./BasicoExamSection";
import { fetchGradeBoard, invalidateGradesCache, setupPastYear } from "@/lib/grades";
import type { GradeBoardData, BoardSubject, SubjectPeriod, SubjectCFD } from "@/lib/grades";
import type { CourseKey } from "@/lib/grades/curriculum-secundario";
import { SelectListItem } from "@/components/ui/select-card";

interface YearTab {
  yearLevel: string;
  academicYear: string;
  label: string;
}

interface GradesPageProps {
  initialData: GradeBoardData;
  academicYear: string;
  gradeLevel: number;
}

/**
 * Get the academic year string N years before the given one.
 */
function offsetYear(academicYear: string, offset: number): string {
  const start = parseInt(academicYear.split("-")[0], 10) + offset;
  return `${start}-${start + 1}`;
}

export function GradesPage({
  initialData,
  academicYear,
  gradeLevel,
}: GradesPageProps) {
  const isSecundario = gradeLevel >= 10 && gradeLevel <= 12;

  // Available year tabs for Secundário
  const yearTabs: YearTab[] = useMemo(() => {
    if (!isSecundario) return [];
    const tabs: YearTab[] = [];
    for (let yl = 10; yl <= gradeLevel; yl++) {
      const yearsBack = gradeLevel - yl;
      tabs.push({
        yearLevel: String(yl),
        academicYear: offsetYear(academicYear, -yearsBack),
        label: `${yl}º ano`,
      });
    }
    return tabs;
  }, [isSecundario, gradeLevel, academicYear]);

  // Active year — default to current
  const [activeYearIdx, setActiveYearIdx] = useState(
    isSecundario ? yearTabs.length - 1 : 0,
  );
  const activeAcademicYear = isSecundario
    ? yearTabs[activeYearIdx]?.academicYear ?? academicYear
    : academicYear;

  // Board data per year (cache so switching is instant after first load)
  const [boardCache, setBoardCache] = useState<Record<string, GradeBoardData>>({
    [academicYear]: initialData,
  });
  const [loadingYear, setLoadingYear] = useState(false);

  const boardData = boardCache[activeAcademicYear];

  const [selectedPeriod, setSelectedPeriod] = useState<{
    subject: BoardSubject;
    period: SubjectPeriod;
  } | null>(null);

  // Exam simulation sheet state
  const [simulationData, setSimulationData] = useState<{
    cfd: SubjectCFD;
    allCfds: SubjectCFD[];
    cohortYear: number | null;
  } | null>(null);

  // Past year setup (inline subject picker)
  const [setupSubjects, setSetupSubjects] = useState<
    { id: string; name: string; color?: string }[]
  >([]);
  const [setupSelectedIds, setSetupSelectedIds] = useState<string[]>([]);
  const [setupGrades, setSetupGrades] = useState<Record<string, string>>({});
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupFetching, setSetupFetching] = useState(false);

  // Fetch subjects when landing on an empty past year tab
  const activeYearTab = isSecundario ? yearTabs[activeYearIdx] : null;
  const isPastYear =
    activeYearTab !== null && activeYearTab.academicYear !== academicYear;

  useEffect(() => {
    const bd = boardCache[activeAcademicYear];
    if (!bd || bd.settings) return; // board has data or not loaded yet
    if (!isPastYear) return;
    if (setupSubjects.length > 0) return; // already fetched

    setSetupFetching(true);
    // Use the current year's subjects as the default list for inline setup.
    // The wizard (SetupWizard) handles proper curriculum-aware filtering upfront;
    // this inline flow is a fallback for students who already completed setup.
    const currentData = boardCache[academicYear];
    if (currentData?.subjects) {
      const subs = currentData.subjects.map((s) => ({
        id: s.enrollment.subject_id,
        name: s.enrollment.subject_name ?? s.enrollment.subject_id,
        color: s.enrollment.subject_color ?? undefined,
      }));
      setSetupSubjects(subs);
      setSetupSelectedIds(subs.map((s) => s.id));
    }
    setSetupFetching(false);
  }, [boardCache, activeAcademicYear, academicYear, isPastYear, setupSubjects.length]);

  const handleSetupSubmit = async () => {
    if (!activeYearTab) return;
    setSetupLoading(true);
    try {
      const subjects = setupSelectedIds.map((id) => {
        const val = setupGrades[id];
        const grade =
          val && val.trim() !== "" ? parseInt(val, 10) : null;
        return {
          subject_id: id,
          annual_grade: grade !== null && !isNaN(grade) ? grade : null,
        };
      });
      const data = await setupPastYear({
        academic_year: activeYearTab.academicYear,
        year_level: activeYearTab.yearLevel,
        subjects,
      });
      setBoardCache((prev) => ({
        ...prev,
        [activeYearTab.academicYear]: data,
      }));
      // Reset setup state
      setSetupSubjects([]);
      setSetupSelectedIds([]);
      setSetupGrades({});
    } catch {
      // Keep state, allow retry
    } finally {
      setSetupLoading(false);
    }
  };

  const loadYear = useCallback(
    async (year: string) => {
      if (boardCache[year]) return; // Already cached
      setLoadingYear(true);
      try {
        invalidateGradesCache();
        const data = await fetchGradeBoard(year);
        setBoardCache((prev) => ({ ...prev, [year]: data }));
      } catch {
        // Keep current
      } finally {
        setLoadingYear(false);
      }
    },
    [boardCache],
  );

  const refresh = useCallback(async () => {
    invalidateGradesCache();
    try {
      const data = await fetchGradeBoard(activeAcademicYear);
      setBoardCache((prev) => ({ ...prev, [activeAcademicYear]: data }));
    } catch {
      // Keep current data on error
    }
  }, [activeAcademicYear]);

  const handleYearSwitch = async (idx: number) => {
    setActiveYearIdx(idx);
    setSelectedPeriod(null);
    await loadYear(yearTabs[idx].academicYear);
  };

  const handleCardClick = (subject: BoardSubject, period: SubjectPeriod) => {
    setSelectedPeriod({ subject, period });
  };

  const handleDetailClose = () => {
    setSelectedPeriod(null);
    refresh();
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="font-instrument text-3xl text-brand-primary mb-1">
          Médias
        </h1>
        <p className="text-sm text-brand-primary/50">
          Ano letivo {activeAcademicYear}
        </p>
      </div>

      {/* Year toggle for Secundário */}
      {isSecundario && yearTabs.length > 1 && (
        <div className="flex items-center gap-1 mb-5 border-b border-brand-primary/5">
          {yearTabs.map((tab, i) => (
            <button
              key={tab.yearLevel}
              onClick={() => handleYearSwitch(i)}
              className={cn(
                "px-4 py-2.5 text-sm transition-all relative",
                activeYearIdx === i
                  ? "text-brand-primary font-medium"
                  : "text-brand-primary/50 hover:text-brand-primary/70",
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-[10px] text-brand-primary/30">
                {tab.academicYear}
              </span>
              {activeYearIdx === i && (
                <motion.div
                  layoutId="gradesYearTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {loadingYear ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
        </div>
      ) : boardData?.settings ? (
        <>
          <GradeSummaryBar
            subjects={boardData.subjects}
            settings={boardData.settings}
          />

          <GradeBoard
            subjects={boardData.subjects}
            settings={boardData.settings}
            onCardClick={handleCardClick}
          />

          {/* Exam section for Secundário 11º/12º */}
          {isSecundario &&
            activeYearTab &&
            (activeYearTab.yearLevel === "11" || activeYearTab.yearLevel === "12") &&
            boardData.settings.course && (
              <ExamSection
                courseKey={boardData.settings.course as CourseKey}
                yearLevel={activeYearTab.yearLevel}
                boardData={boardData}
                onExamToggle={refresh}
                onOpenSimulation={(cfd, allCfds, cohortYear) =>
                  setSimulationData({ cfd, allCfds, cohortYear })
                }
              />
            )}

          {/* Provas Finais for 9th grade (Básico 3º Ciclo) */}
          {gradeLevel === 9 && (
            <BasicoExamSection
              boardData={boardData}
              onExamUpdate={refresh}
            />
          )}
        </>
      ) : isPastYear ? (
        /* Past year has no data — show inline subject picker */
        <div className="max-w-lg mx-auto py-10">
          <h2 className="font-instrument text-2xl text-brand-primary mb-1">
            {activeYearTab?.label}
          </h2>
          <p className="text-sm text-brand-primary/50 mb-6">
            Seleciona as disciplinas que tiveste neste ano e insere as notas
            finais (opcional).
          </p>

          {setupFetching ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-accent rounded-full animate-spin" />
            </div>
          ) : setupSubjects.length > 0 ? (
            <>
              <div className="space-y-2 max-h-[400px] overflow-y-auto mb-6 pr-1">
                {setupSubjects.map((subject) => {
                  const isSelected = setupSelectedIds.includes(subject.id);
                  return (
                    <div key={subject.id} className="flex items-center gap-2">
                      <div className="flex-1">
                        <SelectListItem
                          label={subject.name}
                          selected={isSelected}
                          onClick={() =>
                            setSetupSelectedIds((prev) =>
                              prev.includes(subject.id)
                                ? prev.filter((s) => s !== subject.id)
                                : [...prev, subject.id],
                            )
                          }
                          color={subject.color}
                        />
                      </div>
                      {isSelected && (
                        <input
                          type="number"
                          min={0}
                          max={20}
                          step={1}
                          value={setupGrades[subject.id] ?? ""}
                          onChange={(e) =>
                            setSetupGrades((prev) => ({
                              ...prev,
                              [subject.id]: e.target.value,
                            }))
                          }
                          placeholder="Nota"
                          className="w-16 flex-shrink-0 rounded-lg border border-brand-primary/10 px-2 py-1.5 text-center text-sm font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleSetupSubmit}
                disabled={setupLoading || setupSelectedIds.length === 0}
                className="w-full rounded-xl bg-brand-accent px-4 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-50"
              >
                {setupLoading ? "A guardar..." : "Guardar e continuar"}
              </button>
            </>
          ) : (
            <div className="text-center py-10 text-sm text-brand-primary/40">
              Sem dados para este ano letivo.
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-20 text-sm text-brand-primary/40">
          Sem dados para este ano letivo.
        </div>
      )}

      {selectedPeriod && boardData?.settings && (
        <SubjectDetailSheet
          subject={selectedPeriod.subject}
          period={selectedPeriod.period}
          settings={boardData.settings}
          onClose={handleDetailClose}
        />
      )}

      <AnimatePresence>
        {simulationData && (
          <ExamSimulationSheet
            cfd={simulationData.cfd}
            allCfds={simulationData.allCfds}
            cohortYear={simulationData.cohortYear}
            onClose={() => setSimulationData(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
