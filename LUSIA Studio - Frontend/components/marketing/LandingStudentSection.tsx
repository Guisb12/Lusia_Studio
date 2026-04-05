import { studentFeatures } from "./landing-content";

export function LandingStudentSection() {
  return (
    <section className="bg-brand-bg px-5 py-20 sm:px-8 md:py-28 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
          Experiência do aluno
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-center font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
          Valor direto para quem aprende
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-base leading-relaxed text-brand-primary/60">
          Os alunos não são apenas utilizadores passivos. Recebem apoio
          contextual, organizam os trabalhos e acompanham as notas — no
          computador ou no telemóvel.
        </p>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {studentFeatures.map((feat) => (
            <div
              key={feat.title}
              className="rounded-2xl border-2 border-brand-primary/8 bg-white p-7 shadow-sm"
            >
              <span className="text-3xl" role="img" aria-label={feat.title}>
                {feat.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-brand-primary">
                {feat.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-primary/65">
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
