import Image from "next/image";
import { studentFeatures } from "./landing-content";

export function LandingStudentSection() {
  return (
    <section className="bg-brand-bg px-5 py-12 sm:px-8 md:py-16 lg:px-12">
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

        <div className="mt-14 flex flex-wrap justify-center gap-6 lg:gap-8">
          {studentFeatures.map((feat) => (
            <div
              key={feat.title}
              className="flex w-64 flex-col overflow-hidden rounded-3xl border-2 border-brand-primary/8 bg-white shadow-lg"
            >
              <div className="bg-gradient-to-b from-brand-primary/5 to-brand-accent/10 p-3">
                <div className="overflow-hidden rounded-[2.9rem]">
                  <Image
                    src={feat.imageSrc}
                    alt={feat.title}
                    width={1080}
                    height={1920}
                    sizes="(max-width: 767px) 70vw, 256px"
                    className="h-auto w-full"
                  />
                </div>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-brand-primary">
                  {feat.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-brand-primary/60">
                  {feat.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
