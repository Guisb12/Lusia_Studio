"use client";

import React, { useState, useMemo } from "react";
import { startOfWeek, setHours, setMinutes } from "date-fns";
import { MacWindowFrame } from "./MacWindowFrame";
import { SimpleFiveDayCalendar } from "./SimpleFiveDayCalendar";
import type { CalendarSession } from "@/components/calendar/EventCalendar";

// ── Mock Sample Data ──────────────────────────────────────────

const MOCK_TEACHER_ID = "teacher-demo-001";
const MOCK_ORG_ID = "org-demo-001";

const mockStudents = [
  { id: "s1", full_name: "Ana Costa", display_name: "Ana", grade_level: "10º", course: "Ciências" },
  { id: "s2", full_name: "Bruno Ferreira", display_name: "Bruno", grade_level: "11º", course: "Humanidades" },
  { id: "s3", full_name: "Carla Mendes", display_name: "Carla", grade_level: "12º", course: "Economia" },
  { id: "s4", full_name: "David Santos", display_name: "David", grade_level: "10º", course: "Artes" },
  { id: "s5", full_name: "Elena Rodrigues", display_name: "Elena", grade_level: "11º", course: "Ciências" },
  { id: "s6", full_name: "Filipe Oliveira", display_name: "Filipe", grade_level: "12º", course: "Tecnologia" },
];

const mockSubjects = [
  { id: "sub1", name: "Matemática A", color: "#0a1bb6" },
  { id: "sub2", name: "Português", color: "#dc2626" },
  { id: "sub3", name: "Física", color: "#7c3aed" },
  { id: "sub4", name: "Inglês", color: "#ea580c" },
  { id: "sub5", name: "História", color: "#9333ea" },
  { id: "sub6", name: "Química", color: "#059669" },
  { id: "sub7", name: "Biologia", color: "#10b981" },
  { id: "sub8", name: "Filosofia", color: "#6366f1" },
];

const mockSessionTypes = [
  { id: "type1", name: "Grupo", color: "#10b981" },
  { id: "type2", name: "Particular", color: "#f59e0b" },
];

// Static weekly schedule - same pattern every week, more sessions per day
const weeklySchedule = [
  // Monday - busy day
  { dayOfWeek: 1, startHour: 8, duration: 60, students: ["s1"], subject: "sub2", type: "type2", title: "Português - Oralidade" },
  { dayOfWeek: 1, startHour: 9, duration: 90, students: ["s1", "s2", "s5"], subject: "sub1", type: "type1", title: "Matemática A - Álgebra" },
  { dayOfWeek: 1, startHour: 11, duration: 60, students: ["s3", "s4"], subject: "sub4", type: "type2", title: "Inglês - Listening" },
  { dayOfWeek: 1, startHour: 14, duration: 90, students: ["s3", "s4"], subject: "sub3", type: "type2", title: "Física - Mecânica" },
  { dayOfWeek: 1, startHour: 16, duration: 60, students: ["s2", "s6"], subject: "sub5", type: "type1", title: "História - Revoluções" },
  
  // Tuesday
  { dayOfWeek: 2, startHour: 9, duration: 90, students: ["s1", "s3"], subject: "sub6", type: "type2", title: "Química - Reações" },
  { dayOfWeek: 2, startHour: 10, duration: 60, students: ["s2"], subject: "sub2", type: "type2", title: "Português - Gramática" },
  { dayOfWeek: 2, startHour: 11, duration: 90, students: ["s4", "s5", "s6"], subject: "sub7", type: "type1", title: "Biologia - Genética" },
  { dayOfWeek: 2, startHour: 14, duration: 60, students: ["s1"], subject: "sub8", type: "type2", title: "Filosofia - Lógica" },
  { dayOfWeek: 2, startHour: 15, duration: 90, students: ["s1", "s5", "s6"], subject: "sub4", type: "type1", title: "Inglês - Conversation" },
  
  // Wednesday
  { dayOfWeek: 3, startHour: 8, duration: 90, students: ["s2", "s4"], subject: "sub1", type: "type2", title: "Matemática A - Geometria" },
  { dayOfWeek: 3, startHour: 9, duration: 90, students: ["s4", "s6"], subject: "sub5", type: "type2", title: "História - Idade Moderna" },
  { dayOfWeek: 3, startHour: 11, duration: 60, students: ["s3", "s5"], subject: "sub2", type: "type1", title: "Português - Literatura" },
  { dayOfWeek: 3, startHour: 14, duration: 60, students: ["s3"], subject: "sub7", type: "type2", title: "Biologia - Células" },
  { dayOfWeek: 3, startHour: 15, duration: 90, students: ["s1", "s2"], subject: "sub3", type: "type1", title: "Física - Eletricidade" },
  
  // Thursday
  { dayOfWeek: 4, startHour: 9, duration: 60, students: ["s5"], subject: "sub4", type: "type2", title: "Inglês - Writing" },
  { dayOfWeek: 4, startHour: 10, duration: 90, students: ["s3", "s6"], subject: "sub8", type: "type2", title: "Filosofia - Ética" },
  { dayOfWeek: 4, startHour: 11, duration: 90, students: ["s1", "s2", "s4", "s5"], subject: "sub6", type: "type1", title: "Química - Ligações" },
  { dayOfWeek: 4, startHour: 14, duration: 60, students: ["s4", "s6"], subject: "sub5", type: "type2", title: "História - Guerra Fria" },
  { dayOfWeek: 4, startHour: 16, duration: 90, students: ["s2", "s3"], subject: "sub1", type: "type2", title: "Matemática A - Trigonometria" },
  
  // Friday
  { dayOfWeek: 5, startHour: 9, duration: 90, students: ["s2", "s5"], subject: "sub1", type: "type2", title: "Matemática A - Funções" },
  { dayOfWeek: 5, startHour: 11, duration: 60, students: ["s1", "s3", "s4"], subject: "sub4", type: "type1", title: "Inglês - Vocabulary" },
  { dayOfWeek: 5, startHour: 13, duration: 60, students: ["s4", "s1"], subject: "sub4", type: "type2", title: "Inglês - Reading" },
  { dayOfWeek: 5, startHour: 14, duration: 90, students: ["s3", "s5", "s6"], subject: "sub2", type: "type1", title: "Português - Redação" },
  { dayOfWeek: 5, startHour: 16, duration: 60, students: ["s2", "s4"], subject: "sub7", type: "type2", title: "Biologia - Ecologia" },
];

// Generate mock sessions for a date range - works for ANY month/year
function generateStaticSessions(startDate: Date, weeks: number): CalendarSession[] {
  const sessions: CalendarSession[] = [];
  const baseMonday = startOfWeek(startDate, { weekStartsOn: 1 });
  
  let sessionIndex = 0;
  
  // Generate for specified number of weeks
  for (let week = 0; week < weeks; week++) {
    weeklySchedule.forEach((schedule) => {
      // Calculate the actual date for this session
      const daysToAdd = (week * 7) + (schedule.dayOfWeek - 1); // Monday = 1
      const date = new Date(baseMonday);
      date.setDate(date.getDate() + daysToAdd);
      date.setHours(schedule.startHour, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setMinutes(schedule.duration);
      
      const sessionStudents = schedule.students.map(id => mockStudents.find(s => s.id === id)!).filter(Boolean);
      const subject = mockSubjects.find(s => s.id === schedule.subject)!;
      const sessionType = mockSessionTypes.find(t => t.id === schedule.type)!;
      
      sessions.push({
        id: `demo-session-${sessionIndex++}`,
        organization_id: MOCK_ORG_ID,
        teacher_id: MOCK_TEACHER_ID,
        teacher_name: "Prof. Joana Santos",
        student_ids: schedule.students,
        starts_at: date.toISOString(),
        ends_at: endDate.toISOString(),
        title: schedule.title,
        subject_ids: [schedule.subject],
        subjects: [subject],
        students: sessionStudents,
        session_type_id: schedule.type,
        session_type: sessionType,
        recurrence_group_id: null,
        recurrence_index: null,
      });
    });
  }
  
  return sessions;
}

// ── Landing Calendar Wrapper ───────────────────────────────────

interface LandingCalendarWrapperProps {
  className?: string;
}

export function LandingCalendarWrapper({ className }: LandingCalendarWrapperProps) {
  // Start at a fixed "demo date" - first Monday of October 2024
  // This gives us consistent, nice-looking demo data
  const [currentDate, setCurrentDate] = useState(() => {
    // October 7, 2024 is a Monday
    return new Date(2024, 9, 7); 
  });
  
  const [viewMode, setViewMode] = useState<"month" | "week">("week");
  
  // Generate static sessions spanning many months (works for any view)
  const mockSessions = useMemo(() => {
    // Generate 12 weeks of data - covers any month view
    return generateStaticSessions(currentDate, 12);
  }, []); // Empty deps - same data always, works for any month

  return (
    <MacWindowFrame className={className}>
      <div className="h-[400px]">
        <SimpleFiveDayCalendar
          sessions={mockSessions}
          currentDate={currentDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onDateChange={setCurrentDate}
        />
      </div>
    </MacWindowFrame>
  );
}
