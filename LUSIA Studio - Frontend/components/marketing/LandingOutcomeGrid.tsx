import { outcomeCards } from "./landing-content";

export function LandingOutcomeGrid() {
  return (
    <section className="bg-brand-bg px-5 py-20 sm:px-8 md:py-28 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
          Uma plataforma, tudo incluído
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-center font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
          Tudo o que um centro precisa para funcionar
        </h2>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {outcomeCards.map((card) => (
            <div
              key={card.title}
              className="group rounded-2xl border-2 border-brand-primary/8 bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="text-3xl" role="img" aria-label={card.title}>
                {card.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-brand-primary">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-primary/65">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
