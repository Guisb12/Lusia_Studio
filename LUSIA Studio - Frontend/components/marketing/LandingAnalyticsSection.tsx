import Image from "next/image";
import { analyticsHighlights } from "./landing-content";

export function LandingAnalyticsSection() {
  return (
    <section className="bg-brand-bg px-5 py-12 sm:px-8 md:py-16 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          {/* Media / Screenshot - NOW ON LEFT */}
          <div className="order-2 rounded-[1.75rem] border-2 border-brand-primary/8 bg-white p-3 shadow-sm md:order-1">
            <div className="overflow-hidden rounded-[1.15rem] bg-brand-light/30">
              <Image
                src="/financial_screenshot.webp"
                alt="Dashboard financeiro com receita, custo e lucro"
                width={2880}
                height={1561}
                sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 640px"
                className="h-auto w-full"
              />
            </div>
          </div>

          {/* Copy - NOW ON RIGHT */}
          <div className="max-w-lg order-1 md:order-2 md:ml-auto">
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
        </div>
      </div>
    </section>
  );
}
