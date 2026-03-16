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

/**
 * From the 2025 admission cycle there was still a transitional 12.º-year cohort
 * using the legacy simple mean. The weighted course average applies from the
 * 2026 graduation cohort onward.
 */
export const WEIGHTED_CFS_START_COHORT = 2026;

export function usesWeightedCfsFormula(cohortYear: number | null): boolean {
  return cohortYear !== null && cohortYear >= WEIGHTED_CFS_START_COHORT;
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
  weight_percentage: number | string | null;
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
 *
 * If weight_percentage is null for all elements, equal weight is used.
 */
export function calculatePeriodGrade(elements: ElementInput[]): PeriodGradeResult {
  if (elements.length === 0) {
    return { rawCalculated: null, calculatedGrade: null, isComplete: false, gradedCount: 0, totalCount: 0 };
  }

  const graded = elements.filter((e) => e.raw_grade !== null && e.raw_grade !== undefined);

  if (graded.length === 0) {
    return { rawCalculated: null, calculatedGrade: null, isComplete: false, gradedCount: 0, totalCount: elements.length };
  }

  const hasWeights = graded.some((e) => e.weight_percentage !== null && e.weight_percentage !== undefined);

  let raw: Decimal;
  if (hasWeights) {
    raw = new Decimal(0);
    for (const e of graded) {
      const w = e.weight_percentage ?? 0;
      raw = raw.plus(
        new Decimal(e.raw_grade!).times(new Decimal(w)).div(100),
      );
    }
  } else {
    // Equal weight: simple average
    let sum = new Decimal(0);
    for (const e of graded) {
      sum = sum.plus(new Decimal(e.raw_grade!));
    }
    raw = sum.div(graded.length);
  }

  return {
    rawCalculated: raw.toNumber(),
    calculatedGrade: roundHalfUp(raw),
    isComplete: graded.length === elements.length,
    gradedCount: graded.length,
    totalCount: elements.length,
  };
}

// ── Algorithm A2: Domain-Weighted Period Own Grade ───────────

export interface DomainGradeInput {
  /** Weight of this domain for the target period (e.g. 80 for 80%) */
  periodWeight: number;
  /** Elements in this domain for the target period */
  elements: {
    weightPercentage: number | null; // null = equal weight
    rawGrade: number | null;
  }[];
}

export interface CumulativePeriodDetailInput {
  ownRaw: number | null;
  ownGrade: number | null;
}

export interface CumulativePeriodDetail {
  cumulativeRaw: number | null;
  cumulativeGrade: number | null;
}

/**
 * Calculate period "own" grade using domain weights.
 * For each domain: compute element average (equal or weighted), then
 * period_own = SUM(domain.periodWeight/100 × domain_avg)
 */
export function calculateDomainPeriodGrade(
  domains: DomainGradeInput[],
): PeriodGradeResult {
  const allElements = domains.flatMap((d) => d.elements);
  if (allElements.length === 0) {
    return { rawCalculated: null, calculatedGrade: null, isComplete: false, gradedCount: 0, totalCount: 0 };
  }

  const totalCount = allElements.length;
  const gradedCount = allElements.filter((e) => e.rawGrade !== null).length;

  if (gradedCount === 0) {
    return { rawCalculated: null, calculatedGrade: null, isComplete: false, gradedCount: 0, totalCount };
  }

  let raw = new Decimal(0);
  for (const domain of domains) {
    if (new Decimal(domain.periodWeight).isZero()) continue;

    const gradedElements = domain.elements.filter((e) => e.rawGrade !== null);
    if (gradedElements.length === 0) continue;

    let domainAvg: Decimal;
    const hasCustomWeights = gradedElements.some((e) => e.weightPercentage !== null);

    if (hasCustomWeights) {
      // Weighted average within domain (custom weights sum to 100%)
      domainAvg = new Decimal(0);
      for (const e of gradedElements) {
        const w = e.weightPercentage ?? 0;
        domainAvg = domainAvg.plus(
          new Decimal(e.rawGrade!).times(new Decimal(w)).div(100),
        );
      }
    } else {
      // Equal weight: simple average
      let sum = new Decimal(0);
      for (const e of gradedElements) {
        sum = sum.plus(new Decimal(e.rawGrade!));
      }
      domainAvg = sum.div(gradedElements.length);
    }

    raw = raw.plus(domainAvg.times(new Decimal(domain.periodWeight)).div(100));
  }

  return {
    rawCalculated: raw.toNumber(),
    calculatedGrade: roundHalfUp(raw),
    isComplete: gradedCount === totalCount,
    gradedCount,
    totalCount,
  };
}

// ── Cumulative Period Grades ─────────────────────────────────

/**
 * Calculate cumulative grades for all periods given their own grades and the weight matrix.
 *
 * @param ownGrades - Own grade per period (index 0 = P1), null if not yet computed
 * @param cumulativeWeights - Matrix e.g. [[100],[40,60],[25,30,45]]; each row sums to 100
 * @returns Cumulative grade per period (null if own grade is null)
 */
export function calculateCumulativeGrades(
  ownGrades: (number | null)[],
  cumulativeWeights: number[][],
): (number | null)[] {
  const result: (number | null)[] = [];

  for (let p = 0; p < ownGrades.length; p++) {
    const row = cumulativeWeights[p];
    if (!row || ownGrades[p] === null) {
      result.push(null);
      continue;
    }

    let cumul = new Decimal(0);
    let allAvailable = true;

    for (let i = 0; i < row.length; i++) {
      const weight = new Decimal(row[i]);
      if (weight.isZero()) continue;

      if (i < p) {
        // Reference a previous cumulative grade
        if (result[i] === null) {
          allAvailable = false;
          break;
        }
        cumul = cumul.plus(new Decimal(result[i]!).times(weight).div(100));
      } else {
        // Last entry = own grade for this period
        cumul = cumul.plus(new Decimal(ownGrades[p]!).times(weight).div(100));
      }
    }

    result.push(allAvailable ? cumul.toNumber() : null);
  }

  return result;
}

export function calculateCumulativeGradeDetails(
  periods: CumulativePeriodDetailInput[],
  cumulativeWeights: number[][],
): CumulativePeriodDetail[] {
  const details: CumulativePeriodDetail[] = [];

  for (let periodIndex = 0; periodIndex < periods.length; periodIndex++) {
    const row = cumulativeWeights[periodIndex];
    const own = periods[periodIndex];
    if (!row || own?.ownRaw === null || own?.ownGrade === null) {
      details.push({ cumulativeRaw: null, cumulativeGrade: null });
      continue;
    }

    let cumulativeRaw = new Decimal(0);
    let allAvailable = true;

    for (let weightIndex = 0; weightIndex < row.length; weightIndex++) {
      const weight = new Decimal(row[weightIndex] ?? 0);
      if (weight.isZero()) {
        continue;
      }

      if (weightIndex < periodIndex) {
        const previous = details[weightIndex];
        if (previous?.cumulativeRaw === null || previous?.cumulativeRaw === undefined) {
          allAvailable = false;
          break;
        }
        cumulativeRaw = cumulativeRaw.plus(
          new Decimal(previous.cumulativeRaw).times(weight).div(100),
        );
        continue;
      }

      cumulativeRaw = cumulativeRaw.plus(
        new Decimal(own.ownRaw).times(weight).div(100),
      );
    }

    details.push(
      allAvailable
        ? {
            cumulativeRaw: cumulativeRaw.toNumber(),
            cumulativeGrade: roundHalfUp(cumulativeRaw),
          }
        : {
            cumulativeRaw: null,
            cumulativeGrade: null,
          },
    );
  }

  return details;
}

/**
 * Calculate annual grade from cumulative grades.
 * When cumulative mode is on, annual = last period's cumulative grade.
 */
export function calculateCumulativeAnnualGrade(
  cumulativeGrades: (number | null)[],
): AnnualGradeResult {
  const lastGrade = cumulativeGrades[cumulativeGrades.length - 1];
  if (lastGrade === null || lastGrade === undefined) {
    return { rawAnnual: null, annualGrade: null, isComplete: false };
  }
  return {
    rawAnnual: lastGrade,
    annualGrade: roundHalfUp(lastGrade),
    isComplete: true,
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
 * Calculate annual grade from the final period pauta grade.
 * The final period's visible/final grade is the annual grade.
 */
export function calculateAnnualGrade(
  periods: PeriodInput[],
  _weights: (number | string)[],
): AnnualGradeResult {
  if (periods.length === 0 || periods.length !== _weights.length) {
    return { rawAnnual: null, annualGrade: null, isComplete: false };
  }

  const finalPeriod = periods[periods.length - 1];
  if (finalPeriod?.pautaGrade === null || finalPeriod?.pautaGrade === undefined) {
    return { rawAnnual: null, annualGrade: null, isComplete: false };
  }

  return {
    rawAnnual: finalPeriod.pautaGrade,
    annualGrade: finalPeriod.pautaGrade,
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

  const useWeighted = usesWeightedCfsFormula(cohortYear);

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
 * Formula: CFD = Annual Grade × (100 - examWeight)% + Exam Level × examWeight%
 *
 * @param annualGrade - Annual grade on 1-5 scale
 * @param examLevel - Exam converted level (1-5), or null if no exam
 * @param examWeight - Editable exam weight percentage (defaults to 30)
 * @returns CFD on 1-5 scale (rounded half-up)
 */
export function calculateBasicoCFD(
  annualGrade: number,
  examLevel: number | null,
  examWeight = 30,
): { cfdRaw: number; cfdGrade: number } {
  if (examLevel === null) {
    return { cfdRaw: annualGrade, cfdGrade: annualGrade };
  }

  const internalWeight = new Decimal(100).minus(examWeight);
  const cfdRaw = new Decimal(annualGrade)
    .times(internalWeight)
    .plus(new Decimal(examLevel).times(examWeight))
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
