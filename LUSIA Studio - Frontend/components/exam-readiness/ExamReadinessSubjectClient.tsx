"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ExamReadinessSubjectPayload,
  ExamEvidenceItem,
  ExamReadinessL1DrilldownPayload,
  TopicSummaryL1Row,
} from "@/lib/exam-readiness";
import { fetchExamEvidence, fetchExamReadinessL2Insights } from "@/lib/exam-readiness";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReadinessEmptyState, ReadinessPillCard } from "./ExamReadinessPrimitives";
import {
  aggregateBlueprintStats,
  buildTreemapData,
  formatExamPresenceTooltip,
  formatShareWithinL1,
  humanizeAggregateKey,
  pivotMatrixL2ForChart,
  rankTopicSummaryRows,
  shortExamLabel,
  topicDisplayLabel,
  topicExamPresence,
  topicL2DisplayLabel,
  topTopicsL2ForMatrix,
  type TreemapTopicLeaf,
} from "./exam-readiness-utils";

const TREEMAP_COLORS = [
  "#15316b",
  "#3b5bdb",
  "#12b886",
  "#fd7e14",
  "#7950f2",
  "#e64980",
  "#20c997",
  "#fab005",
];
const VISIBLE_EXAM_CHIPS = 5;
const PT_NUM = new Intl.NumberFormat("pt-PT");

function formatAvgPointsPerExam(v: unknown): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return PT_NUM.format(Math.round(n * 10) / 10);
}

function sortExamsNewestFirst(refs: { year: number; phase: string | null }[]): typeof refs {
  return [...refs].sort((a, b) => b.year - a.year || String(a.phase ?? "").localeCompare(String(b.phase ?? "")));
}

function truncateTopicTitle(name: string, maxLen: number): string {
  const t = name.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** Hide outside labels for very small slices to reduce clutter (Recharts `percent` is 0–1). */
const PIE_LABEL_MIN_PERCENT = 0.05;

const PIE_RAD = Math.PI / 180;

/** Same convention as Recharts `polarToCartesian` (degrees, 0° = +x). */
function piePolarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  return {
    x: cx + Math.cos(-PIE_RAD * angleDeg) * radius,
    y: cy + Math.sin(-PIE_RAD * angleDeg) * radius,
  };
}

/**
 * Callout: segment only **outside** the ring (no line through the hole). Direction follows the slice
 * bisector (same radial as centre → mid). Text anchor is offset along that ray past the arrow tip.
 */
function getPieCalloutGeometry(props: {
  cx?: unknown;
  cy?: unknown;
  outerRadius?: unknown;
  startAngle?: unknown;
  endAngle?: unknown;
  midAngle?: unknown;
  index?: unknown;
  percent?: unknown;
}): {
  p0: { x: number; y: number };
  pLabel: { x: number; y: number };
  textAnchor: "start" | "end" | "middle";
  x: number;
  y: number;
} | null {
  const frac = props.percent;
  if (frac != null && typeof frac === "number" && frac < PIE_LABEL_MIN_PERCENT) return null;

  const cx = Number(props.cx);
  const cy = Number(props.cy);
  const or = Number(props.outerRadius);
  if (![cx, cy, or].every((n) => Number.isFinite(n))) return null;

  const midExplicit = Number(props.midAngle);
  const start = Number(props.startAngle);
  const end = Number(props.endAngle);
  const mid = Number.isFinite(midExplicit)
    ? midExplicit
    : Number.isFinite(start) && Number.isFinite(end)
      ? (start + end) / 2
      : NaN;
  if (!Number.isFinite(mid)) return null;

  const idx = typeof props.index === "number" ? props.index : 0;
  const spokeLen = 16 + (idx % 4) * 5;
  const pastTip = 3;

  const p0 = piePolarToCartesian(cx, cy, or, mid);
  const pLabel = piePolarToCartesian(cx, cy, or + spokeLen, mid);

  const ux = Math.cos(-PIE_RAD * mid);
  const uy = Math.sin(-PIE_RAD * mid);
  const ax = pLabel.x + ux * pastTip;
  const ay = pLabel.y + uy * pastTip;

  const horizDominant = Math.abs(ux) >= Math.abs(uy);
  const textAnchor: "start" | "end" | "middle" = horizDominant
    ? ux >= 0
      ? "start"
      : "end"
    : "middle";

  return {
    p0,
    pLabel,
    textAnchor,
    x: ax,
    y: ay,
  };
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Title + subtitle colours: use slice hue; darken light fills for legibility on pale UI background. */
function pieLabelTextColors(fill: string): { title: string; subtitle: string } {
  const rgb = parseHexColor(fill);
  if (!rgb) {
    return { title: "rgb(21,49,107)", subtitle: "rgba(21,49,107,0.58)" };
  }
  const lum = relativeLuminance(rgb.r, rgb.g, rgb.b);
  if (lum > 0.62) {
    const t = 0.42;
    const r = Math.round(rgb.r * (1 - t));
    const g = Math.round(rgb.g * (1 - t));
    const b = Math.round(rgb.b * (1 - t));
    return {
      title: `rgb(${r},${g},${b})`,
      subtitle: `rgba(${r},${g},${b},0.72)`,
    };
  }
  return {
    title: fill,
    subtitle: `rgba(${rgb.r},${rgb.g},${rgb.b},0.72)`,
  };
}

function TopicWeightChartTooltip({
  active,
  payload,
  totalPoints,
  summaryByCode,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  totalPoints: number;
  summaryByCode: Map<string, TopicSummaryL1Row>;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.payload;
  const leaf = raw && typeof raw === "object" ? (raw as TreemapTopicLeaf) : null;
  if (!leaf?.name) return null;
  const pts = Number(leaf.value ?? 0);
  const pct = totalPoints > 0 ? Math.round((pts / totalPoints) * 1000) / 10 : null;
  const row = leaf.code ? summaryByCode.get(leaf.code) : undefined;
  const avgLine = formatAvgPointsPerExam(row?.avg_points_per_exam);
  return (
    <div className="max-w-[240px] rounded-lg border border-brand-primary/12 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium leading-snug text-brand-primary">{leaf.name}</p>
      <p className="mt-1.5 tabular-nums leading-snug text-brand-primary/70">
        {pct != null ? (
          <span>{PT_NUM.format(pct)}% do conjunto</span>
        ) : (
          <span>—</span>
        )}
        {avgLine !== "—" ? (
          <span>
            {" "}
            · {avgLine} pts / prova <span className="text-brand-primary/50">(média)</span>
          </span>
        ) : null}
      </p>
    </div>
  );
}

interface ExamReadinessSubjectClientProps {
  subjectSlug: string;
  initialData: ExamReadinessSubjectPayload;
}

export function ExamReadinessSubjectClient({
  subjectSlug,
  initialData,
}: ExamReadinessSubjectClientProps) {
  const { topic_summary, topic_year_matrix, blueprints } = initialData;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<{
    l1Code: string;
    displayLabel: string;
    l2Code: string | null;
  } | null>(null);
  const [evidence, setEvidence] = useState<ExamEvidenceItem[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const [expandedL1Code, setExpandedL1Code] = useState<string | null>(null);
  const [l2Data, setL2Data] = useState<ExamReadinessL1DrilldownPayload | null>(null);
  const [l2Loading, setL2Loading] = useState(false);
  const [l2Error, setL2Error] = useState<string | null>(null);

  const rankedTopics = useMemo(() => rankTopicSummaryRows(topic_summary), [topic_summary]);

  const topicWeightSlices = useMemo(() => buildTreemapData(rankedTopics), [rankedTopics]);
  const topicWeightTotal = useMemo(
    () => topicWeightSlices.reduce((s, d) => s + Number(d.value ?? 0), 0),
    [topicWeightSlices],
  );
  const summaryByCode = useMemo(() => {
    const m = new Map<string, TopicSummaryL1Row>();
    for (const r of rankedTopics) {
      m.set(r.curriculum_code_l1, r);
    }
    return m;
  }, [rankedTopics]);

  const blueprintAgg = useMemo(() => aggregateBlueprintStats(blueprints), [blueprints]);

  const presenceByCode = useMemo(() => {
    const m = new Map<string, ReturnType<typeof topicExamPresence>>();
    for (const row of rankedTopics) {
      const code = row.curriculum_code_l1;
      m.set(code, topicExamPresence(code, blueprints, topic_year_matrix));
    }
    return m;
  }, [rankedTopics, blueprints, topic_year_matrix]);

  useEffect(() => {
    if (!expandedL1Code) {
      setL2Data(null);
      setL2Error(null);
      setL2Loading(false);
      return;
    }
    let cancelled = false;
    setL2Data(null);
    setL2Error(null);
    setL2Loading(true);
    fetchExamReadinessL2Insights(subjectSlug, expandedL1Code)
      .then((data) => {
        if (!cancelled && data.curriculum_code_l1 === expandedL1Code) {
          setL2Data(data);
        }
      })
      .catch(() => {
        if (!cancelled) setL2Error("Não foi possível carregar subtemas.");
      })
      .finally(() => {
        if (!cancelled) setL2Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedL1Code, subjectSlug]);

  const openEvidence = useCallback(
    async (l1Code: string, displayLabel: string, l2Code: string | null) => {
      setSelectedTopic({ l1Code, displayLabel, l2Code });
      setSheetOpen(true);
      setEvidenceLoading(true);
      setEvidenceError(null);
      setEvidence([]);
      try {
        const res = await fetchExamEvidence(subjectSlug, l1Code, {
          limit: 20,
          curriculumCodeL2: l2Code || undefined,
        });
        setEvidence(res.items);
      } catch {
        setEvidenceError("Não foi possível carregar as questões de exemplo.");
      } finally {
        setEvidenceLoading(false);
      }
    },
    [subjectSlug],
  );

  const handleTopicWeightSelect = useCallback((leaf: TreemapTopicLeaf) => {
    const code = leaf.code;
    if (!code) return;
    setHighlightCode(code);
    setExpandedL1Code((prev) => (prev === code ? null : code));
    const el = document.getElementById(`exam-topic-row-${code}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const pieArrowMarkerId = `exam-pie-arrow-${useId().replace(/:/g, "")}`;

  const renderPieLabelLine = useCallback(
    (lineProps: PieLabelRenderProps) => {
      const geom = getPieCalloutGeometry(lineProps);
      if (!geom) return <g />;
      const idx = typeof lineProps.index === "number" ? lineProps.index : 0;
      const stroke = TREEMAP_COLORS[idx % TREEMAP_COLORS.length];
      const markerId = `${pieArrowMarkerId}-${idx % TREEMAP_COLORS.length}`;
      const { p0, pLabel } = geom;
      return (
        <path
          d={`M${p0.x},${p0.y}L${pLabel.x},${pLabel.y}`}
          stroke={stroke}
          strokeOpacity={0.88}
          strokeWidth={1}
          fill="none"
          markerEnd={`url(#${markerId})`}
        />
      );
    },
    [pieArrowMarkerId],
  );

  const renderPieLabel = useCallback(
    (props: PieLabelRenderProps) => {
      const geom = getPieCalloutGeometry(props);
      if (!geom) return null;
      const { x, y, textAnchor } = geom;
      const src = props as TreemapTopicLeaf & PieLabelRenderProps;
      const code = typeof src.code === "string" ? src.code : undefined;
      const nameRaw = typeof src.name === "string" ? src.name : "";
      const name = truncateTopicTitle(nameRaw, 24);
      const val = Number(src.value ?? 0);
      const row = code ? summaryByCode.get(code) : undefined;
      const pctShare =
        topicWeightTotal > 0 ? Math.round((val / topicWeightTotal) * 1000) / 10 : null;
      const avg = formatAvgPointsPerExam(row?.avg_points_per_exam);
      const subtitle =
        pctShare != null && avg !== "—"
          ? `${PT_NUM.format(pctShare)}% · ${avg} pts/prova`
          : pctShare != null
            ? `${PT_NUM.format(pctShare)}%`
            : avg !== "—"
              ? `${avg} pts/prova`
              : "";

      const idx = typeof props.index === "number" ? props.index : 0;
      const sliceFill =
        typeof props.fill === "string" && /^#/.test(props.fill)
          ? props.fill
          : TREEMAP_COLORS[idx % TREEMAP_COLORS.length];
      const { title, subtitle: subFill } = pieLabelTextColors(sliceFill);

      const fs1 = 9.5;
      const fs2 = 8.25;

      return (
        <text
          x={x}
          y={y}
          textAnchor={textAnchor}
          dominantBaseline="central"
          fill={title}
          style={{ pointerEvents: "none" }}
        >
          <tspan x={x} dy={subtitle ? -5 : 0} fontSize={fs1} fontWeight={600}>
            {name}
          </tspan>
          {subtitle ? (
            <tspan x={x} dy={11} fontSize={fs2} fontWeight={500} fill={subFill}>
              {subtitle}
            </tspan>
          ) : null}
        </text>
      );
    },
    [summaryByCode, topicWeightTotal],
  );

  const panoramaBody =
    topic_summary.length === 0 ? (
      <ReadinessEmptyState>
        Ainda não há resumo por tópico para esta disciplina. Quando os agregados estiverem disponíveis,
        o panorama aparece aqui.
      </ReadinessEmptyState>
    ) : (
      <div className="grid gap-4 lg:h-[min(72vh,620px)] lg:grid-cols-[minmax(280px,46%)_1fr] lg:items-stretch">
          <div className="order-2 flex h-full min-h-[min(52vh,480px)] flex-col overflow-visible lg:order-1 lg:min-h-0">
              <div className="flex h-full min-h-[min(48vh,440px)] w-full flex-1 overflow-visible lg:min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 36, right: 40, bottom: 36, left: 40 }}>
                    <defs>
                      {TREEMAP_COLORS.map((c, i) => (
                        <marker
                          key={`${pieArrowMarkerId}-m${i}`}
                          id={`${pieArrowMarkerId}-${i}`}
                          markerWidth={5}
                          markerHeight={5}
                          refX={4.25}
                          refY={2.5}
                          orient="auto"
                          markerUnits="strokeWidth"
                        >
                          <path d="M0,0 L5,2.5 L0,5 L1.2,2.5 z" fill={c} fillOpacity={0.9} />
                        </marker>
                      ))}
                    </defs>
                    <Pie
                      data={topicWeightSlices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="40%"
                      outerRadius="70%"
                      paddingAngle={1.25}
                      cornerRadius={4}
                      strokeWidth={2}
                      stroke="rgb(255,255,255)"
                      isAnimationActive={false}
                      label={renderPieLabel}
                      labelLine={renderPieLabelLine}
                      onClick={(data) => {
                        if (!data || typeof data !== "object") return;
                        const maybe =
                          "code" in data && typeof (data as TreemapTopicLeaf).code === "string"
                            ? (data as TreemapTopicLeaf)
                            : "payload" in data &&
                                data.payload &&
                                typeof data.payload === "object" &&
                                "code" in data.payload
                              ? (data.payload as TreemapTopicLeaf)
                              : null;
                        if (maybe?.code) handleTopicWeightSelect(maybe);
                      }}
                    >
                      {topicWeightSlices.map((slice, index) => (
                        <Cell
                          key={slice.code}
                          fill={TREEMAP_COLORS[index % TREEMAP_COLORS.length]}
                          stroke={
                            highlightCode === slice.code
                              ? "rgb(21,49,107)"
                              : "rgb(255,255,255)"
                          }
                          strokeWidth={highlightCode === slice.code ? 3 : 2}
                          className="outline-none transition-[stroke,stroke-width] duration-150"
                          style={{ cursor: "pointer" }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <TopicWeightChartTooltip
                          totalPoints={topicWeightTotal}
                          summaryByCode={summaryByCode}
                        />
                      }
                      cursor={false}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
          </div>

          <div className="order-1 flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-brand-primary/8 bg-white lg:order-2">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto overflow-x-hidden [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand-primary/15">
                <table
                  className="w-full table-fixed caption-bottom text-sm"
                  aria-label="Classificação de temas nos exames nacionais"
                >
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col />
                    <col style={{ width: 48 }} />
                    <col style={{ width: 76 }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: 44 }} />
                  </colgroup>
                  <TableHeader className="sticky top-0 z-10 bg-white [box-shadow:inset_0_-1px_0_0_rgba(13,47,127,0.12)]">
                    <TableRow className="border-brand-primary/8 hover:bg-transparent">
                      <TableHead className="h-10 px-2 text-center text-xs font-medium text-brand-primary/50">
                        #
                      </TableHead>
                      <TableHead className="h-10 px-2 text-left text-xs font-medium text-brand-primary/50">
                        Tema
                      </TableHead>
                      <TableHead className="h-10 px-1.5 text-right text-xs font-medium text-brand-primary/50">
                        Q.
                      </TableHead>
                      <TableHead className="h-10 px-1.5 text-right text-xs font-medium text-brand-primary/50">
                        Média
                      </TableHead>
                      <TableHead className="h-10 px-2 text-left text-xs font-medium text-brand-primary/50">
                        Provas
                      </TableHead>
                      <TableHead className="h-10 px-1 text-right text-xs font-medium text-brand-primary/50">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                {rankedTopics.map((row, index) => {
                  const code = row.curriculum_code_l1;
                  const label = topicDisplayLabel(row);
                  const examsRaw = presenceByCode.get(code) ?? [];
                  const exams = sortExamsNewestFirst(examsRaw);
                  const visible = exams.slice(0, VISIBLE_EXAM_CHIPS);
                  const rest = exams.length - visible.length;
                  const tip = formatExamPresenceTooltip(exams);
                  const highlighted = highlightCode === code;
                  const rank = index + 1;
                  const sliceColor = TREEMAP_COLORS[index % TREEMAP_COLORS.length];
                  const nQuestions =
                    row.question_count != null ? PT_NUM.format(row.question_count) : "—";
                  const avgPerExam = formatAvgPointsPerExam(row.avg_points_per_exam);
                  const isExpanded = expandedL1Code === code;
                  const l2Ready = l2Data?.curriculum_code_l1 === code;
                  const topL2ForChart = l2Ready
                    ? topTopicsL2ForMatrix(l2Data.topic_year_matrix_l2, 5)
                    : [];
                  const chartRows =
                    l2Ready && topL2ForChart.length > 0
                      ? pivotMatrixL2ForChart(
                          l2Data.topic_year_matrix_l2,
                          topL2ForChart.map((t) => t.code),
                        )
                      : [];
                  return (
                    <Fragment key={code}>
                    <TableRow
                      id={`exam-topic-row-${code}`}
                      aria-expanded={isExpanded}
                      aria-label={`#${rank} ${label}, ${nQuestions} questões, média ${avgPerExam} pontos por prova`}
                      className={cn(
                        "border-brand-primary/5 transition-colors hover:bg-brand-primary/[0.02]",
                        highlighted && "bg-brand-accent/[0.06]",
                      )}
                      style={{
                        borderLeftWidth: 3,
                        borderLeftStyle: "solid",
                        borderLeftColor: sliceColor,
                      }}
                    >
                      <TableCell className="overflow-hidden py-2 px-2 text-center align-middle">
                        <span
                          title="Ordem"
                          className="inline-flex h-7 min-w-[1.5rem] items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums"
                          style={{
                            backgroundColor: `${sliceColor}20`,
                            color: sliceColor,
                          }}
                        >
                          {rank}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-0 overflow-hidden py-2 px-2 align-middle">
                        <span
                          className="block truncate font-medium leading-snug text-brand-primary"
                          title={label}
                        >
                          {label}
                        </span>
                      </TableCell>
                      <TableCell
                        className="overflow-hidden py-2 px-1.5 text-right align-middle tabular-nums text-brand-primary"
                        title="Número total de questões"
                      >
                        <span className="text-sm font-medium">{nQuestions}</span>
                      </TableCell>
                      <TableCell
                        className="overflow-hidden py-2 px-1.5 text-right align-middle tabular-nums text-brand-primary"
                        title="Peso médio por prova (pontos)"
                      >
                        <span className="text-sm font-medium">{avgPerExam}</span>
                        <span className="text-xs font-normal text-brand-primary/45"> pts</span>
                      </TableCell>
                      <TableCell className="min-w-0 overflow-hidden py-2 px-2 align-middle">
                        {exams.length === 0 ? (
                          <span className="text-sm text-brand-primary/30">—</span>
                        ) : (
                          <div
                            className="flex flex-wrap gap-1"
                            title={tip}
                            aria-label={tip ? `Últimas provas: ${tip}` : undefined}
                          >
                            {visible.map((ref) => (
                              <span
                                key={`${code}-${ref.year}-${ref.phase ?? ""}`}
                                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums leading-tight sm:text-[11px]"
                                style={{
                                  backgroundColor: `${sliceColor}14`,
                                  color: "rgb(21,49,107)",
                                }}
                              >
                                {shortExamLabel(ref)}
                              </span>
                            ))}
                            {rest > 0 ? (
                              <span
                                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-brand-primary/80 leading-tight sm:text-[11px]"
                                style={{ backgroundColor: `${sliceColor}22` }}
                              >
                                +{rest}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="overflow-hidden py-1.5 pl-0 pr-1 text-right align-middle">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0 text-brand-primary hover:bg-brand-primary/[0.06]"
                              aria-label={`Ações · ${label}`}
                            >
                              <Ellipsis className="h-4 w-4 opacity-70" strokeWidth={2} aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-44 border-brand-primary/10">
                            <DropdownMenuItem
                              className="cursor-pointer font-medium text-brand-primary focus:bg-brand-primary/[0.04]"
                              onClick={() =>
                                setExpandedL1Code((prev) => (prev === code ? null : code))
                              }
                            >
                              {isExpanded ? "Fechar subtemas" : "Ver subtemas"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer font-medium text-brand-primary focus:bg-brand-primary/[0.04]"
                              onClick={() => openEvidence(code, label, null)}
                            >
                              Questões de exemplo
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow className="border-brand-primary/5 hover:bg-transparent">
                        <TableCell
                          colSpan={6}
                          className="border-b border-brand-primary/5 bg-brand-primary/[0.02] p-0 px-4 py-4 sm:px-5"
                        >
                        {l2Loading && (
                          <p className="text-sm text-brand-primary/50">A carregar subtemas…</p>
                        )}
                        {l2Error && !l2Loading && (
                          <p className="text-sm text-red-600">{l2Error}</p>
                        )}
                        {!l2Loading && !l2Error && l2Ready && (
                          <div className="space-y-4">
                            {chartRows.length > 0 ? (
                              <div>
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-brand-primary/45">
                                  Média de pontos por prova, por ano (subtemas principais)
                                </p>
                                <div className="h-52 w-full min-w-0">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                      data={chartRows}
                                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                                    >
                                      <CartesianGrid
                                        strokeDasharray="3 3"
                                        className="stroke-brand-primary/10"
                                      />
                                      <XAxis
                                        dataKey="year"
                                        tick={{ fontSize: 11, fill: "rgba(21,49,107,0.45)" }}
                                      />
                                      <YAxis
                                        tick={{ fontSize: 11, fill: "rgba(21,49,107,0.45)" }}
                                        width={36}
                                      />
                                      <Tooltip
                                        contentStyle={{
                                          borderRadius: 8,
                                          border: "1px solid rgba(21,49,107,0.12)",
                                          fontSize: 12,
                                        }}
                                      />
                                      <Legend
                                        wrapperStyle={{ fontSize: 11 }}
                                        formatter={(value) => {
                                          const hit = topL2ForChart.find((t) => t.code === value);
                                          return hit?.label ?? value;
                                        }}
                                      />
                                      {topL2ForChart.map((t, i) => (
                                        <Line
                                          key={t.code}
                                          type="monotone"
                                          dataKey={t.code}
                                          name={t.label}
                                          stroke={TREEMAP_COLORS[i % TREEMAP_COLORS.length]}
                                          strokeWidth={2}
                                          dot={false}
                                        />
                                      ))}
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            ) : null}
                            {l2Data.topic_summary_l2.length === 0 ? (
                              <p className="text-sm text-brand-primary/55">
                                Ainda não há subdivisão agregada para este tema. Use «Exemplos (tema)»
                                para ver questões ao nível do tema completo.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-brand-primary/45">
                                  Subtemas
                                </p>
                                <ul className="divide-y divide-brand-primary/[0.08] rounded-lg border border-brand-primary/[0.1] bg-white/80">
                                  {l2Data.topic_summary_l2.map((l2) => {
                                    const l2Label = topicL2DisplayLabel(l2);
                                    return (
                                      <li
                                        key={l2.curriculum_code_l2}
                                        className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium text-brand-primary">
                                            {l2Label}
                                          </p>
                                          <p className="mt-0.5 text-[11px] tabular-nums text-brand-primary/45">
                                            <span title="Parte do tema (L1)">
                                              {formatShareWithinL1(l2.share_within_l1)} do tema
                                            </span>
                                            {l2.question_count != null && (
                                              <>
                                                {" · "}
                                                {PT_NUM.format(l2.question_count)} questões
                                              </>
                                            )}
                                            {l2.avg_points_per_exam != null && (
                                              <>
                                                {" · "}
                                                {formatAvgPointsPerExam(l2.avg_points_per_exam)} pts
                                                / prova (média)
                                              </>
                                            )}
                                          </p>
                                        </div>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-9 shrink-0 border-brand-primary/15 text-brand-primary"
                                          onClick={() =>
                                            openEvidence(code, `${label} · ${l2Label}`, l2.curriculum_code_l2)
                                          }
                                        >
                                          Exemplos
                                        </Button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                        </TableCell>
                      </TableRow>
                    ) : null}
                    </Fragment>
                  );
                })}
                </TableBody>
                </table>
              </div>
            </div>
          </div>
      </div>
    );

  const estruturaBody =
    blueprints.length === 0 ? (
      <ReadinessEmptyState>
        Sem dados agregados de estrutura de prova para esta disciplina.
      </ReadinessEmptyState>
    ) : (
      <ReadinessPillCard innerClassName="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-brand-primary/[0.08] bg-brand-primary/[0.02] px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-brand-primary/40">
              Questões (média)
            </p>
            <p className="text-lg font-semibold tabular-nums text-brand-primary">
              {blueprintAgg.avgQuestions != null ? PT_NUM.format(blueprintAgg.avgQuestions) : "—"}
            </p>
          </div>
          <div className="rounded-md border border-brand-primary/[0.08] bg-brand-primary/[0.02] px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-brand-primary/40">
              Pontos (média)
            </p>
            <p className="text-lg font-semibold tabular-nums text-brand-primary">
              {blueprintAgg.avgPoints != null ? PT_NUM.format(blueprintAgg.avgPoints) : "—"}
            </p>
          </div>
          <div className="rounded-md border border-brand-primary/[0.08] bg-brand-primary/[0.02] px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-brand-primary/40">
              Provas analisadas
            </p>
            <p className="text-lg font-semibold tabular-nums text-brand-primary">
              {PT_NUM.format(blueprintAgg.n)}
            </p>
          </div>
        </div>
        {blueprintAgg.mergedTypes.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-brand-primary/55">Tipos de questão (agregado)</p>
            <ul className="flex flex-wrap gap-1.5">
              {blueprintAgg.mergedTypes.map((t) => (
                <li
                  key={t.key}
                  className="rounded-md bg-brand-primary/[0.06] px-2.5 py-1 text-xs text-brand-primary/85"
                >
                  {humanizeAggregateKey(t.key)} · {PT_NUM.format(t.value)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {blueprintAgg.mergedStructures.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-brand-primary/55">Estrutura (agregado)</p>
            <ul className="flex flex-wrap gap-1.5">
              {blueprintAgg.mergedStructures.map((t) => (
                <li
                  key={t.key}
                  className="rounded-md bg-brand-accent/10 px-2.5 py-1 text-xs text-brand-primary"
                >
                  {humanizeAggregateKey(t.key)} · {PT_NUM.format(t.value)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-xs font-medium text-brand-primary/55">Provas recentes</p>
          <ul className="divide-y divide-brand-primary/[0.06] rounded-md border border-brand-primary/[0.08]">
            {blueprints.slice(0, 12).map((b, i) => (
              <li
                key={`${b.exam_id ?? "exam"}-${b.exam_year ?? i}-${b.exam_phase ?? ""}`}
                className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span className="font-medium text-brand-primary">
                  {b.exam_year ?? "—"}
                  {b.exam_phase ? ` · ${b.exam_phase}` : ""}
                </span>
                <span className="text-xs tabular-nums text-brand-primary/50">
                  {b.question_count ?? "—"} questões · {b.total_points ?? "—"} pts
                </span>
              </li>
            ))}
          </ul>
        </div>
      </ReadinessPillCard>
    );

  return (
    <div className="animate-fade-in-up space-y-4">
      <Tabs defaultValue="panorama" className="w-full">
        <TabsList className="mb-1 inline-flex h-9 w-full max-w-md rounded-lg bg-brand-primary/[0.06] p-1 text-brand-primary/65 sm:w-auto">
          <TabsTrigger
            value="panorama"
            className="flex-1 rounded-md px-3 text-sm data-[state=active]:bg-white data-[state=active]:text-brand-primary data-[state=active]:shadow-sm sm:flex-none"
          >
            Panorama
          </TabsTrigger>
          <TabsTrigger
            value="estrutura"
            className="flex-1 rounded-md px-3 text-sm data-[state=active]:bg-white data-[state=active]:text-brand-primary data-[state=active]:shadow-sm sm:flex-none"
          >
            Estrutura da prova
          </TabsTrigger>
        </TabsList>
        <TabsContent value="panorama" className="mt-4 focus-visible:outline-none">
          {panoramaBody}
        </TabsContent>
        <TabsContent value="estrutura" className="mt-4 focus-visible:outline-none">
          {estruturaBody}
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-brand-primary/10 bg-[#f6f3ef] sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle className="text-left font-instrument text-xl font-normal text-brand-primary">
              Evidência · {selectedTopic?.displayLabel}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Questões de exemplo e extractos dos critérios de correção.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {evidenceLoading && (
              <p className="text-sm text-brand-primary/50">A carregar exemplos…</p>
            )}
            {evidenceError && <p className="text-sm text-red-600">{evidenceError}</p>}
            {!evidenceLoading && !evidenceError && evidence.length === 0 && (
              <p className="text-sm text-brand-primary/50">
                Nenhuma questão encontrada com estes códigos de currículo.
              </p>
            )}
            {evidence.map((item) => (
              <article
                key={item.id}
                className={cn("rounded-lg border border-brand-primary/10 bg-white p-4 shadow-sm")}
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-brand-primary/45">
                  <span>{item.exam_year ?? "—"}</span>
                  {item.exam_phase && <span>· {item.exam_phase}</span>}
                  <span>· {item.type.replace(/_/g, " ")}</span>
                  {item.points != null && <span>· {item.points} pts</span>}
                </div>
                {item.label && (
                  <p className="mt-1 text-xs font-medium text-brand-primary">{item.label}</p>
                )}
                {item.question_preview && (
                  <p className="mt-2 text-sm leading-relaxed text-brand-primary">
                    {item.question_preview}
                  </p>
                )}
                {item.criteria_preview && (
                  <div className="mt-3 border-t border-brand-primary/10 pt-3">
                    <p className="text-xs leading-relaxed text-brand-primary/70">
                      {item.criteria_preview}
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
