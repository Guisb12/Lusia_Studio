"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { operationsTabs } from "./landing-content";

export function LandingOperationsSection() {
  const [activeTab, setActiveTab] = useState(operationsTabs[0].id);
  const active = operationsTabs.find((t) => t.id === activeTab)!;

  return (
    <section className="bg-brand-light/40 px-5 py-20 sm:px-8 md:py-28 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
          Controlo operacional
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-center font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
          Do horário à entrega — tudo sob controlo
        </h2>

        {/* Tab bar */}
        <div className="mx-auto mt-12 flex max-w-2xl flex-wrap justify-center gap-3">
          {operationsTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-xl px-5 py-2.5 text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-brand-accent text-white shadow-md"
                  : "bg-white text-brand-primary/70 hover:bg-brand-primary/5"
              )}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.title}
            </button>
          ))}
        </div>

        {/* Active panel */}
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border-2 border-brand-primary/8 bg-white p-8 shadow-sm md:p-10">
          <h3 className="text-xl font-semibold text-brand-primary">
            <span className="mr-2">{active.icon}</span>
            {active.title}
          </h3>
          <p className="mt-3 text-base leading-relaxed text-brand-primary/65">
            {active.description}
          </p>
          <ul className="mt-6 space-y-3">
            {active.highlights.map((h) => (
              <li
                key={h}
                className="flex items-start gap-3 text-sm text-brand-primary/70"
              >
                <span className="mt-0.5 text-brand-accent">✓</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
