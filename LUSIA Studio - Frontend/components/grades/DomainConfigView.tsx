"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronLeft, Plus, Trash2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ELEMENT_TYPES,
  getElementTypeInfo,
  TRIMESTRAL_CUMULATIVE_PRESETS,
  SEMESTRAL_CUMULATIVE_PRESETS,
  type EvaluationDomain,
} from "@/lib/grades";
import { cn } from "@/lib/utils";

interface DomainConfigViewProps {
  domains: EvaluationDomain[];
  numPeriods: number;
  regime: "trimestral" | "semestral" | null;
  cumulativeWeights: number[][] | null;
  onDomainsChange: (domains: DomainConfigPayload[]) => void;
  onCumulativeWeightsChange: (weights: number[][] | null) => void;
  onBack: () => void;
  saving: boolean;
}

export interface DomainConfigPayload {
  domain_type: string;
  label: string;
  period_weights: number[];
  elements: {
    period_number: number;
    label: string;
    weight_percentage?: number | null;
    raw_grade?: number | null;
  }[];
}

function sanitizeNumericInput(value: string): string {
  let v = value.replace(",", ".");
  v = v.replace(/[^\d.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) {
    v = parts[0] + "." + parts.slice(1).join("");
  }
  return v;
}

interface LocalDomain {
  _key: number;
  domain_type: string;
  label: string;
  period_weights: string[];
  elements: LocalDomainElement[];
}

interface LocalDomainElement {
  _key: number;
  period_number: number;
  label: string;
  weight_percentage: number | null;
  raw_grade: number | null;
}

let nextKey = 1;

function fromApiDomains(domains: EvaluationDomain[], numPeriods: number): LocalDomain[] {
  return domains.map((d) => ({
    _key: nextKey++,
    domain_type: d.domain_type,
    label: d.label,
    period_weights: d.period_weights.map(String),
    elements: d.elements.map((e) => ({
      _key: nextKey++,
      period_number: e.period_number,
      label: e.label,
      weight_percentage: e.weight_percentage,
      raw_grade: e.raw_grade,
    })),
  }));
}

function toPayload(local: LocalDomain[]): DomainConfigPayload[] {
  return local.map((d) => ({
    domain_type: d.domain_type,
    label: d.label,
    period_weights: d.period_weights.map((w) => parseFloat(w) || 0),
    elements: d.elements.map((e) => ({
      period_number: e.period_number,
      label: e.label,
      weight_percentage: e.weight_percentage,
      raw_grade: e.raw_grade,
    })),
  }));
}

export function DomainConfigView({
  domains: initialDomains,
  numPeriods,
  regime,
  cumulativeWeights: initialCumulativeWeights,
  onDomainsChange,
  onCumulativeWeightsChange,
  onBack,
  saving,
}: DomainConfigViewProps) {
  const [local, setLocal] = useState<LocalDomain[]>(() =>
    fromApiDomains(initialDomains, numPeriods),
  );
  const [cumulativeLocal, setCumulativeLocal] = useState<string[][]>(() => {
    if (initialCumulativeWeights) return initialCumulativeWeights.map((row) => row.map(String));
    // Default to equal weights
    return Array.from({ length: numPeriods }, (_, i) => {
      const count = i + 1;
      const base = Math.floor((100 / count) * 100) / 100;
      const row = Array(count).fill(base);
      row[count - 1] = Math.round((100 - base * (count - 1)) * 100) / 100;
      return row.map(String);
    });
  });
  const [equalPeriods, setEqualPeriods] = useState(() => {
    if (!initialCumulativeWeights) return false;
    // Check if all values in each row are approximately equal (100/count each)
    return initialCumulativeWeights.every((row) => {
      const expected = 100 / row.length;
      return row.every((v) => Math.abs(v - expected) < 1);
    });
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localRef = useRef(local);
  const cumulativeRef = useRef(cumulativeLocal);
  localRef.current = local;
  cumulativeRef.current = cumulativeLocal;

  const periodLabel = (n: number) =>
    regime === "semestral" ? `${n}º Semestre` : `${n}º Período`;
  const periodLabelShort = (n: number) =>
    regime === "semestral" ? `${n}º Sem` : `${n}º Per`;

  const presets = regime === "semestral"
    ? SEMESTRAL_CUMULATIVE_PRESETS
    : TRIMESTRAL_CUMULATIVE_PRESETS;

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onDomainsChange(toPayload(localRef.current));
    }, 800);
  }, [onDomainsChange]);

  const scheduleCumulativeSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const parsed = cumulativeRef.current.map((row) => row.map((v) => parseFloat(v) || 0));
      onCumulativeWeightsChange(parsed);
    }, 800);
  }, [onCumulativeWeightsChange]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (initialDomains.length > 0) {
      setLocal(fromApiDomains(initialDomains, numPeriods));
    }
  }, [initialDomains, numPeriods]);

  useEffect(() => {
    if (initialCumulativeWeights) {
      setCumulativeLocal(initialCumulativeWeights.map((row) => row.map(String)));
    }
  }, [initialCumulativeWeights]);

  const updateDomainWeight = (domainIdx: number, periodIdx: number, value: string) => {
    setLocal((prev) =>
      prev.map((d, i) => {
        if (i !== domainIdx) return d;
        const weights = [...d.period_weights];
        weights[periodIdx] = sanitizeNumericInput(value);
        return { ...d, period_weights: weights };
      }),
    );
    scheduleSave();
  };

  const addDomain = () => {
    const usedTypes = new Set(local.map((d) => d.domain_type));
    const available = ELEMENT_TYPES.find((t) => !usedTypes.has(t.key)) ?? ELEMENT_TYPES[4];
    setLocal((prev) => [
      ...prev,
      {
        _key: nextKey++,
        domain_type: available.key,
        label: available.label,
        period_weights: Array(numPeriods).fill("0"),
        elements: [],
      },
    ]);
    scheduleSave();
  };

  const removeDomain = (idx: number) => {
    setLocal((prev) => prev.filter((_, i) => i !== idx));
    scheduleSave();
  };

  const addElement = (domainIdx: number, periodNumber: number) => {
    setLocal((prev) =>
      prev.map((d, i) => {
        if (i !== domainIdx) return d;
        const existing = d.elements.filter((e) => e.period_number === periodNumber);
        const newCount = existing.length + 1;
        return {
          ...d,
          elements: [
            ...d.elements,
            {
              _key: nextKey++,
              period_number: periodNumber,
              label: newCount === 1 ? d.label : `${d.label} ${newCount}`,
              weight_percentage: null,
              raw_grade: null,
            },
          ],
        };
      }),
    );
    scheduleSave();
  };

  const updateElementLabel = (domainIdx: number, elemKey: number, label: string) => {
    setLocal((prev) =>
      prev.map((d, i) => {
        if (i !== domainIdx) return d;
        return {
          ...d,
          elements: d.elements.map((e) =>
            e._key === elemKey ? { ...e, label } : e,
          ),
        };
      }),
    );
    scheduleSave();
  };

  const removeElement = (domainIdx: number, elemKey: number) => {
    setLocal((prev) =>
      prev.map((d, i) => {
        if (i !== domainIdx) return d;
        return {
          ...d,
          elements: d.elements.filter((e) => e._key !== elemKey),
        };
      }),
    );
    scheduleSave();
  };

  const columnSums = Array.from({ length: numPeriods }, (_, pIdx) =>
    local.reduce((sum, d) => sum + (parseFloat(d.period_weights[pIdx]) || 0), 0),
  );

  const updateCumulativeWeight = (rowIdx: number, colIdx: number, value: string) => {
    setEqualPeriods(false);
    setCumulativeLocal((prev) => {
      return prev.map((row, rIdx) => {
        if (rIdx !== rowIdx) return row;
        const newRow = [...row];
        newRow[colIdx] = sanitizeNumericInput(value);
        return newRow;
      });
    });
    scheduleCumulativeSave();
  };

  const applyEqualPeriods = (checked: boolean) => {
    setEqualPeriods(checked);
    if (checked) {
      const weights = Array.from({ length: numPeriods }, (_, i) => {
        const count = i + 1;
        const base = Math.floor((100 / count) * 100) / 100;
        const row = Array(count).fill(base);
        row[count - 1] = Math.round((100 - base * (count - 1)) * 100) / 100;
        return row;
      });
      setCumulativeLocal(weights.map((row) => row.map(String)));
      onCumulativeWeightsChange(weights);
    } else {
      const defaultPreset = presets[1] ?? presets[0];
      const weights = defaultPreset.weights.map((row) => [...row]);
      setCumulativeLocal(weights.map((row) => row.map(String)));
      onCumulativeWeightsChange(weights);
    }
  };


  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-brand-primary/5 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-brand-primary/50" />
        </button>
        <h3 className="text-sm font-semibold text-brand-primary">
          Configuração
        </h3>
        {saving && (
          <span className="text-[10px] text-brand-primary/30 ml-auto">
            A guardar...
          </span>
        )}
      </div>

      {/* ── Section 1: Domain weights ── */}
      <div>
        <h4 className="text-xs font-semibold text-brand-primary/50 uppercase tracking-wider mb-2">
          Pesos dos domínios
        </h4>

        <div className="space-y-2">
          {local.map((domain, dIdx) => {
            const info = getElementTypeInfo(domain.domain_type);
            const DIcon = info.icon;
            const totalElements = domain.elements.length;

            return (
              <div
                key={domain._key}
                className="rounded-xl border border-brand-primary/5 bg-white overflow-hidden"
              >
                {/* Domain header row */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-brand-primary/[0.04]">
                    <DIcon className="h-4 w-4 text-brand-primary/50" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-brand-primary">
                      {domain.label}
                    </div>
                    <div className="text-[10px] text-brand-primary/30">
                      {totalElements} {totalElements === 1 ? "elemento" : "elementos"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDomain(dIdx)}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-brand-primary/15 hover:text-brand-error hover:bg-brand-error/5 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Period weights + element counts */}
                <div
                  className="grid border-t border-brand-primary/5"
                  style={{ gridTemplateColumns: `repeat(${numPeriods}, 1fr)` }}
                >
                  {Array.from({ length: numPeriods }, (_, pIdx) => {
                    const pNum = pIdx + 1;
                    const periodElems = domain.elements.filter(
                      (e) => e.period_number === pNum,
                    );

                    return (
                      <div
                        key={pIdx}
                        className={cn(
                          "flex flex-col",
                          pIdx < numPeriods - 1 && "border-r border-brand-primary/5",
                        )}
                      >
                        {/* Period label + weight */}
                        <div className="flex flex-col items-center gap-1 px-2 py-2 bg-brand-primary/[0.02]">
                          <span className="text-[10px] text-brand-primary/30">
                            {periodLabelShort(pNum)}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={domain.period_weights[pIdx]}
                              onChange={(e) => updateDomainWeight(dIdx, pIdx, e.target.value)}
                              className="w-12 rounded-lg border border-brand-primary/10 px-1 py-1 text-center text-sm font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent transition-colors"
                            />
                            <span className="text-[10px] text-brand-primary/25">%</span>
                          </div>
                        </div>

                        {/* Element count with +/- */}
                        <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 border-t border-brand-primary/5">
                          <button
                            type="button"
                            onClick={() => {
                              if (periodElems.length > 0) {
                                removeElement(dIdx, periodElems[periodElems.length - 1]._key);
                              }
                            }}
                            disabled={periodElems.length === 0}
                            className="h-5 w-5 rounded-md flex items-center justify-center text-brand-primary/25 hover:text-brand-primary/60 hover:bg-brand-primary/5 transition-colors disabled:opacity-30"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-semibold text-brand-primary w-4 text-center">
                            {periodElems.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => addElement(dIdx, pNum)}
                            className="h-5 w-5 rounded-md flex items-center justify-center text-brand-primary/25 hover:text-brand-primary/60 hover:bg-brand-primary/5 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Element names */}
                        {periodElems.length > 0 && (
                          <div className="px-1.5 pb-2 space-y-0.5">
                            {periodElems.map((elem) => (
                              <div
                                key={elem._key}
                                className="flex items-center gap-1 rounded-md px-1 py-0.5 group hover:bg-brand-primary/[0.03] transition-colors"
                              >
                                <input
                                  type="text"
                                  value={elem.label}
                                  onChange={(e) => updateElementLabel(dIdx, elem._key, e.target.value)}
                                  className="flex-1 min-w-0 bg-transparent text-[10px] text-brand-primary/50 focus:text-brand-primary focus:outline-none truncate"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeElement(dIdx, elem._key)}
                                  className="h-3.5 w-3.5 rounded flex items-center justify-center text-brand-primary/0 group-hover:text-brand-primary/25 hover:!text-brand-error transition-colors shrink-0"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Column totals */}
        <div className="flex items-center justify-between px-1 pt-2">
          <span className="text-[10px] text-brand-primary/30">Total por período:</span>
          <div className="flex items-center gap-3">
            {columnSums.map((sum, i) => (
              <span
                key={i}
                className={cn(
                  "text-[10px] font-semibold",
                  Math.abs(sum - 100) < 0.01 ? "text-brand-success" : "text-brand-error",
                )}
              >
                {periodLabelShort(i + 1)} {sum.toFixed(0)}%
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={addDomain}
          className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-primary/10 px-3 py-2 text-xs text-brand-primary/40 hover:text-brand-primary/60 hover:border-brand-primary/20 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar domínio
        </button>
      </div>

      {/* ── Section 2: Cumulative weights ── */}
      <div>
        <h4 className="text-xs font-semibold text-brand-primary/50 uppercase tracking-wider mb-2">
          Pesos por período
        </h4>

        <div className="space-y-3">
            {/* Equal periods toggle */}
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                equalPeriods
                  ? "border-brand-accent/20 bg-brand-accent/5"
                  : "border-brand-primary/5 bg-white",
              )}
            >
              <Switch
                checked={equalPeriods}
                onCheckedChange={applyEqualPeriods}
                className="h-4 w-7 data-[state=checked]:bg-brand-accent [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
              />
              <span className={cn(
                "text-sm font-medium",
                equalPeriods ? "text-brand-primary" : "text-brand-primary/60",
              )}>
                Todos os períodos com o mesmo peso
              </span>
            </div>

            {/* Period cards */}
            <div className={cn(
              "space-y-2 transition-opacity",
              equalPeriods && "opacity-40 pointer-events-none",
            )}>
              {cumulativeLocal.map((row, rIdx) => {
                const rowSum = row.reduce((a, b) => a + (parseFloat(b) || 0), 0);
                const isFirst = row.length === 1;

                return (
                  <div
                    key={rIdx}
                    className="rounded-xl border border-brand-primary/5 bg-white overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-brand-primary/[0.02] border-b border-brand-primary/5">
                      <span className="text-sm font-medium text-brand-primary">
                        {periodLabel(rIdx + 1)}
                      </span>
                      {!isFirst && (
                        <span
                          className={cn(
                            "text-[10px] font-semibold",
                            Math.abs(rowSum - 100) < 0.01
                              ? "text-brand-success"
                              : "text-brand-error",
                          )}
                        >
                          {rowSum.toFixed(0)}%
                        </span>
                      )}
                    </div>

                    {isFirst ? (
                      <div className="px-3 py-2.5 text-xs text-brand-primary/40">
                        Apenas nota própria
                      </div>
                    ) : (
                      <div className="px-3 py-2.5 space-y-2">
                        {row.map((val, cIdx) => {
                          const isOwn = cIdx === row.length - 1;
                          const sourceLabel = isOwn
                            ? "Nota própria"
                            : `Nota do ${periodLabel(cIdx + 1)}`;

                          return (
                            <div key={cIdx} className="flex items-center gap-3">
                              <span className="text-xs text-brand-primary/50 flex-1">
                                {sourceLabel}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={val}
                                  onChange={(e) => updateCumulativeWeight(rIdx, cIdx, e.target.value)}
                                  className="w-14 text-center rounded-lg border border-brand-primary/10 px-1 py-1.5 text-sm font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent transition-colors"
                                />
                                <span className="text-xs text-brand-primary/30">%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
  );
}


