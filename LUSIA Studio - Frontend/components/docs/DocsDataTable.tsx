"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  Row,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleX,
  ClipboardList,
  Ellipsis,
  Filter,
  FolderOpen,
  ListFilter,
  Loader2,
  Pencil,
  RotateCcw,
  Trash,
} from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Pdf01Icon } from "@hugeicons/core-free-icons";
import { Note01Icon } from "@hugeicons/core-free-icons";
import { Quiz02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Artifact, ARTIFACT_TYPES, ArtifactUpdate, updateArtifact } from "@/lib/artifacts";
import type { ProcessingItem } from "@/lib/hooks/use-processing-documents";
import { ProcessingStepPill } from "@/components/docs/ProcessingStepPill";
import { getSubjectIcon } from "@/lib/icons";
import { CurriculumNode, fetchCurriculumNodes, fetchCurriculumTitlesBatch, fetchNoteByCode, MaterialSubject, SubjectCatalog } from "@/lib/materials";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import { useUser } from "@/components/providers/UserProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Rename context (avoids putting renamingId in columns memo deps) ─────────
const RenameContext = React.createContext<{
  renamingId: string | null;
  clearRenaming: () => void;
}>({ renamingId: null, clearRenaming: () => {} });

// ─── helpers ─────────────────────────────────────────────────────────────────

function ArtifactIcon({ artifact }: { artifact: Artifact }) {
  if (artifact.artifact_type === "note") {
    return <HugeiconsIcon icon={Note01Icon} size={22} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
  }
  if (artifact.artifact_type === "quiz") {
    return <HugeiconsIcon icon={Quiz02Icon} size={22} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
  }
  if (artifact.artifact_type === "uploaded_file") {
    const ext = artifact.storage_path?.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "pdf") {
      return <HugeiconsIcon icon={Pdf01Icon} size={22} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    }
    if (ext === "doc" || ext === "docx") {
      return <HugeiconsIcon icon={Note01Icon} size={22} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    }
  }
  // Fallback: emoji from artifact type catalog
  const emoji =
    artifact.icon ??
    ARTIFACT_TYPES.find((t) => t.value === artifact.artifact_type)?.icon ??
    "📄";
  return <span className="text-base">{emoji}</span>;
}

/** Small inline icon for a given artifact type value (used in filters) */
function ArtifactTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "quiz":
      return <HugeiconsIcon icon={Quiz02Icon} size={14} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    case "note":
      return <HugeiconsIcon icon={Note01Icon} size={14} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    case "uploaded_file":
      return <HugeiconsIcon icon={Pdf01Icon} size={14} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    case "exercise_sheet":
      return <span className="text-xs">✏️</span>;
    default:
      return <span className="text-xs">📄</span>;
  }
}

// ─── CurriculumPill ───────────────────────────────────────────────────────────

/** Pure display pill — shows whatever label is given. */
function CurriculumPill({ label, faded }: { label: string; faded?: boolean }) {
  const c = "#0d2f7f";
  return (
    <span
      style={{
        color: c,
        backgroundColor: c + "12",
        border: `1.5px solid ${c}`,
        borderBottomWidth: "3px",
        opacity: faded ? 0.4 : 1,
      }}
      className="inline-flex min-w-0 max-w-[180px] items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none transition-all duration-100 ease-out"
    >
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

/** Module-level persistent cache for curriculum code → title.
 *  Survives across navigations so we never re-fetch titles we already resolved. */
const _curriculumTitleCache = new Map<string, string>();
const _curriculumFetching = new Set<string>();

/** Lazily resolves a curriculum code → title via persistent cache + API, then renders CurriculumPill. */
function CurriculumTag({
  code,
  titleCache,
  faded,
}: {
  code: string;
  titleCache?: React.MutableRefObject<Map<string, string>>;
  faded?: boolean;
}) {
  const [title, setTitle] = useState<string | null>(
    () => _curriculumTitleCache.get(code) ?? titleCache?.current.get(code) ?? null,
  );

  useEffect(() => {
    // Already resolved in persistent cache
    const cached = _curriculumTitleCache.get(code) ?? titleCache?.current.get(code);
    if (cached) { setTitle(cached); return; }

    // Another instance is already fetching this code
    if (_curriculumFetching.has(code)) return;

    _curriculumFetching.add(code);
    let cancelled = false;

    fetchNoteByCode(code)
      .then((r) => {
        _curriculumTitleCache.set(code, r.curriculum.title);
        titleCache?.current.set(code, r.curriculum.title);
        if (!cancelled) setTitle(r.curriculum.title);
      })
      .catch(() => {
        _curriculumTitleCache.set(code, code);
        titleCache?.current.set(code, code);
        if (!cancelled) setTitle(code);
      })
      .finally(() => {
        _curriculumFetching.delete(code);
      });

    return () => { cancelled = true; };
  }, [code, titleCache]);

  return <CurriculumPill label={title ?? code} faded={faded} />;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("pt-PT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── column responsive breakpoints ───────────────────────────────────────────

const COLUMN_BREAKPOINTS: Record<string, number> = {
  subjects:         480,
  year_level:       560,
  creators:         680,
  updated_at:       800,
  curriculum_codes: 940,
};

// ─── filter functions ─────────────────────────────────────────────────────────

const nameFilterFn: FilterFn<Artifact> = (row, _columnId, filterValue) => {
  const searchableContent =
    `${row.original.artifact_name} ${row.original.subjects?.map((s) => s.name).join(" ")}`.toLowerCase();
  return searchableContent.includes((filterValue ?? "").toLowerCase());
};


const subjectFilterFn: FilterFn<Artifact> = (row, _columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  const ids = row.original.subject_ids ?? [];
  return filterValue.some((id) => ids.includes(id));
};

const curriculumFilterFn: FilterFn<Artifact> = (row, _columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  const codes = row.original.curriculum_codes ?? [];
  return filterValue.some((c) => codes.includes(c));
};

// ─── props ───────────────────────────────────────────────────────────────────

interface DocsDataTableProps {
  artifacts: Artifact[];
  loading: boolean;
  onDelete: (id: string) => void;
  onOpenQuiz: (id: string) => void;
  /** Called to open the artifact viewer for note/uploaded_file types */
  onOpenArtifact?: (id: string) => void;
  /** Rendered on the right of the toolbar row (right-aligned, single row) */
  toolbarRight?: React.ReactNode;
  /** Subject catalog (passed from DocsPage) for the subject picker dialog */
  catalog: SubjectCatalog | null;
  /** Called after a successful artifact update */
  onArtifactUpdated?: (updated: Artifact) => void;
  /** Currently active subject folder (drives border color + pill) */
  activeSubject?: MaterialSubject | null;
  /** Called when user clears the active subject from the toolbar pill */
  onClearActiveSubject?: () => void;
  /** Documents currently being processed (shown as rows at top of table) */
  processingItems?: ProcessingItem[];
  /** IDs of artifacts that just finished processing (for completion animation) */
  completedIds?: Set<string>;
  /** IDs of artifacts processed during this session (show "Novo" badge) */
  newIds?: Set<string>;
  /** Set of artifact IDs currently retrying */
  retryingIds?: Set<string>;
  /** Called when user clicks retry on a failed processing item */
  onRetry?: (id: string) => void;
  /** Called when completion animation finishes for an artifact */
  onCompletedAnimationEnd?: (id: string) => void;
  /** Called to open "Enviar TPC" flow with a pre-selected artifact */
  onSendTPC?: (artifactId: string) => void;
  /** Called to open "Criar com Lusia" flow with a pre-selected source artifact */
  onCreateWithLusia?: (artifactId: string) => void;
  /** Artifact ID of the currently active/previewed row (highlighted) */
  activeRowId?: string | null;
  /** When true, show a compact layout with fewer columns and fixed row heights */
  compact?: boolean;
}

// ─── component ───────────────────────────────────────────────────────────────

export function DocsDataTable({
  artifacts: initialArtifacts,
  loading,
  onDelete,
  onOpenQuiz,
  onOpenArtifact,
  toolbarRight,
  catalog,
  onArtifactUpdated,
  activeSubject,
  onClearActiveSubject,
  processingItems = [],
  completedIds,
  newIds,
  retryingIds,
  onRetry,
  onCompletedAnimationEnd,
  onSendTPC,
  onCreateWithLusia,
  activeRowId,
  compact = false,
}: DocsDataTableProps) {
  const id = useId();
  const { user } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Shared cache: curriculum code → human-readable title */
  const titleCacheRef = useRef<Map<string, string>>(new Map());

  const [data, setData] = useState<Artifact[]>(initialArtifacts);
  /** When set, triggers inline rename on the matching NameCell */
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Sync external artifact changes into local state
  useEffect(() => {
    setData(initialArtifacts);
  }, [initialArtifacts]);

  // Batch-prefetch all curriculum titles when artifacts change.
  // Fills _curriculumTitleCache so CurriculumTag renders without individual API calls.
  useEffect(() => {
    const allCodes = initialArtifacts.flatMap((a) => a.curriculum_codes ?? []);
    const uncached = [...new Set(allCodes)].filter((c) => !_curriculumTitleCache.has(c));
    if (!uncached.length) return;
    fetchCurriculumTitlesBatch(uncached)
      .then((titles) => {
        for (const [code, title] of Object.entries(titles)) {
          _curriculumTitleCache.set(code, title);
          titleCacheRef.current.set(code, title);
        }
      })
      .catch(() => {/* CurriculumTag falls back to individual fetches */});
  }, [initialArtifacts]);

  // ─── auto-clear completed animation after delay ─────────────────────────
  useEffect(() => {
    if (!completedIds?.size || !onCompletedAnimationEnd) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    completedIds.forEach((cid) => {
      timers.push(setTimeout(() => onCompletedAnimationEnd(cid), 1500));
    });
    return () => timers.forEach(clearTimeout);
  }, [completedIds, onCompletedAnimationEnd]);

  // ─── responsive columns via ResizeObserver ────────────────────────────────

  const [containerWidth, setContainerWidth] = useState(9999);
  const [userVisibility, setUserVisibility] = useState<VisibilityState>({});

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Capture initial width (layout is ready inside useEffect)
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setContainerWidth(initial);
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const autoVisibility = useMemo<VisibilityState>(() => {
    const auto: VisibilityState = {};
    for (const [col, minWidth] of Object.entries(COLUMN_BREAKPOINTS)) {
      auto[col] = containerWidth >= minWidth;
    }
    return auto;
  }, [containerWidth]);

  const columnVisibility = useMemo((): VisibilityState => {
    if (compact) {
      // Force: name + subject + year + three dots only
      const vis: VisibilityState = {
        artifact_type: false,
        select: false,
        subjects: true,
        year_level: true,
        updated_at: false,
        curriculum_codes: false,
        creators: false,
      };
      return vis;
    }
    return { artifact_type: false, ...autoVisibility, ...userVisibility };
  }, [compact, autoVisibility, userVisibility]);

  // Column sizes differ in compact mode
  const compactSizes: Record<string, number> = compact ? {
    subjects: 120,
    year_level: 60,
    actions: 44,
  } : {};

  const getColSize = useCallback((id: string, normalSize: number) => {
    return compactSizes[id] ?? normalSize;
  }, [compactSizes]);

  // Name column fills all space left over by the fixed-width columns
  const nameColumnWidth = useMemo(() => {
    const fixed = [
      { id: "select",           size: compact ? 0 : 32  },
      { id: "subjects",         size: compact ? 120 : 200 },
      { id: "year_level",       size: compact ? 60 : 100 },
      { id: "curriculum_codes", size: 160 },
      { id: "creators",         size: 80  },
      { id: "updated_at",       size: 130 },
      { id: "actions",          size: compact ? 44 : 220 },
    ];
    const used = fixed.reduce(
      (acc, col) => acc + (columnVisibility[col.id] !== false ? col.size : 0),
      0,
    );
    return Math.max(120, containerWidth - used - 2);
  }, [containerWidth, columnVisibility, compact]);

  // Handle manual column toggle (user override on top of auto-hide)
  const handleToggleColumn = useCallback(
    (colId: string, visible: boolean) => {
      setUserVisibility((prev) => {
        // If user sets it back to what auto would do, remove override
        if (colId in COLUMN_BREAKPOINTS && visible === autoVisibility[colId]) {
          const next = { ...prev };
          delete next[colId];
          return next;
        }
        return { ...prev, [colId]: visible };
      });
    },
    [autoVisibility],
  );

  // ─── optimistic update ────────────────────────────────────────────────────

  const handleUpdateArtifact = useCallback(
    async (artifactId: string, patch: ArtifactUpdate) => {
      const original = data.find((a) => a.id === artifactId);
      // Optimistic update
      setData((prev) =>
        prev.map((a) => (a.id === artifactId ? { ...a, ...patch } : a)),
      );
      try {
        const updated = await updateArtifact(artifactId, patch);
        setData((prev) => prev.map((a) => (a.id === artifactId ? updated : a)));
        onArtifactUpdated?.(updated);
      } catch (e) {
        console.error("Failed to update artifact:", e);
        // Revert
        if (original) {
          setData((prev) => prev.map((a) => (a.id === artifactId ? original : a)));
        }
      }
    },
    [data, onArtifactUpdated],
  );

  // ─── table state ─────────────────────────────────────────────────────────

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);

  // ─── columns ─────────────────────────────────────────────────────────────

  const columns: ColumnDef<Artifact>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Selecionar todos"
          />
        ),
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Selecionar linha"
            />
          </div>
        ),
        size: 32,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "artifact_name",
        header: "Nome",
        accessorKey: "artifact_name",
        cell: ({ row }) => {
          const artifact = row.original;
          return (
            <div className="flex items-center gap-3">
              {/* File icon */}
              <div className="h-8 w-8 shrink-0 flex items-center justify-center">
                <ArtifactIcon artifact={artifact} />
              </div>

              {/* Name (editable) + creator avatars */}
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <NameCell
                    name={artifact.artifact_name}
                    onCommit={(name) => handleUpdateArtifact(artifact.id, { artifact_name: name })}
                    artifactId={artifact.id}
                  />
                  {newIds?.has(artifact.id) && (
                    <span
                      className="shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                      style={{ background: "linear-gradient(135deg, #00c6ff, #0052d4)" }}
                    >
                      Novo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {user?.avatar_url && (
                    <div className="h-4 w-4 rounded-full overflow-hidden border border-white/80 shrink-0">
                      <Image
                        src={user.avatar_url}
                        alt={user.display_name ?? "User"}
                        width={16}
                        height={16}
                        className="object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        },
        size: nameColumnWidth,
        filterFn: nameFilterFn,
        enableHiding: false,
      },
      {
        id: "subjects",
        header: "Disciplinas",
        accessorFn: (row) => row.subjects?.map((s) => s.name).join(", ") ?? "",
        cell: ({ row }) => (
          <SubjectsCell
            artifact={row.original}
            catalog={catalog}
            onCommit={(patch) => handleUpdateArtifact(row.original.id, patch)}
          />
        ),
        size: getColSize("subjects", 200),
        enableSorting: false,
        filterFn: subjectFilterFn,
      },
      {
        id: "year_level",
        header: "Ano",
        accessorFn: (row) => (row.year_levels ?? (row.year_level ? [row.year_level] : [])).join(","),
        cell: ({ row }) => {
          const artifact = row.original;
          const subjectIds = artifact.subject_ids ?? [];
          const allSubjects = catalog?.selected_subjects ?? [];
          const relevantSubjects = allSubjects.filter((s) => subjectIds.includes(s.id));
          const availableYears = relevantSubjects.length > 0
            ? Array.from(new Set(relevantSubjects.flatMap((s) => s.grade_levels))).sort((a, b) => Number(a) - Number(b))
            : [];
          return (
            <YearCell
              artifact={artifact}
              availableYears={availableYears}
              onCommit={(patch) => handleUpdateArtifact(artifact.id, patch)}
            />
          );
        },
        size: getColSize("year_level", 100),
        filterFn: (row, _columnId, filterValue: string[]) => {
          if (!filterValue?.length) return true;
          const years = row.original.year_levels ?? (row.original.year_level ? [row.original.year_level] : []);
          return filterValue.some((y) => years.includes(y));
        },
      },
      {
        id: "curriculum_codes",
        header: "Tema",
        accessorFn: (row) => row.curriculum_codes?.join(" ") ?? "",
        cell: ({ row }) => (
          <CurriculumCell
            artifact={row.original}
            titleCache={titleCacheRef}
            onUpdate={(codes) => handleUpdateArtifact(row.original.id, { curriculum_codes: codes })}
          />
        ),
        size: 160,
        enableSorting: false,
        filterFn: curriculumFilterFn,
      },
      {
        id: "creators",
        header: () => <span className="block text-center w-full">Criado por</span>,
        cell: ({ row }) => {
          const artifact = row.original;
          const showLusia = artifact.artifact_type !== "uploaded_file";
          const initials = (user?.full_name?.charAt(0) ?? user?.email?.charAt(0) ?? "U").toUpperCase();
          return (
            <div className="flex items-center justify-center -space-x-1.5">
              {showLusia && (
                <div className="h-6 w-6 rounded-full overflow-hidden border-2 border-white shrink-0">
                  <Image src="/lusia-symbol.png" alt="LUSIA" width={24} height={24} className="object-cover" />
                </div>
              )}
              <div className="h-6 w-6 rounded-full overflow-hidden border-2 border-white shrink-0 bg-brand-primary/20 flex items-center justify-center">
                {user?.avatar_url ? (
                  <Image src={user.avatar_url} alt={user.display_name ?? user.full_name ?? "User"} width={24} height={24} className="object-cover h-full w-full" />
                ) : (
                  <span className="text-[10px] font-bold text-brand-primary">{initials}</span>
                )}
              </div>
            </div>
          );
        },
        size: 80,
        enableSorting: false,
      },
      {
        id: "updated_at",
        header: "Últ. Atual.",
        accessorKey: "updated_at",
        cell: ({ row }) => (
          <span className="text-xs text-brand-primary/40 truncate block">
            {formatDate(row.original.updated_at ?? row.original.created_at)}
          </span>
        ),
        size: getColSize("updated_at", 130),
      },
      // Hidden virtual column — only used for Tipo filtering
      {
        id: "artifact_type",
        accessorKey: "artifact_type",
        header: "",
        cell: () => null,
        size: 0,
        enableSorting: false,
        enableHiding: false,
        filterFn: (row, _columnId, filterValue: string[]) => {
          if (!filterValue?.length) return true;
          return filterValue.includes(row.original.artifact_type);
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => {
          const art = row.original;
          const isQuiz = art.artifact_type === "quiz";
          const isNoteOrPdf = art.artifact_type === "note" || art.artifact_type === "uploaded_file";
          return (
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {/* Hover quick-action buttons (hidden in compact) */}
              {!compact && isQuiz && onSendTPC && (
                <button
                  onClick={() => onSendTPC(art.id)}
                  className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/10 bg-white px-2.5 py-1 text-[11px] font-medium text-brand-primary/70 hover:text-brand-primary hover:border-brand-primary/20 whitespace-nowrap"
                >
                  <ClipboardList className="h-3 w-3" />
                  Enviar TPC
                </button>
              )}
              {!compact && isNoteOrPdf && onCreateWithLusia && (
                <button
                  onClick={() => onCreateWithLusia(art.id)}
                  className="hidden lg:inline-flex relative overflow-hidden items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-brand-primary/70 hover:text-brand-primary whitespace-nowrap"
                  style={{
                    background: "linear-gradient(white, white) padding-box, linear-gradient(135deg, #89f7fe, #66a6ff, #0052d4) border-box",
                    border: "1px solid transparent",
                  }}
                >
                  <Image src="/lusia-symbol.png" alt="" width={14} height={14} />
                  <span>Criar com <span className="font-lusia">LUSIA</span></span>
                </button>
              )}
              <RowActions
                row={row}
                onDelete={onDelete}
                onOpenQuiz={onOpenQuiz}
                onOpenArtifact={onOpenArtifact}
                onRename={(id) => setRenamingId(id)}
                onSendTPC={onSendTPC}
                onCreateWithLusia={onCreateWithLusia}
              />
            </div>
          );
        },
        size: getColSize("actions", 220),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.avatar_url, user?.display_name, onDelete, onOpenQuiz, onOpenArtifact, handleUpdateArtifact, catalog, nameColumnWidth, onSendTPC, onCreateWithLusia, compact, getColSize],
  );

  // ─── table instance ───────────────────────────────────────────────────────

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    state: { sorting, columnFilters, columnVisibility },
  });

  // ─── year filter ──────────────────────────────────────────────────────────

  const uniqueYearValues = useMemo(() => {
    const years = new Set<string>();
    data.forEach((a) => {
      const ys = a.year_levels?.length ? a.year_levels : a.year_level ? [a.year_level] : [];
      ys.forEach((y) => years.add(y));
    });
    return Array.from(years).sort((a, b) => Number(a) - Number(b));
  }, [data]);

  const selectedYears = useMemo(() => {
    const val = table.getColumn("year_level")?.getFilterValue() as string[];
    return val ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.getColumn("year_level")?.getFilterValue()]);

  const handleYearChange = (year: string) => {
    const current = (table.getColumn("year_level")?.getFilterValue() as string[]) ?? [];
    // Single-select: clicking the active year deselects, clicking another replaces
    const next = current.includes(year) ? [] : [year];
    table.getColumn("year_level")?.setFilterValue(next.length ? next : undefined);
  };

  // ─── curriculum (Tema) filter — only after subject + year selected ────────

  const selectedCurriculumFilters = useMemo(() => {
    const val = table.getColumn("curriculum_codes")?.getFilterValue() as string[];
    return val ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.getColumn("curriculum_codes")?.getFilterValue()]);

  /** Codes present in artifacts matching the active year filter (subject already filtered externally via folder). */
  const availableCurriculumFilters = useMemo(() => {
    if (!selectedYears.length) return [];
    const codes = new Set<string>();
    data.forEach((a) => {
      const artifactYears = a.year_levels?.length ? a.year_levels : a.year_level ? [a.year_level] : [];
      if (selectedYears.some((y) => artifactYears.includes(y))) {
        a.curriculum_codes?.forEach((c) => codes.add(c));
      }
    });
    return Array.from(codes).sort();
  }, [data, selectedYears]);

  const handleCurriculumFilterChange = (checked: boolean, code: string) => {
    const current = (table.getColumn("curriculum_codes")?.getFilterValue() as string[]) ?? [];
    const next = checked ? [...current, code] : current.filter((v) => v !== code);
    table.getColumn("curriculum_codes")?.setFilterValue(next.length ? next : undefined);
  };

  // ─── tipo (artifact type) filter ─────────────────────────────────────────

  const selectedTypeFilters = useMemo(() => {
    const val = table.getColumn("artifact_type")?.getFilterValue() as string[];
    return val ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.getColumn("artifact_type")?.getFilterValue()]);

  const availableTypeFilters = useMemo(() => {
    const types = new Set(data.map((a) => a.artifact_type));
    return ARTIFACT_TYPES.filter((t) => types.has(t.value));
  }, [data]);

  const handleTypeFilterChange = (type: string) => {
    const current = (table.getColumn("artifact_type")?.getFilterValue() as string[]) ?? [];
    const next = current.includes(type) ? current.filter((v) => v !== type) : [...current, type];
    table.getColumn("artifact_type")?.setFilterValue(next.length ? next : undefined);
  };

  // ─── bulk delete ──────────────────────────────────────────────────────────

  const handleDeleteRows = () => {
    const selected = table.getSelectedRowModel().rows;
    selected.forEach((row) => onDelete(row.original.id));
    table.resetRowSelection();
  };

  // ─── loading / empty states ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
      </div>
    );
  }


  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <RenameContext.Provider value={{ renamingId, clearRenaming: () => setRenamingId(null) }}>
    <div ref={containerRef} className="flex flex-col gap-3 h-full @container">
      {/* ── toolbar ── */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Left tools */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Search */}
          <div className="relative min-w-0 flex-1 @[500px]:flex-none">
            <Input
              id={`${id}-search`}
              ref={inputRef}
              className={cn(
                "h-8 text-sm ps-8 w-full @[500px]:w-52",
                Boolean(table.getColumn("artifact_name")?.getFilterValue()) && "pe-8",
              )}
              value={(table.getColumn("artifact_name")?.getFilterValue() ?? "") as string}
              onChange={(e) => table.getColumn("artifact_name")?.setFilterValue(e.target.value)}
              placeholder="Pesquisar..."
              type="text"
              aria-label="Pesquisar documentos"
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-muted-foreground/70">
              <ListFilter size={14} strokeWidth={2} aria-hidden="true" />
            </div>
            {Boolean(table.getColumn("artifact_name")?.getFilterValue()) && (
              <button
                className="absolute inset-y-0 end-0 flex h-full w-8 items-center justify-center rounded-e-lg text-muted-foreground/70 hover:text-foreground transition-colors"
                aria-label="Limpar pesquisa"
                onClick={() => {
                  table.getColumn("artifact_name")?.setFilterValue("");
                  inputRef.current?.focus();
                }}
              >
                <CircleX size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Combined filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs shrink-0 gap-1.5">
                <Filter className="opacity-60 shrink-0" size={14} strokeWidth={2} aria-hidden="true" />
                <span className="hidden @[420px]:inline">Filtrar</span>
                {(selectedCurriculumFilters.length + selectedYears.length + selectedTypeFilters.length) > 0 && (
                  <span className="inline-flex h-4 items-center rounded border border-border bg-background px-1 font-[inherit] text-[0.6rem] font-medium text-muted-foreground/70">
                    {selectedCurriculumFilters.length + selectedYears.length + selectedTypeFilters.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3 space-y-4" align="start">

              {/* 1 — Tipo */}
              {availableTypeFilters.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Tipo</p>
                  {availableTypeFilters.map((t) => (
                    <div key={t.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`${id}-type-${t.value}`}
                        checked={selectedTypeFilters.includes(t.value)}
                        onCheckedChange={() => handleTypeFilterChange(t.value)}
                      />
                      <Label htmlFor={`${id}-type-${t.value}`} className="flex grow items-center gap-1.5 font-normal text-xs cursor-pointer">
                        <ArtifactTypeIcon type={t.value} />
                        {t.label}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

              {/* 2 — Ano */}
              {uniqueYearValues.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Ano</p>
                  <div className="flex flex-wrap gap-1">
                    {uniqueYearValues.map((y) => (
                      <button key={y} onClick={() => handleYearChange(y)} className="focus:outline-none">
                        <YearPill year={y} active={selectedYears.includes(y)} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 3 — Tema (only once year selected) */}
              {availableCurriculumFilters.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Tema</p>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                    {availableCurriculumFilters.map((code) => (
                      <button key={code} onClick={() => handleCurriculumFilterChange(!selectedCurriculumFilters.includes(code), code)} className="focus:outline-none">
                        <CurriculumTag code={code} titleCache={titleCacheRef} faded={!selectedCurriculumFilters.includes(code)} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Clear all */}
              {(selectedCurriculumFilters.length + selectedYears.length + selectedTypeFilters.length) > 0 && (
                <button
                  onClick={() => {
                    table.getColumn("curriculum_codes")?.setFilterValue(undefined);
                    table.getColumn("year_level")?.setFilterValue(undefined);
                    table.getColumn("artifact_type")?.setFilterValue(undefined);
                  }}
                  className="w-full text-[10px] text-muted-foreground hover:text-foreground transition-colors text-center pt-1 border-t border-border"
                >
                  Limpar filtros
                </button>
              )}
            </PopoverContent>
          </Popover>

          {/* Active subject pill */}
          {activeSubject && (() => {
            const c = activeSubject.color ?? "#6B7280";
            const Icon = getSubjectIcon(activeSubject.icon);
            return (
              <button
                onClick={onClearActiveSubject}
                title="Remover filtro de disciplina"
                className="inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium shrink-0 transition-opacity hover:opacity-80 focus:outline-none"
                style={{
                  color: "#fff",
                  backgroundColor: c,
                  border: `1.5px solid ${c}`,
                  borderBottomWidth: "3px",
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-white" />
                {activeSubject.name}
                <CircleX size={13} strokeWidth={2} className="shrink-0 opacity-70 text-white" />
              </button>
            );
          })()}
        </div>

        {/* Right tools */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Entry count */}
          <span className="text-xs text-brand-primary/40 tabular-nums shrink-0 hidden @[420px]:inline">
            {table.getFilteredRowModel().rows.length}
            {table.getFilteredRowModel().rows.length !== data.length && (
              <span className="text-brand-primary/25"> / {data.length}</span>
            )}
            {" "}itens
          </span>
          {toolbarRight}
          {/* Bulk delete */}
          {table.getSelectedRowModel().rows.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs shrink-0 gap-1.5">
                  <Trash className="opacity-60 shrink-0" size={14} strokeWidth={2} aria-hidden="true" />
                  <span className="hidden @[420px]:inline">Apagar</span>
                  <span className="inline-flex h-4 items-center rounded border border-border bg-background px-1 font-[inherit] text-[0.6rem] font-medium text-muted-foreground/70">
                    {table.getSelectedRowModel().rows.length}
                  </span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border">
                    <CircleAlert className="opacity-80" size={16} strokeWidth={2} />
                  </div>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tens a certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Serão eliminados{" "}
                      {table.getSelectedRowModel().rows.length}{" "}
                      {table.getSelectedRowModel().rows.length === 1 ? "documento" : "documentos"}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteRows}>Apagar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* ── table ── */}
      <div
        className={cn(
          "flex-1 min-h-0 rounded-xl border border-brand-primary/8 bg-white transition-[border-color] duration-300",
          compact ? "overflow-y-auto overflow-x-hidden" : "overflow-auto",
        )}
        style={activeSubject?.color ? { borderColor: `${activeSubject.color}55` } : undefined}
      >
        <table className="w-full caption-bottom text-sm table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-white [box-shadow:inset_0_-1px_0_0_rgba(13,47,127,0.12)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="hover:bg-transparent border-brand-primary/8"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: `${header.getSize()}px` }}
                    className="h-10 text-xs text-brand-primary/50 font-medium"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <div
                        className="flex h-full cursor-pointer select-none items-center justify-between gap-2"
                        onClick={header.column.getToggleSortingHandler()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            header.column.getToggleSortingHandler()?.(e);
                          }
                        }}
                        tabIndex={0}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: (
                            <ChevronUp
                              className="shrink-0 opacity-50"
                              size={13}
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                          ),
                          desc: (
                            <ChevronDown
                              className="shrink-0 opacity-50"
                              size={13}
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                          ),
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          {/* ── Processing rows (above main table body) ── */}
          {processingItems.length > 0 && (
            <tbody>
              <AnimatePresence>
                {processingItems.map((item) => {
                  const visColCount = table.getVisibleLeafColumns().length;
                  const ext = item.storage_path?.split(".").pop()?.toLowerCase() ?? "";
                  const isRetryingItem = retryingIds?.has(item.id);

                  return (
                    <motion.tr
                      key={`proc-${item.id}`}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.25 }}
                      className="border-b border-brand-primary/5"
                    >
                      {/* Checkbox cell (empty placeholder) */}
                      <td className="p-3 py-2.5 align-middle" style={{ width: 32 }} />

                      {/* Name cell — matches artifact_name column */}
                      <td className="p-3 py-2.5 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 shrink-0 flex items-center justify-center">
                            {ext === "pdf" ? (
                              <HugeiconsIcon icon={Pdf01Icon} size={22} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />
                            ) : ext === "doc" || ext === "docx" ? (
                              <HugeiconsIcon icon={Note01Icon} size={22} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />
                            ) : (
                              <span className="text-base opacity-60">📄</span>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-medium text-brand-primary truncate">
                              {item.artifact_name}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Processing pill (spans remaining columns minus actions) */}
                      <td className="p-3 py-2.5 align-middle" colSpan={Math.max(1, visColCount - 3)}>
                        <ProcessingStepPill
                          step={item.current_step}
                          failed={item.failed}
                          errorMessage={item.error_message}
                        />
                      </td>

                      {/* Actions cell — retry button or empty */}
                      <td className="p-3 py-0 align-middle text-right" style={{ width: 52 }}>
                        {item.failed && onRetry && (
                          <button
                            onClick={() => onRetry(item.id)}
                            disabled={isRetryingItem}
                            className="inline-flex items-center gap-1 text-xs text-brand-primary/50 hover:text-brand-primary transition-colors disabled:opacity-50"
                          >
                            {isRetryingItem ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          )}

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const isJustCompleted = completedIds?.has(row.original.id);

                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      "group/row border-brand-primary/5 hover:bg-brand-primary/[0.02] data-[state=selected]:bg-brand-primary/5 cursor-pointer",
                      isJustCompleted && "animate-completed-flash",
                      row.original.id === activeRowId && "bg-brand-accent/[0.06] hover:bg-brand-accent/[0.08]",
                    )}
                    style={isJustCompleted ? {
                      animation: "completedFlash 1.5s ease-out forwards",
                    } : undefined}
                    onClick={() => {
                      const art = row.original;
                      if (art.artifact_type === "quiz") onOpenQuiz(art.id);
                      else if (art.artifact_type === "note" || art.artifact_type === "uploaded_file") onOpenArtifact?.(art.id);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2.5 last:py-0 overflow-hidden">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : processingItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-36 text-center text-sm text-brand-primary/40"
                >
                  {data.length === 0
                    ? activeSubject
                      ? `Nenhum documento em ${activeSubject.name}.`
                      : "Seleciona uma pasta de disciplina para ver os seus documentos."
                    : "Nenhum resultado encontrado."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </table>
      </div>

    </div>
    </RenameContext.Provider>
  );
}

// ─── NameCell ─────────────────────────────────────────────────────────────────

function NameCell({
  name,
  onCommit,
  artifactId,
}: {
  name: string;
  onCommit: (newName: string) => void;
  artifactId: string;
}) {
  const { renamingId, clearRenaming } = React.useContext(RenameContext);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when artifact name changes from outside
  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  // Programmatic rename trigger from context
  useEffect(() => {
    if (renamingId === artifactId && !editing) {
      setEditing(true);
      clearRenaming();
    }
  }, [renamingId, artifactId, editing, clearRenaming]);

  useEffect(() => {
    if (editing) {
      // Small delay so the dropdown menu can finish closing
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [editing]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      onCommit(trimmed);
    } else {
      setValue(name);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setValue(name);
            setEditing(false);
          }
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full text-sm font-medium text-brand-primary bg-transparent outline-none border-b border-brand-primary/40 focus:border-brand-primary/70 leading-normal"
      />
    );
  }

  return (
    <span
      className="text-sm font-medium text-brand-primary rounded px-0.5 -mx-0.5 truncate block"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title={value}
    >
      {value}
    </span>
  );
}

// ─── SubjectPill ──────────────────────────────────────────────────────────────

function SubjectPill({
  name,
  color,
  icon,
  faded = false,
  onClick,
}: {
  name: string;
  color: string | null;
  icon: string | null;
  faded?: boolean;
  onClick?: () => void;
}) {
  const c = color ?? "#6B7280";
  const Icon = getSubjectIcon(icon);
  return (
    <span
      onClick={onClick}
      style={{
        color: c,
        backgroundColor: c + "18",
        border: `1.5px solid ${c}`,
        borderBottomWidth: "3px",
        opacity: faded ? 0.35 : 1,
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none transition-all duration-100 ease-out max-w-full",
        onClick && "cursor-pointer active:translate-y-px active:[border-bottom-width:1.5px]",
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: c }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

// ─── YearPill ─────────────────────────────────────────────────────────────────

function YearPill({
  year,
  active = false,
  onClick,
}: {
  year: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      style={{
        color: "#4B5563",
        backgroundColor: "#F3F4F6",
        border: "1.5px solid #9CA3AF",
        borderBottomWidth: "3px",
        opacity: active ? 1 : 0.45,
      }}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none transition-all duration-100 ease-out",
        onClick && "cursor-pointer hover:opacity-80 active:translate-y-px active:[border-bottom-width:1.5px]",
      )}
    >
      {year}
    </span>
  );
}

// ─── SubjectsCell ─────────────────────────────────────────────────────────────

/** Find a MaterialSubject by id anywhere in the catalog, or construct a minimal fallback. */
function resolveSubject(
  id: string,
  artifactSubjects: { id: string; name: string; color: string | null; icon: string | null }[],
  catalog: SubjectCatalog | null,
): MaterialSubject {
  if (catalog) {
    for (const s of catalog.selected_subjects) if (s.id === id) return s;
    for (const s of catalog.more_subjects.custom) if (s.id === id) return s;
    for (const g of catalog.more_subjects.by_education_level)
      for (const s of g.subjects) if (s.id === id) return s;
  }
  const fb = artifactSubjects.find((s) => s.id === id);
  return {
    id,
    name: fb?.name ?? id,
    color: fb?.color ?? null,
    icon: fb?.icon ?? null,
    slug: null,
    education_level: "",
    education_level_label: "",
    grade_levels: [],
    is_custom: false,
    is_selected: true,
    selected_grade: null,
  };
}

function SubjectsCell({
  artifact,
  catalog,
  onCommit,
}: {
  artifact: Artifact;
  catalog: SubjectCatalog | null;
  onCommit: (patch: ArtifactUpdate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [localIds, setLocalIds] = useState<string[]>(artifact.subject_ids ?? []);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) setLocalIds(artifact.subject_ids ?? []);
  }, [artifact.subject_ids, open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      const current = artifact.subject_ids ?? [];
      const changed =
        JSON.stringify([...localIds].sort()) !== JSON.stringify([...current].sort());
      if (changed && (artifact.curriculum_codes?.length ?? 0) > 0) {
        setPendingIds(localIds);
        return; // keep open; show confirmation
      }
      if (changed) onCommit({ subject_ids: localIds });
    }
    setOpen(next);
  };

  const handleConfirm = () => {
    if (pendingIds) onCommit({ subject_ids: pendingIds, curriculum_codes: [] });
    setPendingIds(null);
    setOpen(false);
  };

  const handleCancelConfirm = () => {
    setLocalIds(artifact.subject_ids ?? []); // revert
    setPendingIds(null);
    setOpen(false);
  };

  const selectedMaterialSubjects = useMemo<MaterialSubject[]>(
    () => localIds.map((id) => resolveSubject(id, artifact.subjects ?? [], catalog)),
    [localIds, artifact.subjects, catalog],
  );

  const handleToggle = (subject: MaterialSubject) => {
    // Single-select: replace current selection (deselect if same)
    setLocalIds((prev) => (prev.includes(subject.id) ? [] : [subject.id]));
  };

  const handleRemove = (subjectId: string) => {
    setLocalIds((prev) => prev.filter((id) => id !== subjectId));
  };

  return (
    <>
      <div
        className="cursor-pointer flex flex-nowrap gap-1 py-0.5 rounded px-1 -mx-1 hover:bg-brand-primary/[0.03] transition-colors overflow-hidden"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Clique para editar disciplinas"
      >
        {selectedMaterialSubjects.length > 0 ? (
          selectedMaterialSubjects.map((s) => (
            <SubjectPill key={s.id} name={s.name} color={s.color} icon={s.icon} />
          ))
        ) : (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] text-brand-primary/30 border border-dashed border-brand-primary/20 leading-none">
            Vazio
          </span>
        )}
      </div>

      <SubjectSelector
        open={open}
        onOpenChange={handleOpenChange}
        catalog={catalog}
        selectedSubjects={selectedMaterialSubjects}
        onToggleSubject={handleToggle}
        onRemoveSubject={handleRemove}
      />

      <AlertDialog open={pendingIds !== null}>
        <AlertDialogContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border">
              <CircleAlert className="opacity-80" size={16} strokeWidth={2} />
            </div>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar as disciplinas?</AlertDialogTitle>
              <AlertDialogDescription>
                Alterar as disciplinas irá limpar a seleção de Tema deste documento. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConfirm}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── YearCell ─────────────────────────────────────────────────────────────────

const YEAR_GROUPS = [
  { label: "1.º Ciclo", years: ["1", "2", "3", "4"] },
  { label: "2.º Ciclo", years: ["5", "6"] },
  { label: "3.º Ciclo", years: ["7", "8", "9"] },
  { label: "Secundário", years: ["10", "11", "12"] },
];

const ALL_YEARS = YEAR_GROUPS.flatMap((g) => g.years);

function YearCell({
  artifact,
  availableYears,
  onCommit,
}: {
  artifact: Artifact;
  availableYears: string[];
  onCommit: (patch: ArtifactUpdate) => void;
}) {
  const yearsToShow = availableYears.length > 0 ? availableYears : ALL_YEARS;
  const getArtifactYears = () =>
    artifact.year_levels?.length
      ? artifact.year_levels
      : artifact.year_level
      ? [artifact.year_level]
      : [];

  const [open, setOpen] = useState(false);
  const [localYears, setLocalYears] = useState<string[]>(getArtifactYears);
  const [pendingYears, setPendingYears] = useState<string[] | null>(null);

  // Sync from artifact only when closed (external update or revert)
  useEffect(() => {
    if (!open) setLocalYears(getArtifactYears());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.year_levels, artifact.year_level]);

  const handleToggle = (y: string) =>
    setLocalYears((prev) => (prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y]));

  const commitYears = (years: string[], clearCodes = false) => {
    // Update local display immediately before API responds
    setLocalYears(years);
    const patch: ArtifactUpdate = {
      year_levels: years,
      year_level: years[0] ?? undefined,
      ...(clearCodes ? { curriculum_codes: [] } : {}),
    };
    onCommit(patch);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      const original = getArtifactYears();
      const changed = JSON.stringify([...localYears].sort()) !== JSON.stringify([...original].sort());
      // Warn only when existing years are removed (not when new years are added)
      const yearsRemoved = original.some((y) => !localYears.includes(y));
      if (changed && yearsRemoved && (artifact.curriculum_codes?.length ?? 0) > 0) {
        setPendingYears(localYears);
        return; // keep popover open; show confirmation dialog
      }
      if (changed) commitYears(localYears);
    }
    setOpen(next);
  };

  const handleConfirm = () => {
    if (pendingYears) commitYears(pendingYears, true);
    setPendingYears(null);
    setOpen(false);
  };

  const handleCancelConfirm = () => {
    setLocalYears(getArtifactYears()); // revert
    setPendingYears(null);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <div
            className="cursor-pointer flex flex-wrap gap-1 py-0.5 rounded px-1 -mx-1 hover:bg-brand-primary/[0.03] transition-colors"
            onClick={(e) => e.stopPropagation()}
            title="Clique para editar ano"
          >
            {localYears.length > 0 ? (
              localYears.map((y) => <YearPill key={y} year={y} active />)
            ) : (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] text-brand-primary/30 border border-dashed border-brand-primary/20 leading-none">
                Vazio
              </span>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-3" align="start" onClick={(e) => e.stopPropagation()}>
          <p className="text-[10px] font-medium text-muted-foreground mb-2">Ano letivo</p>
          <div className="space-y-2">
            {YEAR_GROUPS.map((group) => {
              const visible = group.years.filter((y) => yearsToShow.includes(y));
              if (!visible.length) return null;
              return (
                <div key={group.label}>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/50 mb-1">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {visible.map((y) => (
                      <YearPill key={y} year={y} active={localYears.includes(y)} onClick={() => handleToggle(y)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {localYears.length > 0 && (
            <button
              onClick={() => setLocalYears([])}
              className="mt-2.5 w-full text-[10px] text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              Limpar
            </button>
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog open={pendingYears !== null}>
        <AlertDialogContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border">
              <CircleAlert className="opacity-80" size={16} strokeWidth={2} />
            </div>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar o ano?</AlertDialogTitle>
              <AlertDialogDescription>
                Alterar o ano irá limpar a seleção de Tema deste documento. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConfirm}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── RowActions ───────────────────────────────────────────────────────────────

const MENU_ITEM_CLASS = "focus:bg-brand-primary/[0.04] focus:text-brand-primary";

function RowActions({
  row,
  onDelete,
  onOpenQuiz,
  onOpenArtifact,
  onRename,
  onSendTPC,
  onCreateWithLusia,
}: {
  row: Row<Artifact>;
  onDelete: (id: string) => void;
  onOpenQuiz: (id: string) => void;
  onOpenArtifact?: (id: string) => void;
  onRename?: (id: string) => void;
  onSendTPC?: (id: string) => void;
  onCreateWithLusia?: (id: string) => void;
}) {
  const artifact = row.original;
  const isQuiz = artifact.artifact_type === "quiz";
  const isNoteOrPdf = artifact.artifact_type === "note" || artifact.artifact_type === "uploaded_file";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 shadow-none" aria-label="Ações">
          <Ellipsis size={15} strokeWidth={2} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          {/* Open */}
          {isQuiz && (
            <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={() => onOpenQuiz(artifact.id)}>
              <span>Abrir</span>
              <DropdownMenuShortcut>↵</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {isNoteOrPdf && (
            <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={() => onOpenArtifact?.(artifact.id)}>
              <span>Abrir</span>
              <DropdownMenuShortcut>↵</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}

          {/* Rename */}
          <DropdownMenuItem
            className={MENU_ITEM_CLASS}
            onClick={(e) => {
              e.stopPropagation();
              onRename?.(artifact.id);
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5 opacity-60" />
            <span>Mudar nome</span>
          </DropdownMenuItem>

          {/* Send as TPC */}
          {onSendTPC && (
            <DropdownMenuItem
              className={MENU_ITEM_CLASS}
              onClick={(e) => {
                e.stopPropagation();
                onSendTPC(artifact.id);
              }}
            >
              <ClipboardList className="mr-2 h-3.5 w-3.5 opacity-60" />
              <span>Enviar TPC</span>
            </DropdownMenuItem>
          )}

          {/* Criar com Lusia — notes/PDFs only */}
          {isNoteOrPdf && onCreateWithLusia && (
            <DropdownMenuItem
              className={MENU_ITEM_CLASS}
              onClick={(e) => {
                e.stopPropagation();
                onCreateWithLusia(artifact.id);
              }}
            >
              <Image src="/lusia-symbol.png" alt="" width={16} height={16} className="mr-2" />
              <span>
                Criar com <span className="font-lusia">LUSIA</span>
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive focus:bg-destructive/5"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(artifact.id);
          }}
        >
          <Trash className="mr-2 h-3.5 w-3.5 opacity-60" />
          <span>Apagar</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── CurriculumPickerDialog ───────────────────────────────────────────────────

const CURRICULUM_LEVEL_INFO = [
  {
    name: "Domínio",
    hint: "Seleciona um domínio inteiro para cobertura ampla, ou entra para escolher capítulos e subcapítulos específicos conforme a precisão desejada.",
  },
  {
    name: "Capítulo",
    hint: "Seleciona um capítulo inteiro ou entra para subcapítulos mais específicos. Se nenhum se adequa bem, volta para selecionar o domínio inteiro.",
  },
  {
    name: "Subcapítulo",
    hint: "Seleciona os subcapítulos específicos. Se nenhum faz sentido, volta para o capítulo ou domínio inteiro.",
  },
] as const;

function CurriculumPickerDialog({
  open,
  onOpenChange,
  artifact,
  titleCache,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifact: Artifact;
  titleCache: React.MutableRefObject<Map<string, string>>;
  onSave: (codes: string[]) => void;
}) {
  const subjects = artifact.subjects ?? [];
  const year = artifact.year_level;
  const canLoad = subjects.length > 0 && !!year;

  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const fetchSubjectId = activeSubjectId ?? subjects[0]?.id ?? null;

  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  // Navigation stack: each item is the node whose children we're viewing
  const [navStack, setNavStack] = useState<CurriculumNode[]>([]);
  const [currentNodes, setCurrentNodes] = useState<CurriculumNode[]>([]);
  const [currentLoading, setCurrentLoading] = useState(false);

  // Cache nodes by parent key to avoid re-fetching on back-navigation
  const nodesCacheRef = useRef<Record<string, CurriculumNode[]>>({});

  // Current depth: 0 = Domínio, 1 = Capítulo, 2 = Subcapítulo
  const currentLevel = navStack.length;
  const currentKey = navStack.length > 0 ? navStack[navStack.length - 1].id : "root";
  const levelInfo = CURRICULUM_LEVEL_INFO[Math.min(currentLevel, 2)];

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setSelectedCodes(artifact.curriculum_codes ?? []);
    setActiveSubjectId(null);
    setNavStack([]);
    setCurrentNodes([]);
    nodesCacheRef.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load current level nodes whenever navigation or subject/year changes
  useEffect(() => {
    if (!open || !canLoad || !fetchSubjectId || !year) {
      setCurrentNodes([]);
      return;
    }
    const cached = nodesCacheRef.current[currentKey];
    if (cached) {
      setCurrentNodes(cached);
      return;
    }
    let cancelled = false;
    setCurrentLoading(true);
    setCurrentNodes([]);
    const parentId = navStack.length > 0 ? navStack[navStack.length - 1].id : undefined;
    fetchCurriculumNodes(fetchSubjectId, year, parentId)
      .then((r) => {
        if (cancelled) return;
        r.nodes.forEach((n) => titleCache.current.set(n.code, n.title));
        nodesCacheRef.current[currentKey] = r.nodes;
        setCurrentNodes(r.nodes);
      })
      .catch((e) => { if (!cancelled) console.error("Curriculum fetch error:", e); })
      .finally(() => { if (!cancelled) setCurrentLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchSubjectId, year, currentKey]);

  const handleToggleCode = (code: string) =>
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );

  const drillInto = (node: CurriculumNode) =>
    setNavStack((prev) => [...prev, node]);

  const navigateTo = (index: number) =>
    setNavStack((prev) => prev.slice(0, index));

  const switchSubject = (id: string) => {
    setActiveSubjectId(id);
    setNavStack([]);
    nodesCacheRef.current = {};
  };

  // Count selections within a node's subtree (including itself)
  const countSelected = (node: CurriculumNode) =>
    selectedCodes.filter((c) => c === node.code || c.startsWith(node.code + ".")).length;

  const handleSave = () => { onSave(selectedCodes); onOpenChange(false); };

  const totalSelected = selectedCodes.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[min(90vh,620px)] px-0 py-0 pt-4 gap-0 overflow-hidden flex flex-col">

        {/* ── Prerequisite gate ── */}
        {!canLoad && (
          <div className="px-5 py-8 text-center">
            <FolderOpen className="h-9 w-9 text-brand-primary/20 mx-auto mb-3" />
            <p className="text-sm text-brand-primary/50 leading-relaxed max-w-xs mx-auto">
              Para selecionar um tema, este documento precisa de ter{" "}
              <span className="font-medium text-brand-primary/70">
                {!subjects.length && !year
                  ? "uma disciplina e um ano"
                  : !subjects.length
                  ? "uma disciplina"
                  : "um ano"}
              </span>{" "}
              definidos.
            </p>
          </div>
        )}

        {canLoad && (
          <>
            {/* ── Step header (aligned with close button) ── */}
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2.5 mb-2 pr-10">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary/30 leading-none">
                  Passo {currentLevel + 1} de 3
                </span>
                {/* Progress bar */}
                <div className="flex gap-1 flex-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 rounded-full transition-all duration-300",
                        i < currentLevel
                          ? "flex-1 bg-brand-accent/50"
                          : i === currentLevel
                          ? "flex-[2] bg-brand-accent"
                          : "flex-1 bg-brand-primary/10",
                      )}
                    />
                  ))}
                </div>
              </div>
              <h3 className="text-base font-semibold text-brand-primary leading-tight">
                Selecionar {levelInfo.name}
              </h3>
              <p className="text-sm text-brand-primary/50 mt-1 leading-snug">
                {levelInfo.hint}
              </p>
            </div>

            {/* ── Subject tabs ── */}
            {subjects.length > 1 && (
              <div className="flex gap-1.5 flex-wrap px-5 pb-3 border-b border-brand-primary/5">
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => switchSubject(s.id)}
                    className="focus:outline-none"
                  >
                    <SubjectPill
                      name={s.name}
                      color={s.color}
                      icon={s.icon}
                      faded={s.id !== fetchSubjectId}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* ── Breadcrumb ── */}
            {navStack.length > 0 && (
              <div className="flex items-center gap-1 px-5 py-2 border-t border-brand-primary/5 flex-wrap">
                <button
                  onClick={() => navigateTo(0)}
                  className="text-xs text-brand-primary/40 hover:text-brand-primary/70 transition-colors shrink-0"
                >
                  Domínios
                </button>
                {navStack.map((node, i) => (
                  <React.Fragment key={node.id}>
                    <ChevronRight className="h-3 w-3 text-brand-primary/20 shrink-0" />
                    <button
                      onClick={() => navigateTo(i + 1)}
                      className={cn(
                        "text-xs transition-colors truncate max-w-[130px]",
                        i === navStack.length - 1
                          ? "text-brand-primary/70 font-medium cursor-default"
                          : "text-brand-primary/40 hover:text-brand-primary/70",
                      )}
                    >
                      {node.title}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* ── Card grid ── */}
            <div className="overflow-y-auto flex-1 p-4">
              {currentLoading ? (
                <div className="flex items-center justify-center py-14 gap-2 text-xs text-brand-primary/30">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  A carregar...
                </div>
              ) : currentNodes.length === 0 ? (
                <div className="py-14 text-center text-xs text-brand-primary/30">
                  Nenhum conteúdo disponível.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentNodes.map((node) => {
                    const isSelected = selectedCodes.includes(node.code);
                    const subtreeCount = countSelected(node);
                    // Only show badge for children when node itself is NOT selected
                    const childSelCount = isSelected ? 0 : subtreeCount;
                    const hasDeepSel = childSelCount > 0;
                    // Can drill deeper if it has children and we're not at max depth
                    const canDrill = node.has_children && currentLevel < 2;

                    return (
                      <div
                        key={node.id}
                        className={cn(
                          "group relative rounded-xl border-2 transition-all duration-150",
                          isSelected
                            ? "border-brand-accent bg-brand-accent/[0.06]"
                            : hasDeepSel
                            ? "border-brand-accent/35 bg-brand-accent/[0.02]"
                            : "border-brand-primary/8 bg-white hover:border-brand-primary/18 hover:bg-brand-primary/[0.012]",
                        )}
                      >
                        {/* Checkbox — top-left, selects THIS node's code */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCode(node.code);
                          }}
                          className={cn(
                            "absolute top-3.5 left-3.5 h-4 w-4 rounded border-2 flex items-center justify-center transition-all shrink-0 z-10",
                            isSelected
                              ? "border-brand-accent bg-brand-accent"
                              : "border-brand-primary/25 hover:border-brand-primary/50 bg-white",
                          )}
                          aria-label={isSelected ? "Desselecionar" : "Selecionar"}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                        </button>

                        {/* Card body — click drills in (if canDrill) */}
                        <button
                          onClick={() => canDrill && drillInto(node)}
                          disabled={!canDrill}
                          className={cn(
                            "w-full p-3.5 pl-10 text-left",
                            canDrill ? "pr-8 cursor-pointer" : "pr-4 cursor-default",
                          )}
                        >
                          <p
                            className={cn(
                              "font-medium text-sm leading-snug",
                              isSelected
                                ? "text-brand-accent"
                                : "text-brand-primary",
                            )}
                          >
                            {node.title}
                          </p>
                          {/* Deep-selection badge */}
                          {childSelCount > 0 && (
                            <p className="mt-1 text-[10px] font-semibold text-brand-accent/80">
                              {childSelCount}{" "}
                              {childSelCount === 1 ? "selecionado" : "selecionados"} dentro
                            </p>
                          )}
                          {/* Drill hint on hover */}
                          {canDrill && !isSelected && childSelCount === 0 && (
                            <p className="mt-1 text-[10px] text-brand-primary/30 opacity-0 group-hover:opacity-100 transition-opacity">
                              Entrar para mais detalhes
                            </p>
                          )}
                        </button>

                        {/* Drill chevron */}
                        {canDrill && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 transition-colors",
                                hasDeepSel
                                  ? "text-brand-accent/40"
                                  : "text-brand-primary/20 group-hover:text-brand-primary/45",
                              )}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-brand-primary/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {navStack.length > 0 && (
              <button
                onClick={() => navigateTo(navStack.length - 1)}
                className="text-xs text-brand-primary/50 hover:text-brand-primary/80 transition-colors flex items-center gap-1 shrink-0"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </button>
            )}
            {totalSelected > 0 && (
              <button
                onClick={() => setSelectedCodes([])}
                className="text-xs text-brand-primary/40 hover:text-destructive transition-colors"
              >
                Limpar tudo ({totalSelected})
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canLoad}>
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── CurriculumCell ───────────────────────────────────────────────────────────

function CurriculumCell({
  artifact,
  titleCache,
  onUpdate,
}: {
  artifact: Artifact;
  titleCache: React.MutableRefObject<Map<string, string>>;
  onUpdate: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const codes = artifact.curriculum_codes ?? [];

  return (
    <>
      <div
        className="cursor-pointer flex items-center gap-1 py-0.5 rounded px-1 -mx-1 hover:bg-brand-primary/[0.03] transition-colors overflow-hidden"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Clique para editar tema"
      >
        {codes.length > 0 ? (
          <>
            <span className="flex min-w-0 flex-1 items-center overflow-hidden">
              <CurriculumTag code={codes[0]} titleCache={titleCache} />
            </span>
            {codes.length > 1 && (
              <CurriculumPill label={`+${codes.length - 1}`} />
            )}
          </>
        ) : (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] text-brand-primary/30 border border-dashed border-brand-primary/20 leading-none">
            Vazio
          </span>
        )}
      </div>

      <CurriculumPickerDialog
        open={open}
        onOpenChange={setOpen}
        artifact={artifact}
        titleCache={titleCache}
        onSave={onUpdate}
      />
    </>
  );
}
