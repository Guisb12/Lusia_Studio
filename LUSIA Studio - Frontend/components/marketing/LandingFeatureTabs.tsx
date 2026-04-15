"use client";

import {
  Calendar03Icon,
  Books02Icon,
  AssignmentsIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CalendarDays, FileText, ClipboardList } from "lucide-react";
import dynamic from "next/dynamic";

// Lazy load the wrappers
const LazyCalendarWrapper = dynamic(
  () => import("./LandingCalendarWrapper").then((mod) => mod.LandingCalendarWrapper),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-accent/20 border-t-brand-accent" />
      </div>
    ),
    ssr: false,
  }
);

const LazyMaterialsWrapper = dynamic(
  () => import("./LandingMaterialsWrapper").then((mod) => mod.LandingMaterialsWrapper),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-accent/20 border-t-brand-accent" />
      </div>
    ),
    ssr: false,
  }
);

const LazyAssignmentsWrapper = dynamic(
  () => import("./LandingAssignmentsWrapper").then((mod) => mod.LandingAssignmentsWrapper),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-accent/20 border-t-brand-accent" />
      </div>
    ),
    ssr: false,
  }
);

interface FeatureSection {
  id: string;
  label: string;
  hugeicon: typeof Calendar03Icon;
  lucideIcon: typeof CalendarDays;
  eyebrow: string;
  title: string;
  description: string;
  highlights: string[];
  demo: React.ReactNode;
}

export function LandingFeatureTabs() {
  const features: FeatureSection[] = [
    {
      id: "calendar",
      label: "Calendário",
      hugeicon: Calendar03Icon,
      lucideIcon: CalendarDays,
      eyebrow: "Organização",
      title: "Organize as sessões em minutos, não em horas",
      description:
        "Deixe de perder tempo com folhas de cálculo e mensagens. Veja toda a ocupação do centro num olhar e ajuste horários em segundos. Recorrência automática e gestão de presenças integrada.",
      highlights: ["Visão semanal e mensal clara", "Recorrência automática", "Gestão de presenças em 1 clique"],
      demo: <LazyCalendarWrapper />,
    },
    {
      id: "materials",
      label: "Materiais",
      hugeicon: Books02Icon,
      lucideIcon: FileText,
      eyebrow: "Base de conhecimento",
      title: "O arquivo do centro, organizado e inteligente",
      description:
        "Carregue PDFs, fichas e apontamentos. A plataforma organiza o conteúdo por disciplina e ano, criando uma base de conhecimento única do seu centro. A partir daí, gera materiais de estudo personalizados.",
      highlights: ["Organização automática por disciplina", "Arquivo centralizado do centro", "Geração de materiais a partir dos seus documentos"],
      demo: <LazyMaterialsWrapper />,
    },
    {
      id: "assignments",
      label: "TPCs",
      hugeicon: AssignmentsIcon,
      lucideIcon: ClipboardList,
      eyebrow: "Gestão de trabalhos",
      title: "Saiba sempre quem entregou e quem não entregou",
      description:
        "Acompanhe todos os trabalhos de casa num só sítio. Os alunos sabem o que têm de fazer e você sabe quem cumpriu. Sem confusão, sem esquecimentos.",
      highlights: ["Até 3 artefactos por trabalho", "Estado de entrega visível", "Revisão integrada"],
      demo: <LazyAssignmentsWrapper />,
    },
  ];

  return (
    <section className="relative bg-brand-bg py-12 lg:py-16">
      <div className="mx-auto max-w-[1400px] px-6 sm:px-8 lg:px-12">
        {/* Header */}
        <div className="mb-12 text-center">
          <span className="mb-4 inline-block text-xs font-medium uppercase tracking-widest text-brand-accent">
            Funcionalidades
          </span>
          <h2 className="font-instrument text-3xl font-medium text-brand-primary sm:text-4xl lg:text-5xl">
            Tudo o que precisa para{" "}
            <span className="font-instrument-italic text-brand-accent">ensinar melhor</span>
          </h2>
        </div>

        {/* Features - Vertical Stack */}
        <div className="flex flex-col gap-8">
          {features.map((feature, index) => {
            const Icon = feature.lucideIcon;
            const isEven = index % 2 === 0;

            return (
              <div
                key={feature.id}
                className="overflow-hidden rounded-3xl bg-white shadow-sm"
              >
                <div className={`grid gap-0 lg:grid-cols-2 ${isEven ? "" : "lg:direction-rtl"}`}>
                  {/* Text Content */}
                  <div className={`flex flex-col justify-center p-8 lg:p-12 ${isEven ? "lg:order-1" : "lg:order-2"}`}>
                    {/* Eyebrow */}
                    <div className="mb-3 flex items-center gap-2">
                      <HugeiconsIcon icon={feature.hugeicon} className="h-4 w-4 text-brand-accent" />
                      <span className="text-xs font-medium uppercase tracking-widest text-brand-accent">
                        {feature.eyebrow}
                      </span>
                    </div>

                    <h3 className="mb-4 font-instrument text-2xl font-medium text-brand-primary sm:text-3xl">
                      {feature.title}
                    </h3>

                    <p className="mb-6 text-lg leading-relaxed text-brand-primary/70">
                      {feature.description}
                    </p>

                    <ul className="space-y-3">
                      {feature.highlights.map((highlight, i) => (
                        <li key={i} className="flex items-center gap-3 text-brand-primary/80">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Visual/Preview Area */}
                  <div className={`relative flex items-center justify-center bg-gradient-to-br from-brand-accent/5 to-brand-primary/5 p-4 lg:p-8 ${isEven ? "lg:order-2" : "lg:order-1"}`}>
                    <div className="relative h-[400px] w-full overflow-hidden">
                      {feature.demo}
                    </div>
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
