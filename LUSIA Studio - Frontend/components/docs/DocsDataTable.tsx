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
import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  PaginationState,
  Row,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Check,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleX,
  ClipboardList,
  Ellipsis,
  FileText,
  Filter,
  FolderOpen,
  ListFilter,
  Loader2,
  Sparkles,
  Trash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Artifact, ARTIFACT_TYPES, ArtifactUpdate, updateArtifact } from "@/lib/artifacts";
import { getSubjectIcon } from "@/lib/icons";
import { CurriculumNode, fetchCurriculumNodes, fetchNoteByCode, MaterialSubject, SubjectCatalog } from "@/lib/materials";
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
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── types ───────────────────────────────────────────────────────────────────

type IconInfo = { type: "image"; src: string } | { type: "emoji"; value: string };


// ─── helpers ─────────────────────────────────────────────────────────────────

const FILE_ICON_SRCS: Record<string, string> = {
  pdf:  "/icons/pdf_icon.png",
  doc:  "/icons/doc_icon.png",
  docx: "/icons/doc_icon.png",
  md:   "/icons/txt_icon.png",
  txt:  "/icons/txt_icon.png",
};

function getFileIcon(artifact: Artifact): IconInfo {
  if (artifact.artifact_type === "uploaded_file" && artifact.storage_path) {
    const ext = artifact.storage_path.split(".").pop()?.toLowerCase() ?? "";
    const src = FILE_ICON_SRCS[ext];
    if (src) return { type: "image", src };
  }
  const emoji =
    artifact.icon ??
    ARTIFACT_TYPES.find((t) => t.value === artifact.artifact_type)?.icon ??
    "📄";
  return { type: "emoji", value: emoji };
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

/** Lazily resolves a curriculum code → title via cache + API, then renders CurriculumPill. */
function CurriculumTag({
  code,
  titleCache,
  faded,
}: {
  code: string;
  titleCache: React.MutableRefObject<Map<string, string>>;
  faded?: boolean;
}) {
  const cached = titleCache.current.get(code);
  const [title, setTitle] = useState<string | null>(cached ?? null);

  useEffect(() => {
    if (title) return;
    const c = titleCache.current.get(code);
    if (c) { setTitle(c); return; }

    let cancelled = false;
    fetchNoteByCode(code)
      .then((r) => {
        if (cancelled) return;
        titleCache.current.set(code, r.curriculum.title);
        setTitle(r.curriculum.title);
      })
      .catch(() => {
        if (cancelled) return;
        titleCache.current.set(code, code);
        setTitle(code);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return <CurriculumPill label={title ?? code} faded={faded} />;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
  });
}

// ─── column responsive breakpoints ───────────────────────────────────────────

const COLUMN_BREAKPOINTS: Record<string, number> = {
  year_level:       520,
  creators:         640,
  updated_at:       760,
  curriculum_codes: 900,
  // subjects always visible — no breakpoint
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
}

// ─── component ───────────────────────────────────────────────────────────────

export function DocsDataTable({
  artifacts: initialArtifacts,
  loading,
  onDelete,
  onOpenQuiz,
  toolbarRight,
  catalog,
  onArtifactUpdated,
  activeSubject,
  onClearActiveSubject,
}: DocsDataTableProps) {
  const id = useId();
  const { user } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Shared cache: curriculum code → human-readable title */
  const titleCacheRef = useRef<Map<string, string>>(new Map());

  const [data, setData] = useState<Artifact[]>(initialArtifacts);

  // Sync external artifact changes into local state
  useEffect(() => {
    setData(initialArtifacts);
  }, [initialArtifacts]);

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

  const columnVisibility = useMemo<VisibilityState>(
    () => ({ artifact_type: false, ...autoVisibility, ...userVisibility }),
    [autoVisibility, userVisibility],
  );

  // Name column fills all space left over by the fixed-width columns
  const nameColumnWidth = useMemo(() => {
    const fixed = [
      { id: "select",           size: 32  },
      { id: "subjects",         size: 200 },
      { id: "year_level",       size: 100 },
      { id: "curriculum_codes", size: 160 },
      { id: "creators",         size: 80  },
      { id: "updated_at",       size: 110 },
      { id: "actions",          size: 52  },
    ];
    const used = fixed.reduce(
      (acc, col) => acc + (columnVisibility[col.id] !== false ? col.size : 0),
      0,
    );
    return Math.min(220, Math.max(160, containerWidth - used - 2));
  }, [containerWidth, columnVisibility]);

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
  const [sorting, setSorting] = useState<SortingState>([{ id: "artifact_name", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  });

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
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Selecionar linha"
          />
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
          const isNative = artifact.source_type === "native";
          const icon = getFileIcon(artifact);
          return (
            <div className="flex items-center gap-3">
              {/* File icon */}
              <div
                className="h-8 w-8 shrink-0 overflow-hidden flex items-center justify-center cursor-pointer"
                onClick={() => {
                  if (artifact.artifact_type === "quiz") onOpenQuiz(artifact.id);
                }}
              >
                {icon.type === "image" ? (
                  <Image
                    src={icon.src}
                    alt={artifact.artifact_type}
                    width={32}
                    height={32}
                    className="object-cover"
                  />
                ) : (
                  <span className="text-base">{icon.value}</span>
                )}
              </div>

              {/* Name (editable) + creator avatars */}
              <div className="flex flex-col min-w-0 flex-1">
                <NameCell
                  name={artifact.artifact_name}
                  onCommit={(name) => handleUpdateArtifact(artifact.id, { artifact_name: name })}
                />
                <div className="flex items-center gap-1 mt-0.5">
                  {isNative && (
                    <div className="h-4 w-4 rounded-full overflow-hidden border border-white/80 shrink-0">
                      <Image
                        src="/lusia-symbol.png"
                        alt="LUSIA"
                        width={16}
                        height={16}
                        className="object-cover"
                      />
                    </div>
                  )}
                  {user?.avatar_url && (
                    <div
                      className={cn(
                        "h-4 w-4 rounded-full overflow-hidden border border-white/80 shrink-0",
                        isNative && "-ml-1",
                      )}
                    >
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
        size: 200,
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
        size: 100,
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
          <span className="text-xs text-brand-primary/40">
            {formatDate(row.original.updated_at ?? row.original.created_at)}
          </span>
        ),
        size: 110,
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
        cell: ({ row }) => (
          <RowActions row={row} onDelete={onDelete} onOpenQuiz={onOpenQuiz} />
        ),
        size: 52,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.avatar_url, user?.display_name, onDelete, onOpenQuiz, handleUpdateArtifact, catalog, nameColumnWidth],
  );

  // ─── table instance ───────────────────────────────────────────────────────

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    state: { sorting, pagination, columnFilters, columnVisibility },
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
                        <span>{t.icon}</span>
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
        className="flex-1 min-h-0 rounded-xl border border-brand-primary/8 bg-white overflow-auto transition-[border-color] duration-300"
        style={activeSubject?.color ? { borderColor: `${activeSubject.color}55` } : undefined}
      >
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-white">
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
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-brand-primary/5 hover:bg-brand-primary/[0.02] data-[state=selected]:bg-brand-primary/5"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5 last:py-0">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
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
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── pagination ── */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Rows per page */}
          <div className="flex items-center gap-2">
            <Label htmlFor={id} className="text-xs text-muted-foreground whitespace-nowrap">
              Por página
            </Label>
            <Select
              value={table.getState().pagination.pageSize.toString()}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger id={id} className="h-7 w-fit text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 15, 25, 50].map((size) => (
                  <SelectItem key={size} value={size.toString()} className="text-xs">
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Page info */}
          <p className="text-xs text-muted-foreground whitespace-nowrap" aria-live="polite">
            <span className="text-foreground">
              {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
              {Math.min(
                table.getState().pagination.pageIndex * table.getState().pagination.pageSize +
                  table.getState().pagination.pageSize,
                table.getRowCount(),
              )}
            </span>{" "}
            de <span className="text-foreground">{table.getRowCount()}</span>
          </p>

          {/* Pagination buttons */}
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.firstPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Primeira página"
                >
                  <ChevronFirst size={13} strokeWidth={2} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={13} strokeWidth={2} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Próxima página"
                >
                  <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.lastPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Última página"
                >
                  <ChevronLast size={13} strokeWidth={2} aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}

// ─── NameCell ─────────────────────────────────────────────────────────────────

function NameCell({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when artifact name changes from outside
  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
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
      className="text-sm font-medium text-brand-primary cursor-text rounded px-0.5 -mx-0.5 hover:bg-brand-primary/5 transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Clique para renomear"
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none transition-all duration-100 ease-out",
        onClick && "cursor-pointer active:translate-y-px active:[border-bottom-width:1.5px]",
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: c }} />
      {name}
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
        className="cursor-pointer flex flex-wrap gap-1 py-0.5 rounded px-1 -mx-1 hover:bg-brand-primary/[0.03] transition-colors"
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

function RowActions({
  row,
  onDelete,
  onOpenQuiz,
}: {
  row: Row<Artifact>;
  onDelete: (id: string) => void;
  onOpenQuiz: (id: string) => void;
}) {
  const artifact = row.original;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex justify-end">
          <Button size="icon" variant="ghost" className="h-7 w-7 shadow-none" aria-label="Ações">
            <Ellipsis size={15} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          {artifact.artifact_type === "quiz" && (
            <DropdownMenuItem onClick={() => onOpenQuiz(artifact.id)}>
              <span>Abrir</span>
              <DropdownMenuShortcut>↵</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
            <ClipboardList className="mr-2 h-3.5 w-3.5 opacity-60" />
            <span>Atribuir</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
            <Sparkles className="mr-2 h-3.5 w-3.5 opacity-60" />
            <span>Melhorar com IA</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
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
