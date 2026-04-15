import { Quote } from "lucide-react";

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  center: string;
  initials: string;
}

const testimonials: Testimonial[] = [
  {
    quote:
      "A LUSIA mudou completamente a forma como gerimos o centro. O que antes levava horas em folhas de cálculo, agora fazemos em minutos. Os professores adoram a funcionalidade de criar materiais com IA.",
    author: "Maria Silva",
    role: "Diretora",
    center: "Centro de Explicações Futuro",
    initials: "MS",
  },
  {
    quote:
      "Os alunos estão mais engajados desde que começamos a usar o chat IA. Eles fazem perguntas a qualquer hora e recebem respostas instantâneas baseadas na matéria. O professor tem mais tempo para ensinar.",
    author: "António Pereira",
    role: "Professor de Matemática",
    center: "Explicações A+ Lisboa",
    initials: "AP",
  },
  {
    quote:
      "Finalmente temos controlo financeiro real do centro. Sabemos exatamente quanto cada sessão lucra, quais disciplinas são mais rentáveis, e onde podemos melhorar. Imprescindível.",
    author: "Sofia Mendes",
    role: "Administradora",
    center: "Centro Académico Norte",
    initials: "SM",
  },
];

export function LandingTestimonialsSection() {
  return (
    <section className="bg-brand-bg px-5 py-12 sm:px-8 md:py-16 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
          Testemunhos
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-center font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
          O que dizem quem já usa a LUSIA
        </h2>

        <div className="mt-14 grid gap-8 lg:grid-cols-3">
          {testimonials.map((t, idx) => (
            <div
              key={idx}
              className="relative flex flex-col rounded-2xl border-2 border-brand-primary/8 bg-white p-8 shadow-sm"
            >
              {/* Quote icon */}
              <div className="absolute right-6 top-6 text-brand-accent/20">
                <Quote className="h-8 w-8" />
              </div>

              {/* Quote text */}
              <p className="flex-1 text-base leading-relaxed text-brand-primary/80">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="mt-6 flex items-center gap-4 border-t border-brand-primary/10 pt-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-sm font-semibold text-brand-accent">
                  {t.initials}
                </div>
                <div>
                  <p className="font-semibold text-brand-primary">
                    {t.author}
                  </p>
                  <p className="text-sm text-brand-primary/60">
                    {t.role} · {t.center}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
