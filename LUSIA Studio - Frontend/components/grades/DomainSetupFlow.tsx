"use client";

import { useState, useCallback } from "react";
import { Check, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ELEMENT_TYPES,
  getElementTypeInfo,
  TRIMESTRAL_CUMULATIVE_PRESETS,
  SEMESTRAL_CUMULATIVE_PRESETS,
} from "@/lib/grades";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface DomainSetupFlowProps {
  numPeriods: number;
  regime: "trimestral" | "semestral" | null;
  onComplete: (result: DomainSetupResult) => void;
  onCancel: () => void;
}

export interface DomainSetupResult {
  domains: {
    domain_type: string;
    label: string;
    period_weights: number[];
    elements: {
      period_number: number;
      label: string;
    }[];
  }[];
  cumulativeWeights: number[][] | null;
}

type Step = "types" | "counts" | "weights" | "cumulative";

/**
 * Smart weight defaults based on Portuguese education norms.
 * Tests are dominant (60-80%), other categories get reasonable splits.
 */
function computeDomainWeights(types: string[]): Record<string, number> {
  const weights: Record<string, number> = {};
  const hasTest = types.includes("teste");
  const otherTypes = types.filter((t) => t !== "teste");

  if (types.length === 1) {
    weights[types[0]] = 100;
    return weights;
  }

  if (hasTest) {
    // Tests get the lion's share, remaining is split among others
    const testWeight = otherTypes.length === 1 ? 80 : otherTypes.length === 2 ? 70 : 60;
    weights["teste"] = testWeight;
    const remaining = 100 - testWeight;
    const perOther = Math.round((remaining / otherTypes.length) * 100) / 100;
    otherTypes.forEach((t, i) => {
      weights[t] = i === otherTypes.length - 1
        ? Math.round((remaining - perOther * (otherTypes.length - 1)) * 100) / 100
        : perOther;
    });
  } else {
    // No tests: equal split
    const perType = Math.round((100 / types.length) * 100) / 100;
    types.forEach((t, i) => {
      weights[t] = i === types.length - 1
        ? Math.round((100 - perType * (types.length - 1)) * 100) / 100
        : perType;
    });
  }

  return weights;
}

export function DomainSetupFlow({
  numPeriods,
  regime,
  onComplete,
  onCancel,
}: DomainSetupFlowProps) {
  const [step, setStep] = useState<Step>("types");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(["teste"]));
  const [counts, setCounts] = useState<Record<string, number[]>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [cumulativeWeights, setCumulativeWeights] = useState<number[][] | null>(null);
  const [equalPeriods, setEqualPeriods] = useState(false);

  const cumulativePresets = regime === "semestral"
    ? SEMESTRAL_CUMULATIVE_PRESETS
    : TRIMESTRAL_CUMULATIVE_PRESETS;

  const periodLabel = (n: number) =>
    regime === "semestral" ? `${n}º Semestre` : `${n}º Período`;
  const periodLabelShort = (n: number) =>
    regime === "semestral" ? `S${n}` : `P${n}`;

  const toggleType = (key: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // must have at least one
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const ensureCounts = useCallback(() => {
    setCounts((prev) => {
      const next = { ...prev };
      for (const key of selectedTypes) {
        if (!next[key]) {
          const defaultCount = key === "teste" ? 2 : 1;
          next[key] = Array(numPeriods).fill(defaultCount);
        }
      }
      return next;
    });
  }, [selectedTypes, numPeriods]);

  const handleNextToCountsStep = () => {
    ensureCounts();
    setStep("counts");
  };

  const updateCount = (type: string, periodIdx: number, delta: number) => {
    setCounts((prev) => {
      const arr = [...(prev[type] || Array(numPeriods).fill(2))];
      arr[periodIdx] = Math.max(0, Math.min(10, arr[periodIdx] + delta));
      return { ...prev, [type]: arr };
    });
  };

  const handleNextToWeightsStep = () => {
    const domainTypes = Array.from(selectedTypes);
    setWeights((prev) => {
      // Only compute defaults for types that don't already have weights
      const defaults = computeDomainWeights(domainTypes);
      const next: Record<string, number> = {};
      for (const t of domainTypes) {
        next[t] = prev[t] ?? defaults[t] ?? 0;
      }
      return next;
    });
    setStep("weights");
  };

  const updateWeight = (type: string, value: string) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      setWeights((prev) => ({ ...prev, [type]: parsed }));
    } else if (value === "") {
      setWeights((prev) => ({ ...prev, [type]: 0 }));
    }
  };

  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);

  const handleComplete = () => {
    const domainTypes = Array.from(selectedTypes);

    const domains = domainTypes.map((type) => {
      const info = getElementTypeInfo(type);
      const periodCounts = counts[type] || Array(numPeriods).fill(type === "teste" ? 2 : 1);

      const elements: { period_number: number; label: string }[] = [];
      for (let p = 0; p < numPeriods; p++) {
        const count = periodCounts[p];
        for (let e = 0; e < count; e++) {
          elements.push({
            period_number: p + 1,
            label: count === 1 ? info.label : `${info.label} ${e + 1}`,
          });
        }
      }

      return {
        domain_type: type,
        label: info.label,
        period_weights: Array(numPeriods).fill(weights[type] ?? 0),
        elements,
      };
    });

    onComplete({ domains, cumulativeWeights });
  };


  return (
    <div className="space-y-4">
      {step === "types" && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-brand-primary mb-1">
              Tipos de avaliação
            </h3>
            <p className="text-xs text-brand-primary/40">
              Que tipos de avaliação tens nesta disciplina?
            </p>
          </div>

          <div className="space-y-1.5">
            {ELEMENT_TYPES.map((t) => {
              const TIcon = t.icon;
              const isSelected = selectedTypes.has(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleType(t.key)}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border transition-colors",
                    isSelected
                      ? "border-brand-accent/30 bg-brand-accent/5"
                      : "border-brand-primary/5 hover:border-brand-primary/15",
                  )}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      isSelected ? "bg-brand-accent/10" : "bg-brand-primary/[0.04]",
                    )}
                  >
                    <TIcon
                      className={cn(
                        "h-4 w-4",
                        isSelected ? "text-brand-accent" : "text-brand-primary/40",
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium flex-1 text-left",
                      isSelected ? "text-brand-primary" : "text-brand-primary/60",
                    )}
                  >
                    {t.label}
                  </span>
                  {isSelected && (
                    <Check className="h-4 w-4 text-brand-accent shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onCancel} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleNextToCountsStep}
              disabled={selectedTypes.size === 0}
              className="flex-1"
            >
              Continuar
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </>
      )}

      {step === "counts" && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-brand-primary mb-1">
              Quantos por período?
            </h3>
            <p className="text-xs text-brand-primary/40">
              Define quantos elementos tens de cada tipo por período.
            </p>
          </div>

          <div className="space-y-3">
            {Array.from(selectedTypes).map((type) => {
              const info = getElementTypeInfo(type);
              const TIcon = info.icon;
              const periodCounts = counts[type] || Array(numPeriods).fill(2);

              return (
                <div
                  key={type}
                  className="rounded-xl border border-brand-primary/5 bg-white p-3"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <TIcon className="h-3.5 w-3.5 text-brand-primary/50" />
                    <span className="text-sm font-medium text-brand-primary">
                      {info.label}
                    </span>
                  </div>

                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${numPeriods}, 1fr)` }}>
                    {periodCounts.map((count: number, pIdx: number) => (
                      <div key={pIdx} className="text-center">
                        <div className="text-[10px] text-brand-primary/30 mb-1">
                          {periodLabelShort(pIdx + 1)}
                        </div>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateCount(type, pIdx, -1)}
                            className="h-6 w-6 rounded-md flex items-center justify-center text-brand-primary/30 hover:text-brand-primary/60 hover:bg-brand-primary/5 transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-semibold text-brand-primary w-5 text-center">
                            {count}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCount(type, pIdx, 1)}
                            className="h-6 w-6 rounded-md flex items-center justify-center text-brand-primary/30 hover:text-brand-primary/60 hover:bg-brand-primary/5 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStep("types")} className="flex-1">
              Voltar
            </Button>
            <Button onClick={handleNextToWeightsStep} className="flex-1">
              Continuar
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </>
      )}

      {step === "weights" && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-brand-primary mb-1">
              Pesos de cada tipo
            </h3>
            <p className="text-xs text-brand-primary/40">
              Quanto vale cada tipo de avaliação na nota do período?
            </p>
          </div>

          <div className="space-y-2">
            {Array.from(selectedTypes).map((type) => {
              const info = getElementTypeInfo(type);
              const TIcon = info.icon;
              const w = weights[type] ?? 0;

              return (
                <div
                  key={type}
                  className="flex items-center gap-3 rounded-xl border border-brand-primary/5 bg-white px-3 py-2.5"
                >
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-brand-primary/[0.04]">
                    <TIcon className="h-4 w-4 text-brand-primary/50" />
                  </div>
                  <span className="text-sm font-medium text-brand-primary flex-1">
                    {info.label}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={w || ""}
                      onChange={(e) => updateWeight(type, e.target.value)}
                      placeholder="0"
                      className="w-14 text-center rounded-lg border border-brand-primary/10 px-1 py-1 text-sm font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:ring-1 focus:ring-brand-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-brand-primary/30">%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total indicator */}
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-brand-primary/40">Total:</span>
            <span
              className={cn(
                "text-sm font-bold",
                Math.abs(weightSum - 100) < 0.01
                  ? "text-brand-success"
                  : "text-brand-error",
              )}
            >
              {weightSum.toFixed(0)}%
            </span>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStep("counts")} className="flex-1">
              Voltar
            </Button>
            <Button
              onClick={() => {
                // Default to "Progressivo" preset
                if (cumulativeWeights === null) {
                  const defaultPreset = cumulativePresets[1] ?? cumulativePresets[0];
                  setCumulativeWeights(defaultPreset.weights.map((row) => [...row]));
                }
                setStep("cumulative");
              }}
              disabled={Math.abs(weightSum - 100) >= 0.01}
              className="flex-1"
            >
              Continuar
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </>
      )}

      {step === "cumulative" && cumulativeWeights && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-brand-primary mb-1">
              Notas cumulativas
            </h3>
            <p className="text-xs text-brand-primary/40">
              A nota de cada período pode incluir matéria dos anteriores.
              Define quanto pesa cada período no cálculo.
            </p>
          </div>

          {/* Equal period weights toggle */}
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
              onCheckedChange={(checked) => {
                setEqualPeriods(checked);
                if (checked) {
                  // Each period counts equally: P1=100%, P2=50/50, P3=33.33/33.33/33.34
                  setCumulativeWeights(
                    Array.from({ length: numPeriods }, (_, i) => {
                      const count = i + 1;
                      const base = Math.floor((100 / count) * 100) / 100;
                      const row = Array(count).fill(base);
                      // Adjust last value so row sums to exactly 100
                      row[count - 1] = Math.round((100 - base * (count - 1)) * 100) / 100;
                      return row;
                    }),
                  );
                } else {
                  // Restore progressive defaults
                  const defaultPreset = cumulativePresets[1] ?? cumulativePresets[0];
                  setCumulativeWeights(defaultPreset.weights.map((row) => [...row]));
                }
              }}
              className="h-4 w-7 data-[state=checked]:bg-brand-accent [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
            />
            <span className={cn(
              "text-sm font-medium",
              equalPeriods ? "text-brand-primary" : "text-brand-primary/60",
            )}>
              Todos os períodos com o mesmo peso
            </span>
          </div>

          <div className={cn("space-y-3 transition-opacity", equalPeriods && "opacity-40 pointer-events-none")}>
            {cumulativeWeights.map((row, rIdx) => {
              const rowSum = row.reduce((a, b) => a + b, 0);
              const isFirst = row.length === 1;

              return (
                <div
                  key={rIdx}
                  className="rounded-xl border border-brand-primary/5 bg-white overflow-hidden"
                >
                  {/* Period header */}
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
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={val || ""}
                                onChange={(e) => {
                                  const parsed = parseFloat(e.target.value);
                                  setEqualPeriods(false);
                                  setCumulativeWeights((prev) => {
                                    if (!prev) return prev;
                                    return prev.map((r, ri) => {
                                      if (ri !== rIdx) return r;
                                      const newRow = [...r];
                                      newRow[cIdx] = isNaN(parsed) ? 0 : parsed;
                                      return newRow;
                                    });
                                  });
                                }}
                                placeholder="0"
                                className="w-14 text-center rounded-lg border border-brand-primary/10 px-1 py-1.5 text-sm font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:ring-1 focus:ring-brand-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStep("weights")} className="flex-1">
              Voltar
            </Button>
            <Button
              onClick={handleComplete}
              disabled={cumulativeWeights.some(
                (row) => Math.abs(row.reduce((a, b) => a + b, 0) - 100) >= 0.01,
              )}
              className="flex-1"
            >
              Criar estrutura
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
