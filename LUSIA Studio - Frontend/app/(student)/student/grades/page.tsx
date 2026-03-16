import { GradesEntryPage } from "@/components/grades/GradesEntryPage"
import { getCurrentAcademicYear } from "@/lib/grades"
import { fetchGradeSettingsServer, fetchGradeBoardServer } from "@/lib/grades.server"

export default async function GradesPageEntry() {
  const academicYear = getCurrentAcademicYear()
  const [initialSettings, initialBoardData] = await Promise.all([
    fetchGradeSettingsServer(academicYear),
    fetchGradeBoardServer(academicYear),
  ])

  return (
    <GradesEntryPage
      academicYear={academicYear}
      initialSettings={initialSettings}
      initialBoardData={initialBoardData}
    />
  )
}
