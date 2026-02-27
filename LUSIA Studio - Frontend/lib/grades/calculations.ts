/**
 * Grade calculation utilities using decimal.js for precision.
 *
 * All grade calculations MUST use Decimal to avoid floating-point errors
 * that could cause incorrect rounding at critical thresholds (e.g. 9.5 → 10 vs 9.4 → 9).
 */

import Decimal from "decimal.js";

// Configure decimal.js for our use case
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ── Rounding Primitives ─────────────────────────────────────

/**
 * Standard arithmetic rounding (half-up) to integer.
 * Used for pauta grades, CIF, CFD.
 * Examples: 13.4 → 13, 13.5 → 14, 9.5 → 10
 */
export function roundHalfUp(value: Decimal | number | string): number {
  return new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Truncate to 1 decimal place — NEVER round up.
 * Used exclusively for CFS computation.
 * Examples: 14.68 → 14.6, 14.99 → 14.9
 */
export function truncateToOneDecimal(value: Decimal | number | string): number {
  const d = new Decimal(value);
  return d.toDecimalPlaces(1, Decimal.ROUND_DOWN).toNumber();
}

// ── Grade Scales ────────────────────────────────────────────

export const QUALITATIVE_GRADES = [
  "Muito Insuficiente",
  "Insuficiente",
  "Suficiente",
  "Bom",
  "Muito Bom",
] as const;

export type QualitativeGrade = (typeof QUALITATIVE_GRADES)[number];

export function getGradeScale(educationLevel: string): {
  min: number;
  max: number;
  passing: number;
  isQualitative: boolean;
} {
  switch (educationLevel) {
    case "basico_1_ciclo":
      return { min: 0, max: 4, passing: 2, isQualitative: true };
    case "basico_2_ciclo":
    case "basico_3_ciclo":
      return { min: 1, max: 5, passing: 3, isQualitative: false };
    case "secundario":
      return { min: 0, max: 20, passing: 10, isQualitative: false };
    default:
      return { min: 0, max: 20, passing: 10, isQualitative: false };
  }
}

export function isPassingGrade(
  grade: number,
  educationLevel: string,
): boolean {
  const scale = getGradeScale(educationLevel);
  return grade >= scale.passing;
}

/**
 * Check if a grade is at a critical rounding boundary (within 0.5 of pass/fail).
 */
export function isNearBoundary(
  rawGrade: number | string,
  educationLevel: string,
): boolean {
  const scale = getGradeScale(educationLevel);
  const d = new Decimal(rawGrade);
  const diff = d.minus(scale.passing).abs();
  return diff.lte(new Decimal("0.5"));
}

// ── Algorithm A: Period Grade from Elements ─────────────────

export interface ElementInput {
  weight_percentage: number | string;
  raw_grade: number | string | null;
}

export interface PeriodGradeResult {
  rawCalculated: number | null;
  calculatedGrade: number | null;
  isComplete: boolean;
  gradedCount: number;
  totalCount: number;
}

/**
 * Calculate period grade from evaluation elements.
 * raw_calculated = SUM(element.raw_grade × element.weight_percentage / 100)
 */
export function calculatePeriodGrade(elements: ElementInput[]): PeriodGradeResult {
  if (elements.length === 0) {
    return { rawCalculated: null, calculatedGrade: null, isComplete: false, gradedCount: 0, totalCount: 0 };
  }

  const graded = elements.filter((e) => e.raw_grade !== null && e.raw_grade !== undefined);

  if (graded.length === 0) {
    return { rawCalculated: null, calculatedGrade: null, isComplete: false, gradedCount: 0, totalCount: elements.length };
  }

  let raw = new Decimal(0);
  for (const e of graded) {
    raw = raw.plus(
      new Decimal(e.raw_grade!).times(new Decimal(e.weight_percentage)).div(100),
    );
  }

  return {
    rawCalculated: raw.toNumber(),
    calculatedGrade: roundHalfUp(raw),
    isComplete: graded.length === elements.length,
    gradedCount: graded.length,
    totalCount: elements.length,
  };
}

// ── Algorithm B: Annual Grade (CAF) ─────────────────────────

export interface PeriodInput {
  pautaGrade: number | null;
}

export interface AnnualGradeResult {
  rawAnnual: number | null;
  annualGrade: number | null;
  isComplete: boolean;
}

/**
 * Calculate annual grade from weighted period grades.
 * raw_annual = SUM(pauta_grade[i] × weight[i] / 100)
 */
export function calculateAnnualGrade(
  periods: PeriodInput[],
  weights: (number | string)[],
): AnnualGradeResult {
  if (periods.length === 0 || periods.length !== weights.length) {
    return { rawAnnual: null, annualGrade: null, isComplete: false };
  }

  if (!periods.every((p) => p.pautaGrade !== null && p.pautaGrade !== undefined)) {
    return { rawAnnual: null, annualGrade: null, isComplete: false };
  }

  let raw = new Decimal(0);
  for (let i = 0; i < periods.length; i++) {
    raw = raw.plus(
      new Decimal(periods[i].pautaGrade!).times(new Decimal(weights[i])).div(100),
    );
  }

  return {
    rawAnnual: raw.toNumber(),
    annualGrade: roundHalfUp(raw),
    isComplete: true,
  };
}

// ── Algorithm C: CIF (Multi-Year Average) ───────────────────

export function calculateCIF(annualGrades: number[]): {
  cifRaw: number;
  cifGrade: number;
} {
  if (annualGrades.length === 0) {
    return { cifRaw: 0, cifGrade: 0 };
  }

  let total = new Decimal(0);
  for (const g of annualGrades) {
    total = total.plus(new Decimal(g));
  }
  const cifRaw = total.div(annualGrades.length);

  return {
    cifRaw: cifRaw.toNumber(),
    cifGrade: roundHalfUp(cifRaw),
  };
}

// ── Algorithm D: CFD (CIF + Exam Blending) ──────────────────

/**
 * Calculate CFD (final grade) by blending CIF with exam score.
 *
 * @param cifGrade - Internal classification (0-20 integer)
 * @param examGradeRaw - Exam score on the 0-200 scale (raw IAVE result).
 *   CE = examGradeRaw / 10 (e.g. 145 → 14.5, no premature rounding).
 * @param examWeight - Exam weight as percentage (e.g. 25 for 25%)
 */
export function calculateCFD(
  cifGrade: number,
  examGradeRaw: number | null,
  examWeight: number | null,
): { cfdRaw: number; cfdGrade: number } {
  if (examGradeRaw === null || examWeight === null) {
    return { cfdRaw: cifGrade, cfdGrade: cifGrade };
  }

  const ce = new Decimal(examGradeRaw).div(10); // 145 → 14.5
  const internalWeight = new Decimal(100).minus(new Decimal(examWeight));
  const cfdRaw = new Decimal(cifGrade)
    .times(internalWeight)
    .plus(ce.times(new Decimal(examWeight)))
    .div(100);

  return {
    cfdRaw: cfdRaw.toNumber(),
    cfdGrade: roundHalfUp(cfdRaw),
  };
}

// ── Algorithm E: CFS (The GPA) ──────────────────────────────

export interface CFDInput {
  cfdGrade: number;
  durationYears: number;
  affectsCfs: boolean;
}

export function calculateCFS(
  cfds: CFDInput[],
  cohortYear: number | null,
): { cfsValue: number | null; dgesValue: number | null } {
  const eligible = cfds.filter((c) => c.affectsCfs);
  if (eligible.length === 0) {
    return { cfsValue: null, dgesValue: null };
  }

  const useWeighted = cohortYear !== null && cohortYear >= 2025;

  let cfsRaw: Decimal;

  if (useWeighted) {
    let numerator = new Decimal(0);
    let denominator = new Decimal(0);
    for (const c of eligible) {
      const dur = new Decimal(c.durationYears);
      numerator = numerator.plus(new Decimal(c.cfdGrade).times(dur));
      denominator = denominator.plus(dur);
    }
    if (denominator.isZero()) {
      return { cfsValue: null, dgesValue: null };
    }
    cfsRaw = numerator.div(denominator);
  } else {
    let total = new Decimal(0);
    for (const c of eligible) {
      total = total.plus(new Decimal(c.cfdGrade));
    }
    cfsRaw = total.div(eligible.length);
  }

  const cfsValue = truncateToOneDecimal(cfsRaw);
  const dgesValue = Math.round(cfsValue * 10);

  return { cfsValue, dgesValue };
}

// ── Exam Grade Conversion ───────────────────────────────────

/**
 * Convert national exam score from 0-200 scale to 0-20.
 */
export function convertExamGrade(rawScore: number): number {
  return roundHalfUp(new Decimal(rawScore).div(10));
}

// ── Básico 3º Ciclo: CFD (Annual + Prova Final) ────────────

/**
 * Calculate CFD for Básico 3º Ciclo (9th grade).
 * Formula: CFD = Annual Grade × 70% + Exam Level (1-5) × 30%
 *
 * @param annualGrade - Annual grade on 1-5 scale
 * @param examLevel - Exam converted level (1-5), or null if no exam
 * @returns CFD on 1-5 scale (rounded half-up)
 */
export function calculateBasicoCFD(
  annualGrade: number,
  examLevel: number | null,
): { cfdRaw: number; cfdGrade: number } {
  if (examLevel === null) {
    return { cfdRaw: annualGrade, cfdGrade: annualGrade };
  }

  const cfdRaw = new Decimal(annualGrade)
    .times(70)
    .plus(new Decimal(examLevel).times(30))
    .div(100);

  return {
    cfdRaw: cfdRaw.toNumber(),
    cfdGrade: roundHalfUp(cfdRaw),
  };
}

// ── Period Labels ───────────────────────────────────────────

export function getPeriodLabel(
  periodNumber: number,
  regime: "trimestral" | "semestral" | null,
): string {
  if (regime === "semestral") {
    return `${periodNumber}º Semestre`;
  }
  return `${periodNumber}º Período`;
}
