"use client";

import { cn } from "@/lib/utils";

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
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;

        if (isActive) {
          return (
            <div
              key={index}
              className="flex items-center gap-1.5 rounded-full bg-brand-accent/8 px-3 py-[5px] transition-all duration-500"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-brand-accent shrink-0" />
              <span className="text-[11px] font-medium text-brand-accent leading-none">
                {step.label}
              </span>
            </div>
          );
        }

        return (
          <div
            key={index}
            className={cn(
              "h-[3px] rounded-full transition-all duration-500 ease-in-out w-5",
              isCompleted ? "bg-brand-accent/40" : "bg-brand-primary/12",
            )}
          />
        );
      })}
    </div>
  );
}
