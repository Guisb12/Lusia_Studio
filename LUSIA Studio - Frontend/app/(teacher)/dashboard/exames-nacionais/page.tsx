import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fetchExamReadinessSubjectsServer } from "@/lib/exam-readiness.server";
import { ExamReadinessPageFrame } from "@/components/exam-readiness/ExamReadinessPageFrame";
import { ReadinessPillCard } from "@/components/exam-readiness/ExamReadinessPrimitives";

export default async function ExamesNacionaisLandingPage() {
  const subjects = await fetchExamReadinessSubjectsServer();

  return (
    <ExamReadinessPageFrame title="Exames Nacionais">
      {subjects.length === 0 ? (
        <ReadinessPillCard innerClassName="px-6 py-12 text-center">
          <p className="text-sm text-brand-primary/60">
            Nenhuma disciplina com exame nacional encontrada. Quando as disciplinas estiverem
            marcadas com exame nacional, aparecem aqui.
          </p>
        </ReadinessPillCard>
      ) : (
        <ReadinessPillCard innerClassName="divide-y divide-brand-primary/[0.06] p-0">
          <ul className="flex flex-col">
            {subjects.map((s) => {
              const slug = s.slug;
              if (!slug) return null;
              return (
                <li key={s.id}>
                  <Link
                    href={`/dashboard/exames-nacionais/${encodeURIComponent(slug)}`}
                    className="group flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-brand-primary/[0.03] sm:px-5"
                  >
                    <div className="min-w-0 text-left">
                      <p className="font-medium text-brand-primary">{s.name}</p>
                      {s.education_level ? (
                        <p className="mt-0.5 truncate text-xs text-brand-primary/45">
                          {s.education_level}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-brand-primary/30 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary/50"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </ReadinessPillCard>
      )}
    </ExamReadinessPageFrame>
  );
}
