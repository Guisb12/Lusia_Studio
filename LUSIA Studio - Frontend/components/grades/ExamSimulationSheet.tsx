"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { X, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubjectCFD } from "@/lib/grades";
import {
  calculateCFD,
  calculateCFS,
  convertExamGrade,
} from "@/lib/grades/calculations";
import type { CFDInput } from "@/lib/grades/calculations";
import {
  EXAM_WEIGHT_POST_2023,
  getSafeMinimumRaw,
} from "@/lib/grades/exam-config";

// ── Types ──────────────────────────────────────────────────

interface ExamSimulationSheetProps {
  cfd: SubjectCFD;
  allCfds: SubjectCFD[];
  cohortYear: number | null;
  onClose: () => void;
}

interface SimulationRow {
  examRaw: number;
  examGrade20: number;
  cfdGrade: number;
  delta: number; // cfdGrade - cifGrade
  isCurrent: boolean;
}

// ── Component ──────────────────────────────────────────────

export function ExamSimulationSheet({
  cfd,
  allCfds,
  cohortYear,
  onClose,
}: ExamSimulationSheetProps) {
  const cifGrade = cfd.cif_grade;
  const currentExamRaw = cfd.exam_grade_raw;
  const safeMinRaw = getSafeMinimumRaw(cifGrade);

  // Generate impact table rows
  const rows: SimulationRow[] = useMemo(() => {
    const intervals = [
      200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60,
      50,
    ];

    return intervals.map((raw) => {
      const { cfdGrade } = calculateCFD(cifGrade, raw, EXAM_WEIGHT_POST_2023);
      return {
        examRaw: raw,
        examGrade20: convertExamGrade(raw),
        cfdGrade,
        delta: cfdGrade - cifGrade,
        isCurrent: currentExamRaw === raw,
      };
    });
  }, [cifGrade, currentExamRaw]);

  // CFS impact for key scores
  const cfsImpactRows = useMemo(() => {
    const keyScores = [200, 175, 150, 130, 100];
    const baseCfds: CFDInput[] = allCfds.map((c) => ({
      cfdGrade: c.cfd_grade,
      durationYears: c.duration_years || 1,
      affectsCfs: c.affects_cfs ?? true,
    }));
    const currentCfs = calculateCFS(baseCfds, cohortYear);

    return keyScores.map((raw) => {
      const { cfdGrade: simCfdGrade } = calculateCFD(
        cifGrade,
        raw,
        EXAM_WEIGHT_POST_2023,
      );

      // Replace this subject's CFD in the list
      const simCfds: CFDInput[] = allCfds.map((c) => ({
        cfdGrade: c.subject_id === cfd.subject_id ? simCfdGrade : c.cfd_grade,
        durationYears: c.duration_years || 1,
        affectsCfs: c.affects_cfs ?? true,
      }));

      const simCfs = calculateCFS(simCfds, cohortYear);
      const cfsDelta =
        currentCfs.cfsValue !== null && simCfs.cfsValue !== null
          ? simCfs.cfsValue - currentCfs.cfsValue
          : null;

      return {
        examRaw: raw,
        cfsValue: simCfs.cfsValue,
        dgesValue: simCfs.dgesValue,
        cfsDelta,
      };
    });
  }, [cifGrade, cfd.subject_id, allCfds, cohortYear]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-brand-primary/5 px-5 py-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-instrument text-xl text-brand-primary">
                Simulação
              </h2>
              <p className="text-sm text-brand-primary/50">
                {cfd.subject_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center hover:bg-brand-primary/[0.08] transition-colors"
            >
              <X className="h-4 w-4 text-brand-primary/50" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-6">
          {/* CIF display */}
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 px-4 py-3 flex-1">
              <div className="text-[10px] text-brand-primary/40 uppercase tracking-wider">
                Média Interna (CIF)
              </div>
              <div className="text-2xl font-bold text-brand-primary">
                {cifGrade}
              </div>
            </div>
            {currentExamRaw !== null && (
              <div className="rounded-xl bg-brand-accent/[0.05] border border-brand-accent/10 px-4 py-3 flex-1">
                <div className="text-[10px] text-brand-accent/60 uppercase tracking-wider">
                  Nota do Exame
                </div>
                <div className="text-2xl font-bold text-brand-accent">
                  {currentExamRaw}/200
                </div>
              </div>
            )}
          </div>

          {/* Safe minimum banner */}
          <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-brand-primary/30 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-brand-primary/50">
              Para manter ou melhorar a nota, precisas de pelo menos{" "}
              <strong className="text-brand-primary/70">
                {safeMinRaw}/200
              </strong>{" "}
              ({convertExamGrade(safeMinRaw)}/20) no exame.
            </p>
          </div>

          {/* Impact table */}
          <div>
            <h3 className="text-xs font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider mb-2">
              Impacto na nota final (CFD)
            </h3>
            <div className="rounded-xl border border-brand-primary/5 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-brand-primary/[0.02]">
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-brand-primary/50 uppercase">
                      Exame
                    </th>
                    <th className="px-3 py-2 text-center text-[11px] font-medium text-brand-primary/50 uppercase">
                      CFD
                    </th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-brand-primary/50 uppercase">
                      Variação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-primary/5">
                  {rows.map((row) => (
                    <tr
                      key={row.examRaw}
                      className={cn(
                        "transition-colors",
                        row.isCurrent && "bg-brand-accent/[0.05]",
                        row.examRaw === safeMinRaw && !row.isCurrent && "bg-brand-primary/[0.02]",
                      )}
                    >
                      <td className="px-3 py-1.5">
                        <span className="text-sm font-medium text-brand-primary">
                          {row.examRaw}
                        </span>
                        <span className="text-xs text-brand-primary/30 ml-1">
                          ({row.examGrade20})
                        </span>
                        {row.isCurrent && (
                          <span className="ml-1.5 text-[10px] text-brand-accent font-medium">
                            atual
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span
                          className={cn(
                            "text-sm font-bold",
                            row.delta > 0
                              ? "text-brand-success"
                              : row.delta < 0
                                ? "text-brand-error"
                                : "text-brand-primary",
                          )}
                        >
                          {row.cfdGrade}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <DeltaBadge delta={row.delta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CFS Impact */}
          {cfsImpactRows.some((r) => r.cfsValue !== null) && (
            <div>
              <h3 className="text-xs font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider mb-2">
                Impacto na Média Final (CFS)
              </h3>
              <div className="space-y-1.5">
                {cfsImpactRows.map((row) => (
                  <div
                    key={row.examRaw}
                    className="flex items-center justify-between rounded-lg bg-brand-primary/[0.02] px-3 py-2"
                  >
                    <span className="text-sm text-brand-primary/60">
                      Se tirares{" "}
                      <strong className="text-brand-primary">{row.examRaw}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-brand-primary">
                        {row.cfsValue !== null ? row.cfsValue.toFixed(1) : "—"}
                      </span>
                      {row.dgesValue !== null && (
                        <span className="text-xs text-brand-primary/30">
                          ({row.dgesValue})
                        </span>
                      )}
                      {row.cfsDelta !== null && (
                        <CfsDeltaBadge delta={row.cfsDelta} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-brand-primary/30">
        <Minus className="h-3 w-3" />
        =
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-brand-success font-medium">
        <TrendingUp className="h-3 w-3" />
        +{delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-brand-error font-medium">
      <TrendingDown className="h-3 w-3" />
      {delta}
    </span>
  );
}

function CfsDeltaBadge({ delta }: { delta: number }) {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return null;
  if (rounded > 0) {
    return (
      <span className="text-[10px] text-brand-success font-medium">
        +{rounded.toFixed(1)}
      </span>
    );
  }
  return (
    <span className="text-[10px] text-brand-error font-medium">
      {rounded.toFixed(1)}
    </span>
  );
}
