import { demoSteps } from "./landing-content";

export function LandingDemoSection() {
  return (
    <section className="bg-brand-bg px-5 py-20 sm:px-8 md:py-28 lg:px-12">
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

        <div className="mt-14 grid gap-10 md:grid-cols-2 md:items-start">
          {/* Steps */}
          <div className="flex flex-col gap-8">
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

          {/* Media placeholder */}
          <div className="aspect-[4/3] overflow-hidden rounded-2xl border-2 border-brand-primary/8 bg-white shadow-sm">
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="text-5xl">🤖</span>
              <p className="text-sm text-brand-primary/40">
                Espaço reservado para vídeo de demonstração
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
