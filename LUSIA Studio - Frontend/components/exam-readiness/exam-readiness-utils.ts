import type {
  ExamBlueprintRow,
  TopicSummaryL1Row,
  TopicSummaryL2Row,
  TopicYearMatrixL2Row,
  TopicYearMatrixRow,
} from "@/lib/exam-readiness";

/** One exam instance for presence chips (year + optional phase). */
export interface ExamInstanceRef {
  year: number;
  phase: string | null;
}

/** Recharts flat treemap leaf: `code` is curriculum L1 (not shown in chart, used for interactions). */
export interface TreemapTopicLeaf {
  name: string;
  value: number;
  code: string;
  /** Satisfies Recharts `TreemapDataType` index signature. */
  [key: string]: unknown;
}

export function topicDisplayLabel(row: TopicSummaryL1Row): string {
  const t = row.topic_label?.trim();
  if (t) return t;
  return row.curriculum_code_l1;
}

/**
 * Extracts L1 curriculum codes from `exam_blueprint.top_l1_topics`.
 * Shape varies in the wild (array of strings, objects, JSON string, or record keys) — treat defensively.
 */
export function parseBlueprintTopicCodes(blueprint: ExamBlueprintRow): string[] {
  const raw = blueprint.top_l1_topics;
  if (raw == null) return [];

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(s);
        return parseBlueprintTopicCodes({ ...blueprint, top_l1_topics: parsed } as ExamBlueprintRow);
      } catch {
        return s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
      }
    }
    return s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  }

  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === "string") {
        out.push(item);
        continue;
      }
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const c = o.code ?? o.curriculum_code_l1 ?? o.curriculum_code ?? o.id;
        if (typeof c === "string") out.push(c);
      }
    }
    return out;
  }

  if (typeof raw === "object") {
    return Object.keys(raw as Record<string, unknown>);
  }

  return [];
}

export function topicCodeMatchesBlueprintEntry(topicCode: string, blueprintEntry: string): boolean {
  if (blueprintEntry === topicCode) return true;
  if (blueprintEntry.startsWith(`${topicCode}.`) || blueprintEntry.startsWith(`${topicCode}:`)) {
    return true;
  }
  return false;
}

export function abbreviateExamPhase(phase: string | null | undefined): string | null {
  if (phase == null || !String(phase).trim()) return null;
  const p = phase.toLowerCase();
  if (/\b1\b|primeira|1\.?ª/.test(p) && /fase|época/.test(p)) return "1f";
  if (/\b2\b|segunda|2\.?ª/.test(p) && /fase|época/.test(p)) return "2f";
  if (/recurso/.test(p)) return "rec";
  return phase.replace(/\s+/g, " ").trim().slice(0, 8);
}

export function shortExamLabel(ref: ExamInstanceRef): string {
  const ph = abbreviateExamPhase(ref.phase);
  if (ph) return `${ref.year}·${ph}`;
  return String(ref.year);
}

export function formatExamPresenceTooltip(refs: ExamInstanceRef[]): string {
  if (refs.length === 0) return "";
  return refs.map(shortExamLabel).join(", ");
}

function dedupeExamInstances(refs: ExamInstanceRef[]): ExamInstanceRef[] {
  const seen = new Set<string>();
  const out: ExamInstanceRef[] = [];
  for (const r of refs) {
    const k = `${r.year}|${r.phase ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * Per-topic exam presence: prefer blueprint rows (year + phase) when `top_l1_topics` matches;
 * otherwise fall back to matrix years with points > 0.
 */
export function topicExamPresence(
  topicCode: string,
  blueprints: ExamBlueprintRow[],
  matrix: TopicYearMatrixRow[],
): ExamInstanceRef[] {
  const fromBlueprints: ExamInstanceRef[] = [];
  for (const b of blueprints) {
    const y = b.exam_year;
    if (y == null) continue;
    const codes = parseBlueprintTopicCodes(b);
    const hit = codes.some((c) => topicCodeMatchesBlueprintEntry(topicCode, c));
    if (!hit) continue;
    fromBlueprints.push({ year: y, phase: b.exam_phase ?? null });
  }

  if (fromBlueprints.length > 0) {
    return dedupeExamInstances(fromBlueprints);
  }

  const fromMatrix: ExamInstanceRef[] = [];
  for (const r of matrix) {
    if (r.curriculum_code_l1 !== topicCode) continue;
    if (r.exam_year == null) continue;
    const pts = Number(r.total_points ?? 0);
    if (pts <= 0) continue;
    fromMatrix.push({ year: r.exam_year, phase: null });
  }
  fromMatrix.sort((a, b) => b.year - a.year);
  return dedupeExamInstances(fromMatrix);
}

export function buildTreemapData(rows: TopicSummaryL1Row[]): TreemapTopicLeaf[] {
  return rows.map((row) => {
    const pts = Number(row.total_points ?? 0);
    const qs = Number(row.question_count ?? 0);
    const value = pts > 0 ? pts : qs > 0 ? Math.max(qs, 0.5) : 0.5;
    return {
      name: topicDisplayLabel(row),
      value,
      code: row.curriculum_code_l1,
    };
  });
}

/** Sort topics for the ranking table (weight, then exam presence, then questions). */
export function rankTopicSummaryRows(rows: TopicSummaryL1Row[]): TopicSummaryL1Row[] {
  return [...rows].sort((a, b) => {
    const pa = Number(a.total_points ?? 0);
    const pb = Number(b.total_points ?? 0);
    if (pb !== pa) return pb - pa;
    const ea = Number(a.exam_count ?? 0);
    const eb = Number(b.exam_count ?? 0);
    if (eb !== ea) return eb - ea;
    const qa = Number(a.question_count ?? 0);
    const qb = Number(b.question_count ?? 0);
    return qb - qa;
  });
}

export function humanizeAggregateKey(key: string): string {
  const map: Record<string, string> = {
    escolha_multipla: "Escolha múltipla",
    resposta_aberta: "Resposta aberta",
    verdadeiro_falso: "Verdadeiro / falso",
    associacao: "Associação",
    preenchimento: "Preenchimento",
  };
  const k = key.trim();
  if (map[k]) return map[k];
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function topicPriorityLabel(row: TopicSummaryL1Row): string {
  const exams = row.exam_count ?? 0;
  const pts = Number(row.total_points ?? 0);
  const fy = row.first_year;
  const ly = row.last_year;
  const span = fy != null && ly != null ? ly - fy + 1 : 0;
  let yearsN = 0;
  if (Array.isArray(row.years_present)) {
    yearsN = row.years_present.length;
  }

  const stable = span >= 4 || yearsN >= 4;
  const heavy = pts >= 40;
  const recurring = exams >= 5;

  if (stable && recurring && heavy) return "Tema central de alto peso";
  if (stable && recurring) return "Tema central recorrente";
  if (recurring && heavy) return "Recorrente com peso elevado";
  if (heavy) return "Peso elevado no exame";
  if (recurring) return "Presença frequente";
  if (stable) return "Estável ao longo dos anos";
  return "Tema de apoio ou ocasional";
}

export function formatCountMap(
  m: Record<string, unknown> | null | undefined,
  max = 4,
): { key: string; value: number }[] {
  if (!m || typeof m !== "object") return [];
  return Object.entries(m)
    .map(([key, v]) => ({
      key,
      value: typeof v === "number" ? v : Number(v) || 0,
    }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, max);
}

export function yearSpanFromSummary(rows: TopicSummaryL1Row[]): string | null {
  let minY: number | null = null;
  let maxY: number | null = null;
  for (const r of rows) {
    if (r.first_year != null) {
      minY = minY == null ? r.first_year : Math.min(minY, r.first_year);
    }
    if (r.last_year != null) {
      maxY = maxY == null ? r.last_year : Math.max(maxY, r.last_year);
    }
  }
  if (minY == null || maxY == null) return null;
  return `${minY}–${maxY}`;
}

export function topTopicsForMatrix(
  matrix: TopicYearMatrixRow[],
  n: number,
): { code: string; label: string; total: number }[] {
  const totals = new Map<string, { label: string; total: number }>();
  for (const r of matrix) {
    if (r.exam_year == null) continue;
    const code = r.curriculum_code_l1;
    const prev = totals.get(code) ?? { label: r.topic_label || code, total: 0 };
    prev.total += Number(r.total_points ?? 0);
    if (r.topic_label) prev.label = r.topic_label;
    totals.set(code, prev);
  }
  return [...totals.entries()]
    .map(([code, v]) => ({ code, label: v.label, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

export function pivotMatrixForChart(
  matrix: TopicYearMatrixRow[],
  topicCodes: string[],
): { year: string; [k: string]: number | string }[] {
  const years = [
    ...new Set(
      matrix.map((r) => r.exam_year).filter((y): y is number => y != null),
    ),
  ].sort((a, b) => a - b);

  return years.map((y) => {
    const row: { year: string; [k: string]: number | string } = { year: String(y) };
    for (const code of topicCodes) {
      const hit = matrix.find((m) => m.exam_year === y && m.curriculum_code_l1 === code);
      row[code] = hit ? Number(hit.total_points ?? 0) : 0;
    }
    return row;
  });
}

export function aggregateBlueprintStats(blueprints: ExamBlueprintRow[]): {
  avgQuestions: number | null;
  avgPoints: number | null;
  n: number;
  mergedTypes: { key: string; value: number }[];
  mergedStructures: { key: string; value: number }[];
} {
  if (!blueprints.length) {
    return { avgQuestions: null, avgPoints: null, n: 0, mergedTypes: [], mergedStructures: [] };
  }
  let qSum = 0;
  let pSum = 0;
  const typeAcc = new Map<string, number>();
  const structAcc = new Map<string, number>();
  for (const b of blueprints) {
    const qc = b.question_count;
    if (typeof qc === "number") qSum += qc;
    const tp = b.total_points;
    if (typeof tp === "number") pSum += tp;
    const qt = b.question_type_counts;
    if (qt && typeof qt === "object") {
      for (const [k, v] of Object.entries(qt)) {
        const n = typeof v === "number" ? v : Number(v) || 0;
        typeAcc.set(k, (typeAcc.get(k) ?? 0) + n);
      }
    }
    const sc = b.structure_counts;
    if (sc && typeof sc === "object") {
      for (const [k, v] of Object.entries(sc)) {
        const n = typeof v === "number" ? v : Number(v) || 0;
        structAcc.set(k, (structAcc.get(k) ?? 0) + n);
      }
    }
  }
  const n = blueprints.length;
  const mergedTypes = [...typeAcc.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const mergedStructures = [...structAcc.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  return {
    avgQuestions: n ? Math.round((qSum / n) * 10) / 10 : null,
    avgPoints: n ? Math.round((pSum / n) * 10) / 10 : null,
    n,
    mergedTypes,
    mergedStructures,
  };
}

export function stabilityBucket(row: TopicSummaryL1Row): "estável" | "recente" | "baixa_frequência" {
  const exams = row.exam_count ?? 0;
  const fy = row.first_year;
  const ly = row.last_year;
  const span = fy != null && ly != null ? ly - fy + 1 : 0;
  if (exams >= 5 && span >= 3) return "estável";
  if (exams <= 2) return "baixa_frequência";
  return "recente";
}

export function topicL2DisplayLabel(row: TopicSummaryL2Row): string {
  const t = row.topic_l2_label?.trim();
  if (t) return t;
  return row.curriculum_code_l2;
}

/** `share_within_l1` may be 0–1 ratio or 0–100 percent depending on pipeline. */
export function formatShareWithinL1(v: unknown): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n >= 0 && n <= 1) return `${Math.round(n * 1000) / 10}%`;
  return `${Math.round(n * 10) / 10}%`;
}

export function topTopicsL2ForMatrix(
  matrix: TopicYearMatrixL2Row[],
  n: number,
): { code: string; label: string; total: number }[] {
  const totals = new Map<string, { label: string; total: number }>();
  for (const r of matrix) {
    if (r.exam_year == null) continue;
    const code = r.curriculum_code_l2;
    const prev = totals.get(code) ?? { label: r.topic_l2_label || code, total: 0 };
    prev.total += Number(r.total_points ?? 0);
    if (r.topic_l2_label) prev.label = r.topic_l2_label;
    totals.set(code, prev);
  }
  return [...totals.entries()]
    .map(([code, v]) => ({ code, label: v.label, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

export function pivotMatrixL2ForChart(
  matrix: TopicYearMatrixL2Row[],
  l2Codes: string[],
  metric: "total_points" | "avg_points_per_exam" = "avg_points_per_exam",
): { year: string; [k: string]: number | string }[] {
  const years = [
    ...new Set(
      matrix.map((r) => r.exam_year).filter((y): y is number => y != null),
    ),
  ].sort((a, b) => a - b);

  return years.map((y) => {
    const row: { year: string; [k: string]: number | string } = { year: String(y) };
    for (const code of l2Codes) {
      const hit = matrix.find((m) => m.exam_year === y && m.curriculum_code_l2 === code);
      const v =
        metric === "avg_points_per_exam"
          ? hit?.avg_points_per_exam
          : hit?.total_points;
      row[code] = v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
    }
    return row;
  });
}
