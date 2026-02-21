"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
    label: string;
}

interface StepperProps {
    steps: Step[];
    currentStep: number; // 0-indexed
    className?: string;
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
    return (
        <div className={cn("w-full", className)}>
            <div className="flex items-center justify-between">
                {steps.map((step, index) => {
                    const isCompleted = index < currentStep;
                    const isActive = index === currentStep;
                    const isLast = index === steps.length - 1;

                    return (
                        <div key={index} className="flex items-center flex-1 last:flex-none">
                            {/* Step circle + label */}
                            <div className="flex flex-col items-center gap-1.5">
                                <div
                                    className={cn(
                                        "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-all duration-300",
                                        isCompleted &&
                                        "bg-brand-accent text-white",
                                        isActive &&
                                        "bg-brand-accent text-white ring-4 ring-brand-accent/20",
                                        !isCompleted &&
                                        !isActive &&
                                        "bg-brand-primary/10 text-brand-primary/40",
                                    )}
                                >
                                    {isCompleted ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <span>{index + 1}</span>
                                    )}
                                </div>
                                <span
                                    className={cn(
                                        "text-xs font-medium transition-colors duration-300 whitespace-nowrap",
                                        isActive
                                            ? "text-brand-primary"
                                            : isCompleted
                                                ? "text-brand-accent"
                                                : "text-brand-primary/40",
                                    )}
                                >
                                    {step.label}
                                </span>
                            </div>

                            {/* Connector line */}
                            {!isLast && (
                                <div className="flex-1 mx-3 mt-[-1.25rem]">
                                    <div
                                        className={cn(
                                            "h-[2px] w-full transition-colors duration-300",
                                            isCompleted ? "bg-brand-accent" : "bg-brand-primary/10",
                                        )}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
