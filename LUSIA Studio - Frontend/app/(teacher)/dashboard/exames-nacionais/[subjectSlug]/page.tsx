import { notFound } from "next/navigation";
import { fetchExamReadinessSubjectServer } from "@/lib/exam-readiness.server";
import { ExamReadinessSubjectClient } from "@/components/exam-readiness/ExamReadinessSubjectClient";
import { ExamReadinessPageFrame } from "@/components/exam-readiness/ExamReadinessPageFrame";

interface PageProps {
  params: Promise<{ subjectSlug: string }>;
}

export default async function ExamesNacionaisSubjectPage({ params }: PageProps) {
  const { subjectSlug } = await params;
  const decoded = decodeURIComponent(subjectSlug);
  const data = await fetchExamReadinessSubjectServer(decoded, { blueprint_limit: 32 });

  if (!data) {
    notFound();
  }

  return (
    <ExamReadinessPageFrame
      title={data.subject.name}
      backHref="/dashboard/exames-nacionais"
      backLabel="Exames Nacionais"
    >
      <ExamReadinessSubjectClient subjectSlug={decoded} initialData={data} />
    </ExamReadinessPageFrame>
  );
}
