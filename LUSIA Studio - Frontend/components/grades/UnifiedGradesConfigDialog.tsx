"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  setupPastYear,
  createEnrollment,
  updateGradeSettings,
  updateEnrollment,
  type BoardSubject,
} from "@/lib/grades";
import type { MaterialSubject, SubjectCatalog } from "@/lib/materials";
import { useSubjectCatalogQuery } from "@/lib/queries/subjects";
import {
  patchBoardEnrollment,
  patchBoardSettings,
  patchGradeSettingsQueryData,
  prefetchGradeBoardQuery,
  setGradeBoardQueryData,
  snapshotGradesQueries,
  restoreGradesQueries,
  useCFSDashboardQueryWithOptions,
  useGradeBoardQuery,
} from "@/lib/queries/grades";
import { getSubjectIcon } from "@/lib/icons";
import { findExamCapability } from "@/lib/grades/exam-config";
import { getDefaultGradeScale } from "@/lib/grades/calculations";

// ── Shared types & helpers ──────────────────────────────────

export interface YearTab {
  yearLevel: string;
  academicYear: string;
  label: string;
}

export interface ManageSubjectOption {
  id: string;
  name: string;
  slug?: string | null;
  color?: string | null;
  icon?: string | null;
  isExisting: boolean;
  isActive: boolean;
  removalBlockReason: string | null;
}

export interface ManageSubjectSection {
  key: string;
  label: string;
  options: ManageSubjectOption[];
}

export interface PastYearDraft {
  selectedIds: string[];
  grades: Record<string, string>;
}

export function isGradeValid(subject: MaterialSubject, yearLevel: string) {
  if (!subject.grade_levels?.length) {
    return true;
  }
  return subject.grade_levels.includes(yearLevel);
}

export function buildCatalogSections(
  catalog: SubjectCatalog | null | undefined,
  yearLevel: string,
) {
  if (!catalog) {
    return [];
  }

  const sections: { key: string; label: string; subjects: MaterialSubject[] }[] = [];
  const selected = catalog.selected_subjects.filter((subject) =>
    isGradeValid(subject, yearLevel),
  );
  if (selected.length) {
    sections.push({
      key: "selected",
      label: "Selecionadas no perfil",
      subjects: selected,
    });
  }

  const custom = catalog.more_subjects.custom.filter((subject) =>
    isGradeValid(subject, yearLevel),
  );
  if (custom.length) {
    sections.push({
      key: "custom",
      label: "Personalizadas",
      subjects: custom,
    });
  }

  for (const group of catalog.more_subjects.by_education_level) {
    const subjects = group.subjects.filter((subject) =>
      isGradeValid(subject, yearLevel),
    );
    if (!subjects.length) {
      continue;
    }
    sections.push({
      key: group.education_level,
      label: group.education_level_label,
      subjects,
    });
  }

  return sections;
}

export function buildDefaultDraft(
  catalog: SubjectCatalog | null | undefined,
  yearLevel: string,
): PastYearDraft {
  const sections = buildCatalogSections(catalog, yearLevel);
  const validIds = sections.flatMap((section) => section.subjects.map((subject) => subject.id));
  const selectedFromProfile = new Set(catalog?.profile_context.selected_subject_ids ?? []);
  const selectedIds = validIds.filter((id) => selectedFromProfile.has(id));

  return {
    selectedIds,
    grades: {},
  };
}

export function getSyncedYearTabs(
  activeYearLevel: string,
  yearTabs: YearTab[],
) {
  if (activeYearLevel !== "10" && activeYearLevel !== "11") {
    return [];
  }

  return yearTabs.filter(
    (tab) => tab.yearLevel !== activeYearLevel && (tab.yearLevel === "10" || tab.yearLevel === "11"),
  );
}

export function getRemovalBlockReason(
  subject: BoardSubject,
  examRaw?: number | null,
  examWeight?: number | null,
) {
  if (subject.enrollment.is_exam_candidate || examRaw !== null || examWeight !== null) {
    return "Tem dados de exame";
  }
  if (subject.periods.some((period) => period.has_elements ?? ((period.elements?.length ?? 0) > 0))) {
    return "Tem critérios";
  }
  if (subject.periods.some((period) => period.pauta_grade !== null || period.qualitative_grade !== null)) {
    return "Tem notas";
  }
  if (subject.annual_grade?.annual_grade !== null && subject.annual_grade?.annual_grade !== undefined) {
    return "Tem nota anual";
  }
  return null;
}

export function buildManageSubjectSections(
  catalog: SubjectCatalog | null | undefined,
  yearLevel: string,
  subjects: BoardSubject[],
  examMeta: Map<string, { examRaw: number | null; examWeight: number | null }>,
  allowDataRemoval: boolean,
): ManageSubjectSection[] {
  const catalogSections = buildCatalogSections(catalog, yearLevel);
  const catalogSubjectMap = new Map<string, MaterialSubject>();
  for (const section of catalogSections) {
    for (const subject of section.subjects) {
      catalogSubjectMap.set(subject.id, subject);
    }
  }

  const currentSubjects = subjects
    .map((subject) => {
      const catalogSubject = catalogSubjectMap.get(subject.enrollment.subject_id);
      const exam = examMeta.get(subject.enrollment.subject_id);
      return {
        id: subject.enrollment.subject_id,
        name: subject.enrollment.subject_name ?? catalogSubject?.name ?? "Disciplina",
        slug: subject.enrollment.subject_slug ?? catalogSubject?.slug ?? null,
        color: subject.enrollment.subject_color ?? catalogSubject?.color ?? null,
        icon: subject.enrollment.subject_icon ?? catalogSubject?.icon ?? null,
        isExisting: true,
        isActive: subject.enrollment.is_active,
        removalBlockReason: !allowDataRemoval && subject.enrollment.is_active
          ? getRemovalBlockReason(subject, exam?.examRaw ?? null, exam?.examWeight ?? null)
          : null,
      } satisfies ManageSubjectOption;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));

  const currentActive = currentSubjects.filter((subject) => subject.isActive);
  const currentInactive = currentSubjects.filter((subject) => !subject.isActive);
  const existingIds = new Set(currentSubjects.map((subject) => subject.id));

  const sections: ManageSubjectSection[] = [];
  if (currentActive.length) {
    sections.push({
      key: "current",
      label: "Atuais",
      options: currentActive,
    });
  }
  if (currentInactive.length) {
    sections.push({
      key: "inactive",
      label: "Adicionadas antes",
      options: currentInactive,
    });
  }

  for (const section of catalogSections) {
    const options = section.subjects
      .filter((subject) => !existingIds.has(subject.id))
      .map((subject) => ({
        id: subject.id,
        name: subject.name,
        slug: subject.slug,
        color: subject.color ?? null,
        icon: subject.icon ?? null,
        isExisting: false,
        isActive: false,
        removalBlockReason: null,
      }));

    if (!options.length) {
      continue;
    }

    sections.push({
      key: `catalog:${section.key}`,
      label: section.label,
      options,
    });
  }

  return sections;
}

// ── Draft types ─────────────────────────────────────────────

interface TabDraft {
  selectedIds: string[];
  examCandidateIds: string[];
}

type TabState = "current" | "past_configured" | "past_unconfigured";

// ── Component ───────────────────────────────────────────────

interface UnifiedGradesConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  yearTabs: YearTab[];
  gradeLevel: number;
  academicYear: string;
  isSecundario: boolean;
  initialTabIdx?: number;
  onSaved: () => Promise<void>;
}

// ── Subject card item ───────────────────────────────────────

interface SubjectItem {
  id: string;
  name: string;
  slug?: string | null;
  color?: string | null;
  icon?: string | null;
  isExisting: boolean;
  isActive: boolean;
  removalBlockReason: string | null;
}

interface SettingsDraft {
  regime: "trimestral" | "semestral" | null;
  gradeScale: string | null;
}

const REGIME_OPTIONS = [
  { value: "trimestral" as const, label: "3 períodos" },
  { value: "semestral" as const, label: "2 semestres" },
] as const;

const NON_SECUNDARY_SCALE_OPTIONS = [
  { value: "scale_0_100", label: "0 a 100" },
  { value: "scale_0_20", label: "0 a 20" },
] as const;

function isNumericScale(value: string | null | undefined) {
  return value === "scale_0_20" || value === "scale_0_100";
}

function SettingsOptionRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-left transition-colors",
        selected
          ? "border-brand-accent/20"
          : "border-brand-primary/5 hover:bg-brand-primary/[0.02]",
      )}
    >
      <span className="text-sm font-medium text-brand-primary">{label}</span>
      {selected ? (
        <div className="h-5 w-5 rounded-md bg-brand-accent flex items-center justify-center">
          <Check className="h-3 w-3 text-white" />
        </div>
      ) : (
        <div className="h-5 w-5 rounded-md border-2 border-brand-primary/15" />
      )}
    </button>
  );
}

function SubjectRow({
  subject,
  isSelected,
  yearLevel,
  examCandidateIds,
  onToggle,
  onExamToggle,
}: {
  subject: SubjectItem;
  isSelected: boolean;
  yearLevel: string;
  examCandidateIds: string[];
  onToggle: () => void;
  onExamToggle: (subjectId: string) => void;
}) {
  const Icon = getSubjectIcon(subject.icon);
  const color = subject.color || "#94a3b8";
  const examCapability = isSelected
    ? findExamCapability({ yearLevel, subjectSlug: subject.slug })
    : null;

  return (
    <div
      className={cn(
        "w-full rounded-xl border bg-white overflow-hidden transition-all duration-200",
        isSelected ? "border-brand-accent/20" : "border-brand-primary/5",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left hover:bg-brand-primary/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${color}12` }}
          >
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-brand-primary truncate">
              {subject.name}
            </div>
            {isSelected && examCapability && (
              <div
                className="flex items-center gap-1.5 mt-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Switch
                  checked={
                    examCapability.mandatory ||
                    examCandidateIds.includes(subject.id)
                  }
                  onCheckedChange={() =>
                    !examCapability.mandatory && onExamToggle(subject.id)
                  }
                  className="h-3.5 w-6 data-[state=checked]:bg-brand-accent [&>span]:h-2.5 [&>span]:w-2.5 [&>span]:data-[state=checked]:translate-x-2.5"
                />
                <span className="text-[10px] text-brand-primary/35">
                  Exame nacional
                </span>
                {examCapability.mandatory && (
                  <span className="text-[10px] font-semibold text-brand-accent">
                    Obrigatório
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {subject.isExisting &&
              subject.isActive &&
              !isSelected &&
              subject.removalBlockReason && (
                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  {subject.removalBlockReason}
                </span>
              )}
            {isSelected ? (
              <div className="h-5 w-5 rounded-md bg-brand-accent flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </div>
            ) : (
              <div className="h-5 w-5 rounded-md border-2 border-brand-primary/15" />
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

// ── Main dialog ─────────────────────────────────────────────

export function UnifiedGradesConfigDialog({
  open,
  onOpenChange,
  yearTabs,
  gradeLevel,
  academicYear,
  isSecundario,
  initialTabIdx,
  onSaved,
}: UnifiedGradesConfigDialogProps) {
  const subjectCatalogQuery = useSubjectCatalogQuery();
  const cfsQuery = useCFSDashboardQueryWithOptions(undefined, {
    enabled: isSecundario,
  });

  const effectiveTabs = useMemo(() => {
    if (isSecundario && yearTabs.length > 0) return yearTabs;
    return [
      {
        yearLevel: String(gradeLevel),
        academicYear,
        label: `${gradeLevel}º ano`,
      },
    ];
  }, [academicYear, gradeLevel, isSecundario, yearTabs]);

  const [activeTabIdx, setActiveTabIdx] = useState(
    initialTabIdx ?? effectiveTabs.length - 1,
  );
  const [drafts, setDrafts] = useState<Record<string, TabDraft>>({});
  const [settingsDrafts, setSettingsDrafts] = useState<Record<string, SettingsDraft>>({});
  const [saving, setSaving] = useState(false);
  const [showMoreCatalog, setShowMoreCatalog] = useState(false);
  const [confirmSettingsResetOpen, setConfirmSettingsResetOpen] = useState(false);

  const activeTab = effectiveTabs[activeTabIdx] ?? effectiveTabs[effectiveTabs.length - 1];

  const boardQuery = useGradeBoardQuery(activeTab.academicYear);
  const boardData = boardQuery.data;
  const activeSettingsDraft: SettingsDraft | null = useMemo(() => {
    if (!boardData?.settings) {
      return null;
    }
    const existing = settingsDrafts[activeTab.academicYear];
    if (existing) {
      return existing;
    }
    return {
      regime: boardData.settings.regime,
      gradeScale:
        boardData.settings.grade_scale ??
        getDefaultGradeScale(boardData.settings.education_level),
    };
  }, [activeTab.academicYear, boardData?.settings, settingsDrafts]);

  const tabState: TabState = useMemo(() => {
    if (activeTab.academicYear === academicYear) return "current";
    if (boardData?.settings) return "past_configured";
    return "past_unconfigured";
  }, [activeTab.academicYear, academicYear, boardData?.settings]);

  const examMetaBySubjectId = useMemo(
    () =>
      new Map(
        (cfsQuery.data?.cfds ?? []).map((cfd) => [
          cfd.subject_id,
          {
            examRaw: cfd.exam_grade_raw ?? null,
            examWeight: cfd.exam_weight ?? null,
          },
        ]),
      ),
    [cfsQuery.data],
  );

  // Build a flat catalog subject map for lookups
  const catalogSubjectMap = useMemo(() => {
    const map = new Map<string, MaterialSubject>();
    if (!subjectCatalogQuery.data) return map;
    for (const s of subjectCatalogQuery.data.selected_subjects) map.set(s.id, s);
    for (const s of subjectCatalogQuery.data.more_subjects.custom) map.set(s.id, s);
    for (const g of subjectCatalogQuery.data.more_subjects.by_education_level) {
      for (const s of g.subjects) map.set(s.id, s);
    }
    return map;
  }, [subjectCatalogQuery.data]);

  // ── Build the render model ──────────────────────────────────
  //
  // We build two lists:
  //   1. "selectedSubjects" — currently active/selected subjects (the main list)
  //   2. "catalogSections" — subjects from catalog not yet selected (the "add more" area)
  //
  // For past_unconfigured years we don't have board data, so everything
  // comes from the catalog, split into "profile selected" (pre-checked)
  // and the rest.

  const activeDraft: TabDraft = useMemo(() => {
    const existing = drafts[activeTab.academicYear];
    if (existing) return existing;

    if (tabState === "past_unconfigured") {
      const defaultDraft = buildDefaultDraft(subjectCatalogQuery.data, activeTab.yearLevel);
      return {
        selectedIds: defaultDraft.selectedIds,
        examCandidateIds: [],
      };
    }

    const activeSubjects = (boardData?.subjects ?? []).filter(
      (s) => s.enrollment.is_active,
    );
    return {
      selectedIds: activeSubjects.map((s) => s.enrollment.subject_id),
      examCandidateIds: activeSubjects
        .filter((s) => s.enrollment.is_exam_candidate)
        .map((s) => s.enrollment.subject_id),
    };
  }, [activeTab.academicYear, boardData?.subjects, drafts, subjectCatalogQuery.data, activeTab.yearLevel, tabState]);

  const selectedSet = useMemo(() => new Set(activeDraft.selectedIds), [activeDraft.selectedIds]);

  // Selected subjects list (enriched with icon/color/slug)
  const selectedSubjects = useMemo((): SubjectItem[] => {
    const items: SubjectItem[] = [];
    for (const id of activeDraft.selectedIds) {
      const boardSubject = boardData?.subjects.find(
        (s) => s.enrollment.subject_id === id,
      );
      const cat = catalogSubjectMap.get(id);
      if (boardSubject) {
        const exam = examMetaBySubjectId.get(id);
        items.push({
          id,
          name: boardSubject.enrollment.subject_name ?? cat?.name ?? "Disciplina",
          slug: boardSubject.enrollment.subject_slug ?? cat?.slug ?? null,
          color: boardSubject.enrollment.subject_color ?? cat?.color ?? null,
          icon: boardSubject.enrollment.subject_icon ?? cat?.icon ?? null,
          isExisting: true,
          isActive: boardSubject.enrollment.is_active,
          removalBlockReason:
            boardSubject.enrollment.is_active && !boardData?.settings?.is_locked
              ? getRemovalBlockReason(boardSubject, exam?.examRaw ?? null, exam?.examWeight ?? null)
              : null,
        });
      } else if (cat) {
        items.push({
          id,
          name: cat.name,
          slug: cat.slug,
          color: cat.color,
          icon: cat.icon,
          isExisting: false,
          isActive: false,
          removalBlockReason: null,
        });
      }
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }, [activeDraft.selectedIds, boardData, catalogSubjectMap, examMetaBySubjectId]);

  // Catalog sections for "add more" — subjects NOT already selected
  const addMoreSections = useMemo(() => {
    const catalogSections = buildCatalogSections(subjectCatalogQuery.data, activeTab.yearLevel);

    // For managed years with board data, also include inactive enrollments
    const inactiveFromBoard: SubjectItem[] = [];
    if (boardData?.subjects) {
      for (const s of boardData.subjects) {
        if (!s.enrollment.is_active && !selectedSet.has(s.enrollment.subject_id)) {
          const cat = catalogSubjectMap.get(s.enrollment.subject_id);
          inactiveFromBoard.push({
            id: s.enrollment.subject_id,
            name: s.enrollment.subject_name ?? cat?.name ?? "Disciplina",
            slug: s.enrollment.subject_slug ?? cat?.slug ?? null,
            color: s.enrollment.subject_color ?? cat?.color ?? null,
            icon: s.enrollment.subject_icon ?? cat?.icon ?? null,
            isExisting: true,
            isActive: false,
            removalBlockReason: null,
          });
        }
      }
    }

    const sections: { key: string; label: string; items: SubjectItem[] }[] = [];

    if (inactiveFromBoard.length) {
      sections.push({
        key: "inactive",
        label: "Adicionadas antes",
        items: inactiveFromBoard.sort((a, b) => a.name.localeCompare(b.name, "pt")),
      });
    }

    const inactiveIds = new Set(inactiveFromBoard.map((s) => s.id));

    for (const section of catalogSections) {
      const items: SubjectItem[] = section.subjects
        .filter((s) => !selectedSet.has(s.id) && !inactiveIds.has(s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          color: s.color,
          icon: s.icon,
          isExisting: false,
          isActive: false,
          removalBlockReason: null,
        }));
      if (items.length) {
        sections.push({ key: section.key, label: section.label, items });
      }
    }

    return sections;
  }, [activeTab.yearLevel, boardData?.subjects, catalogSubjectMap, selectedSet, subjectCatalogQuery.data]);

  const totalAddMore = addMoreSections.reduce((n, s) => n + s.items.length, 0);

  // ── Change detection ────────────────────────────────────────

  const hasChanges = useMemo(() => {
    if (
      activeTab.academicYear === academicYear &&
      boardData?.settings &&
      activeSettingsDraft &&
      (
        activeSettingsDraft.regime !== boardData.settings.regime ||
        activeSettingsDraft.gradeScale !== (
          boardData.settings.grade_scale ??
          getDefaultGradeScale(boardData.settings.education_level)
        )
      )
    ) {
      return true;
    }

    if (tabState === "past_unconfigured") {
      return activeDraft.selectedIds.length > 0;
    }

    const activeSubjects = (boardData?.subjects ?? []).filter(
      (s) => s.enrollment.is_active,
    );
    const originalIds = new Set(activeSubjects.map((s) => s.enrollment.subject_id));
    const draftIds = new Set(activeDraft.selectedIds);

    if (originalIds.size !== draftIds.size) return true;
    for (const id of originalIds) {
      if (!draftIds.has(id)) return true;
    }

    const originalExamIds = new Set(
      activeSubjects.filter((s) => s.enrollment.is_exam_candidate).map((s) => s.enrollment.subject_id),
    );
    const draftExamIds = new Set(activeDraft.examCandidateIds);
    if (originalExamIds.size !== draftExamIds.size) return true;
    for (const id of originalExamIds) {
      if (!draftExamIds.has(id)) return true;
    }

    return false;
  }, [academicYear, activeDraft, activeSettingsDraft, activeTab.academicYear, boardData?.settings, boardData?.subjects, tabState]);

  // ── Effects ─────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      setDrafts({});
      setSettingsDrafts({});
      setShowMoreCatalog(false);
      return;
    }
    if (initialTabIdx !== undefined) {
      setActiveTabIdx(initialTabIdx);
    }
  }, [open, initialTabIdx]);

  // Reset showMoreCatalog when switching tabs
  useEffect(() => {
    setShowMoreCatalog(false);
  }, [activeTabIdx]);

  // ── Handlers ────────────────────────────────────────────────

  const updateDraft = (ay: string, updater: (draft: TabDraft) => TabDraft) => {
    setDrafts((prev) => ({
      ...prev,
      [ay]: updater(prev[ay] ?? activeDraft),
    }));
  };

  const handleToggle = (subjectId: string) => {
    const shouldSelect = !activeDraft.selectedIds.includes(subjectId);

    const syncedTabs = getSyncedYearTabs(activeTab.yearLevel, effectiveTabs);
    const targets = [activeTab, ...syncedTabs];

    setDrafts((prev) => {
      const next = { ...prev };
      for (const target of targets) {
        const existing = next[target.academicYear] ?? activeDraft;
        next[target.academicYear] = {
          ...existing,
          selectedIds: shouldSelect
            ? [...existing.selectedIds, subjectId]
            : existing.selectedIds.filter((id) => id !== subjectId),
          examCandidateIds: shouldSelect
            ? existing.examCandidateIds
            : existing.examCandidateIds.filter((id) => id !== subjectId),
        };
      }
      return next;
    });
  };

  const handleExamToggle = (subjectId: string) => {
    updateDraft(activeTab.academicYear, (draft) => ({
      ...draft,
      examCandidateIds: draft.examCandidateIds.includes(subjectId)
        ? draft.examCandidateIds.filter((id) => id !== subjectId)
        : [...draft.examCandidateIds, subjectId],
    }));
  };

  const updateSettingsDraft = (academicYearKey: string, updater: (draft: SettingsDraft) => SettingsDraft) => {
    const currentSettings = boardData?.settings;
    if (!currentSettings) {
      return;
    }
    setSettingsDrafts((prev) => {
      const base =
        prev[academicYearKey] ?? {
          regime: currentSettings.regime,
          gradeScale:
            currentSettings.grade_scale ??
            getDefaultGradeScale(currentSettings.education_level),
        };
      return {
        ...prev,
        [academicYearKey]: updater(base),
      };
    });
  };

  const settingsResetRequired = Boolean(
    activeTab.academicYear === academicYear &&
    boardData?.settings &&
    activeSettingsDraft &&
    (() => {
      const currentScale =
        boardData.settings.grade_scale ??
        getDefaultGradeScale(boardData.settings.education_level);
      const regimeChanged = activeSettingsDraft.regime !== boardData.settings.regime;
      const scaleChanged = activeSettingsDraft.gradeScale !== currentScale;
      const scaleConvertible =
        scaleChanged &&
        isNumericScale(currentScale) &&
        isNumericScale(activeSettingsDraft.gradeScale);
      return regimeChanged || (scaleChanged && !scaleConvertible);
    })(),
  );

  const handleSave = async (confirmReset = false) => {
    setSaving(true);
    const snapshots = snapshotGradesQueries((key) =>
      key.startsWith("grades:board:") || key === "grades:cfs",
    );
    try {
      if (settingsResetRequired && !confirmReset) {
        setConfirmSettingsResetOpen(true);
        setSaving(false);
        return;
      }

      const tabsToSave = effectiveTabs.filter((tab) => {
        const draft = drafts[tab.academicYear];
        if (!draft) {
          return (
            tab.academicYear === activeTab.academicYear &&
            (
              hasChanges ||
              Boolean(settingsDrafts[tab.academicYear])
            )
          );
        }
        return true;
      });

      for (const tab of tabsToSave) {
        const draft = drafts[tab.academicYear] ?? activeDraft;
        const tabBoard = tab.academicYear === activeTab.academicYear
          ? boardData
          : await prefetchGradeBoardQuery(tab.academicYear, true);

        if (!tabBoard?.settings) {
          // Past year without settings
          if (!draft.selectedIds.length) continue;
          const data = await setupPastYear({
            academic_year: tab.academicYear,
            year_level: tab.yearLevel,
            subjects: draft.selectedIds.map((subjectId) => ({
              subject_id: subjectId,
              annual_grade: null,
            })),
          });
          setGradeBoardQueryData(tab.academicYear, data);

          // Set exam candidates for the newly created enrollments
          const newBoard = data;
          for (const subjectId of draft.examCandidateIds) {
            const enrollment = newBoard.subjects.find(
              (s) => s.enrollment.subject_id === subjectId,
            );
            if (enrollment && !enrollment.enrollment.is_exam_candidate) {
              await updateEnrollment(enrollment.enrollment.id, {
                is_exam_candidate: true,
              });
            }
          }
          await prefetchGradeBoardQuery(tab.academicYear, true);
          continue;
        }

        const settingsDraft = settingsDrafts[tab.academicYear];
        if (
          tab.academicYear === academicYear &&
          settingsDraft &&
          (
            settingsDraft.regime !== tabBoard.settings.regime ||
            settingsDraft.gradeScale !== (
              tabBoard.settings.grade_scale ??
              getDefaultGradeScale(tabBoard.settings.education_level)
            )
          )
        ) {
          const periodWeights =
            settingsDraft.regime === "semestral"
              ? [50, 50]
              : [33.33, 33.33, 33.34];
          const optimisticSettings = {
            ...tabBoard.settings,
            regime: settingsDraft.regime,
            grade_scale: settingsDraft.gradeScale,
            period_weights: periodWeights,
          };
          patchGradeSettingsQueryData(tab.academicYear, optimisticSettings);
          patchBoardSettings(tab.academicYear, optimisticSettings);
          const savedSettings = await updateGradeSettings(tabBoard.settings.id, {
            regime: settingsDraft.regime,
            grade_scale: settingsDraft.gradeScale,
            period_weights: periodWeights,
            confirm_reset: confirmReset,
          });
          patchGradeSettingsQueryData(tab.academicYear, savedSettings);
          patchBoardSettings(tab.academicYear, savedSettings);
          await prefetchGradeBoardQuery(tab.academicYear, true);
        }

        // Existing settings
        const selectedIdSet = new Set(draft.selectedIds);
        const examSelectedSet = new Set(draft.examCandidateIds);
        const activeSubjects = tabBoard.subjects.filter((s) => s.enrollment.is_active);
        const activeIds = new Set(activeSubjects.map((s) => s.enrollment.subject_id));
        const existingMap = new Map(
          tabBoard.subjects.map((s) => [s.enrollment.subject_id, s]),
        );

        const allowHistoricalRemoval = Boolean(tabBoard.settings.is_locked);

        if (!allowHistoricalRemoval && !settingsResetRequired) {
          const blockedRemovals = activeSubjects.filter((subject) => {
            if (selectedIdSet.has(subject.enrollment.subject_id)) return false;
            const exam = examMetaBySubjectId.get(subject.enrollment.subject_id);
            return Boolean(
              getRemovalBlockReason(subject, exam?.examRaw ?? null, exam?.examWeight ?? null),
            );
          });
          if (blockedRemovals.length) {
            toast.error(
              `Remove primeiro os dados de ${blockedRemovals
                .map((s) => s.enrollment.subject_name)
                .join(", ")}.`,
            );
            setSaving(false);
            return;
          }
        }

        const additions = draft.selectedIds.filter((id) => !activeIds.has(id));
        const removals = activeSubjects.filter(
          (s) => !selectedIdSet.has(s.enrollment.subject_id),
        );

        additions.forEach((subjectId) => {
          const existing = existingMap.get(subjectId);
          if (!existing) {
            return;
          }
          patchBoardEnrollment(existing.enrollment.id, (enrollment) => ({
            ...enrollment,
            is_active: true,
            is_exam_candidate: examSelectedSet.has(subjectId),
          }));
        });

        activeSubjects
          .filter((subject) => selectedIdSet.has(subject.enrollment.subject_id))
          .forEach((subject) => {
            const capability = findExamCapability({
              yearLevel: subject.enrollment.year_level,
              subjectSlug: subject.enrollment.subject_slug,
            });
            if (!capability || capability.mandatory) {
              return;
            }
            patchBoardEnrollment(subject.enrollment.id, (enrollment) => ({
              ...enrollment,
              is_exam_candidate: examSelectedSet.has(subject.enrollment.subject_id),
            }));
          });

        removals.forEach((subject) => {
          patchBoardEnrollment(subject.enrollment.id, (enrollment) => ({
            ...enrollment,
            is_active: false,
          }));
        });

        await Promise.all(
          additions.map(async (subjectId) => {
            const existing = existingMap.get(subjectId);
            if (existing) {
              await updateEnrollment(existing.enrollment.id, {
                is_active: true,
                is_exam_candidate: examSelectedSet.has(subjectId),
              });
              return;
            }
            await createEnrollment({
              subject_id: subjectId,
              academic_year: tab.academicYear,
              year_level: tab.yearLevel,
              is_exam_candidate: examSelectedSet.has(subjectId),
            });
          }),
        );

        await Promise.all(
          activeSubjects
            .filter((subject) => selectedIdSet.has(subject.enrollment.subject_id))
            .filter((subject) => {
              const capability = findExamCapability({
                yearLevel: subject.enrollment.year_level,
                subjectSlug: subject.enrollment.subject_slug,
              });
              if (!capability || capability.mandatory) return false;
              return subject.enrollment.is_exam_candidate !== examSelectedSet.has(subject.enrollment.subject_id);
            })
            .map((subject) =>
              updateEnrollment(subject.enrollment.id, {
                is_exam_candidate: examSelectedSet.has(subject.enrollment.subject_id),
              }),
            ),
        );

        await Promise.all(
          removals.map((subject) =>
            updateEnrollment(subject.enrollment.id, { is_active: false }),
          ),
        );

        await prefetchGradeBoardQuery(tab.academicYear, true);
      }

      await onSaved();
      onOpenChange(false);
      toast.success("Configuração atualizada.");
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível guardar as alterações.",
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  const isDialogLoading = boardQuery.isLoading && !boardData;
  const isCatalogLoading = subjectCatalogQuery.isLoading && !subjectCatalogQuery.data;

  const description = tabState === "past_unconfigured"
    ? "Escolhe as disciplinas que tiveste neste ano. Entram no cálculo da tua média do secundário."
    : isSecundario
      ? "Gere as disciplinas e exames deste ano. Alterações afetam o cálculo da tua média."
      : "Gere as disciplinas deste ano letivo.";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden border-brand-primary/10 p-0">
        <DialogHeader className="border-b border-brand-primary/5 px-6 pb-4 pt-6">
          <DialogTitle className="font-instrument text-2xl text-brand-primary">
            Configurar disciplinas
          </DialogTitle>
          <DialogDescription className="text-sm text-brand-primary/55">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Year tabs */}
        {isSecundario && effectiveTabs.length > 1 && (
          <div className="flex items-center gap-1 border-b border-brand-primary/5 px-6">
            {effectiveTabs.map((tab, idx) => (
              <button
                key={tab.yearLevel}
                type="button"
                onClick={() => setActiveTabIdx(idx)}
                onMouseEnter={() => void prefetchGradeBoardQuery(tab.academicYear)}
                onFocus={() => void prefetchGradeBoardQuery(tab.academicYear)}
                className={cn(
                  "relative px-4 py-2.5 text-sm font-medium transition-colors",
                  activeTabIdx === idx
                    ? "text-brand-primary"
                    : "text-brand-primary/40 hover:text-brand-primary/60",
                )}
              >
                {tab.label}
                {activeTabIdx === idx && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-brand-primary" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          {isDialogLoading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-accent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {activeTab.academicYear === academicYear && boardData?.settings && !boardData.settings.is_locked && activeSettingsDraft && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-primary/35">
                      Regime
                    </div>
                    <div className="space-y-2">
                      {REGIME_OPTIONS.map((option) => (
                        <SettingsOptionRow
                          key={option.value}
                          label={option.label}
                          selected={activeSettingsDraft.regime === option.value}
                          onClick={() =>
                            updateSettingsDraft(activeTab.academicYear, (draft) => ({
                              ...draft,
                              regime: option.value,
                            }))
                          }
                        />
                      ))}
                    </div>
                    {settingsResetRequired && boardData.settings.education_level === "secundario" && (
                      <p className="mt-2 px-1 text-xs text-brand-primary/45">
                        Mudar o regime apaga as notas, critérios, médias anuais e exames deste ano.
                      </p>
                    )}
                  </div>

                  {boardData.settings && boardData.settings.education_level !== "secundario" && (
                    <div>
                      <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-primary/35">
                        Escala
                      </div>
                      <div className="space-y-2">
                        {NON_SECUNDARY_SCALE_OPTIONS.map((option) => (
                            <SettingsOptionRow
                              key={option.value}
                              label={option.label}
                              selected={activeSettingsDraft.gradeScale === option.value}
                              onClick={() =>
                                updateSettingsDraft(activeTab.academicYear, (draft) => ({
                                  ...draft,
                                  gradeScale: option.value,
                                }))
                              }
                            />
                          ))}
                      </div>
                      {settingsResetRequired && (
                        <p className="mt-2 px-1 text-xs text-brand-primary/45">
                          Mudar a escala ou o regime apaga as notas, critérios, médias anuais e exames deste ano.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Selected subjects ───────────────────── */}
              {selectedSubjects.length > 0 && (
                <div>
                  <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-primary/35">
                    Disciplinas selecionadas
                  </div>
                  <div className="space-y-2">
                    {selectedSubjects.map((subject) => (
                      <SubjectRow
                        key={subject.id}
                        subject={subject}
                        isSelected
                        yearLevel={activeTab.yearLevel}
                        examCandidateIds={activeDraft.examCandidateIds}
                        onToggle={() => handleToggle(subject.id)}
                        onExamToggle={handleExamToggle}
                      />
                    ))}
                  </div>
                </div>
              )}

              {selectedSubjects.length === 0 && totalAddMore === 0 && !isCatalogLoading && (
                <div className="rounded-2xl border border-brand-primary/5 bg-brand-primary/[0.02] px-6 py-10 text-center text-sm text-brand-primary/40">
                  Não há disciplinas disponíveis para este ano no teu catálogo.
                </div>
              )}

              {/* ── Add more subjects ──────────────────── */}
              {totalAddMore > 0 && (
                <div>
                  {!showMoreCatalog ? (
                    <button
                      type="button"
                      onClick={() => setShowMoreCatalog(true)}
                      className="flex items-center gap-2 rounded-xl border border-dashed border-brand-primary/15 bg-brand-primary/[0.02] px-4 py-3 text-sm font-medium text-brand-primary/50 transition-colors hover:border-brand-primary/25 hover:text-brand-primary/70 w-full"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar disciplinas ({totalAddMore} disponíveis)
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <div className="px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-primary/35">
                          Adicionar disciplinas
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowMoreCatalog(false)}
                          className="text-[11px] font-medium text-brand-primary/40 hover:text-brand-primary/60 transition-colors"
                        >
                          Fechar
                        </button>
                      </div>
                      <p className="mb-3 px-1 text-xs text-brand-primary/40">
                        Disciplinas que adicionares entram no cálculo da tua média.
                      </p>
                      <div className="space-y-4">
                        {addMoreSections.map((section) => (
                          <div key={section.key}>
                            <div className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-brand-primary/25">
                              {section.label}
                            </div>
                            <div className="space-y-2">
                              {section.items.map((subject) => (
                                <SubjectRow
                                  key={subject.id}
                                  subject={subject}
                                  isSelected={false}
                                  yearLevel={activeTab.yearLevel}
                                  examCandidateIds={activeDraft.examCandidateIds}
                                  onToggle={() => handleToggle(subject.id)}
                                  onExamToggle={handleExamToggle}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {isCatalogLoading && (
                <div className="rounded-2xl border border-brand-primary/5 bg-brand-primary/[0.02] px-4 py-3 text-sm text-brand-primary/45">
                  A carregar o catálogo de disciplinas...
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-brand-primary/5 px-6 py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-xl border border-brand-primary/10 px-4 py-2 text-sm font-medium text-brand-primary transition-colors hover:border-brand-primary/20 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !hasChanges}
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          >
            {saving ? "A guardar..." : "Guardar"}
          </button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={confirmSettingsResetOpen}
        onOpenChange={setConfirmSettingsResetOpen}
      >
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-instrument text-brand-primary">
              Confirmar alteração
            </AlertDialogTitle>
            <AlertDialogDescription className="text-brand-primary/60">
              Ao mudar o regime ou a escala, as notas, critérios, domínios, médias anuais e exames deste ano vão ser apagados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setConfirmSettingsResetOpen(false);
                void handleSave(true);
              }}
              disabled={saving}
              className="bg-brand-error text-white hover:bg-brand-error/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
