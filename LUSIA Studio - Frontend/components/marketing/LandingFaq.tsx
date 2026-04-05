"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { faqItems } from "./landing-content";

export function LandingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="bg-brand-bg px-5 py-20 sm:px-8 md:py-28 lg:px-12">
      <div className="mx-auto max-w-3xl">
        <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
          Perguntas frequentes
        </p>
        <h2 className="mx-auto mt-3 max-w-xl text-center font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
          Dúvidas comuns
        </h2>

        <div className="mt-12 space-y-3">
          {faqItems.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className="rounded-2xl border-2 border-brand-primary/8 bg-white shadow-sm"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 p-6 text-left"
                >
                  <span className="text-sm font-semibold text-brand-primary sm:text-base">
                    {item.question}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-lg text-brand-primary/40 transition-transform",
                      isOpen && "rotate-45"
                    )}
                  >
                    +
                  </span>
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-200",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-6 text-sm leading-relaxed text-brand-primary/60">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
