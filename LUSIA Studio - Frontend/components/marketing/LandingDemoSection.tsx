"use client";

import { useState, useEffect, useCallback } from "react";
import { demoSteps, artifactDemos } from "./landing-content";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Quiz02Icon,
  LicenseDraftIcon,
  PresentationLineChart02Icon,
  Note01Icon,
} from "@hugeicons/core-free-icons";

// Map artifact IDs to their actual Hugeicons icons
const artifactIcons: Record<string, typeof Quiz02Icon> = {
  quiz: Quiz02Icon,
  ficha: LicenseDraftIcon,
  slides: PresentationLineChart02Icon,
  teste: Quiz02Icon, // Using quiz icon for teste
  resumo: Note01Icon,
};

export function LandingDemoSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const activeArtifact = artifactDemos[currentIndex];
  const ActiveIcon = artifactIcons[activeArtifact.id];

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % artifactDemos.length);
  }, []);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  // Auto-advance every 5 seconds when not paused
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  return (
    <section className="bg-brand-bg px-5 py-12 sm:px-8 md:py-16 lg:px-12 overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
          Fluxo de criação com IA
        </p>
        <h2 className="mt-3 max-w-xl font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
          Do documento ao conteúdo pronto — em minutos
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-primary/65">
          Carregue qualquer material de estudo. A IA gera quizzes, fichas,
          apresentações e resumos alinhados com o currículo.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
          {/* Steps */}
          <div className="flex flex-col gap-8 md:gap-10 lg:pr-8">
            {demoSteps.map((step) => (
              <div key={step.step} className="flex gap-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-sm font-bold text-white">
                  {step.step}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-brand-primary">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-brand-primary/60">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Artifact Carousel */}
          <div 
            className="relative"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {/* Icon navbar - TOP, minimal */}
            <div className="mb-3 flex justify-center gap-1">
              {artifactDemos.map((artifact, index) => {
                const IconComponent = artifactIcons[artifact.id];
                const isActive = index === currentIndex;
                return (
                  <button
                    key={artifact.id}
                    onClick={() => goToSlide(index)}
                    className={`group flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                      isActive
                        ? "bg-brand-accent text-white shadow-sm"
                        : "text-brand-primary/40 hover:bg-brand-primary/5 hover:text-brand-primary/60"
                    }`}
                    aria-label={artifact.title}
                  >
                    <HugeiconsIcon 
                      icon={IconComponent} 
                      size={20} 
                      color="currentColor" 
                      strokeWidth={1.5} 
                    />
                  </button>
                );
              })}
            </div>

            {/* Main carousel container */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-brand-primary/8 bg-white shadow-lg">
              <div className="bg-gradient-to-br from-brand-primary/5 to-brand-accent/5 p-3">
                <div className="relative aspect-[16/10] overflow-hidden rounded-[1.15rem] bg-white">
                  {artifactDemos.map((artifact, index) => (
                    <video
                      key={artifact.id}
                      src={artifact.videoSrc}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                        index === currentIndex ? "opacity-100" : "opacity-0"
                      }`}
                      aria-hidden={index !== currentIndex}
                    />
                  ))}
                </div>
              </div>

              <div className="border-t border-brand-primary/8 px-5 py-4">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={ActiveIcon}
                    size={18}
                    color="currentColor"
                    strokeWidth={1.5}
                    className="text-brand-accent"
                  />
                  <h3 className="text-base font-semibold text-brand-primary">
                    {activeArtifact.title}
                  </h3>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
