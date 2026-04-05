import { analyticsHighlights } from "./landing-content";

export function LandingAnalyticsSection() {
  return (
    <section className="bg-brand-light/40 px-5 py-20 sm:px-8 md:py-28 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          {/* Copy */}
          <div className="max-w-lg">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
              Analítica financeira
            </p>
            <h2 className="mt-3 font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
              Dados reais para decisões reais
            </h2>
            <p className="mt-4 text-base leading-relaxed text-brand-primary/65">
              Acompanhe receita, custo e lucro por mês, professor, aluno e tipo
              de sessão. A informação que o centro precisa para crescer de forma
              sustentável.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-4">
              {analyticsHighlights.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-brand-primary/8 bg-white p-4"
                >
                  <p className="text-sm font-semibold text-brand-accent">
                    {item.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-brand-primary/55">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Media placeholder */}
          <div className="aspect-[4/3] overflow-hidden rounded-2xl border-2 border-brand-primary/8 bg-white shadow-sm">
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="text-5xl">📊</span>
              <p className="text-sm text-brand-primary/40">
                Espaço reservado para screenshot do dashboard
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
