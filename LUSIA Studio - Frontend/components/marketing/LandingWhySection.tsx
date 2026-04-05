import { whyPillars } from "./landing-content";

export function LandingWhySection() {
  return (
    <section className="bg-brand-light/40 px-5 py-20 sm:px-8 md:py-28 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
          Porquê a LUSIA
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-center font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
          Porque é que os centros escolhem a LUSIA
        </h2>

        <div className="mt-14 grid gap-8 sm:grid-cols-2">
          {whyPillars.map((pillar) => (
            <div
              key={pillar.title}
              className="relative overflow-hidden rounded-2xl border-2 border-brand-primary/8 bg-white p-8 shadow-sm"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 text-[5rem] opacity-[0.06]">
                {pillar.icon}
              </div>
              <span className="text-2xl" role="img" aria-label={pillar.title}>
                {pillar.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-brand-primary">
                {pillar.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-primary/65">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
