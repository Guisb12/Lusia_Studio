"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
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
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;

        return (
          <motion.div
            key={index}
            layout
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors duration-300",
              isActive
                ? "bg-brand-accent/[0.08]"
                : isCompleted
                  ? "bg-brand-accent/[0.05]"
                  : "bg-brand-primary/[0.04]",
            )}
            style={
              isActive
                ? {
                    boxShadow: "inset 0 0 0 1px rgba(var(--brand-accent-rgb, 59, 130, 246), 0.2)",
                  }
                : undefined
            }
          >
            {isCompleted ? (
              <div className="h-3.5 w-3.5 rounded-full bg-brand-accent/20 flex items-center justify-center shrink-0">
                <Check className="h-2 w-2 text-brand-accent" />
              </div>
            ) : (
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0",
                  isActive ? "bg-brand-accent" : "bg-brand-primary/20",
                )}
              />
            )}
            <span
              className={cn(
                "text-[11px] font-medium leading-none",
                isActive
                  ? "text-brand-accent"
                  : isCompleted
                    ? "text-brand-accent/60"
                    : "text-brand-primary/30",
              )}
            >
              {step.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
