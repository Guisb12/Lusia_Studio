"use client";

import React from "react";
import { MacWindowFrame } from "./MacWindowFrame";
import { LandingAssignmentsShowcase } from "./LandingAssignmentsShowcase";
import type { Assignment, ArtifactMeta } from "@/lib/assignments";

// ── Extended type for landing page mock data ─────────────────────────

interface LandingAssignment extends Assignment {
  artifacts: ArtifactMeta[];
}

// ── Mock Data ──────────────────────────────────────────

const MOCK_ASSIGNMENTS: LandingAssignment[] = [
  // Pending assignments (4)
  {
    id: "t1",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a1"],
    title: "Trabalho de Casa - Funções",
    status: "published",
    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    artifacts: [{ id: "a1", artifact_type: "worksheet", artifact_name: "Ficha Funções", icon: null }],
    teacher_name: "Prof. Ana",
    teacher_avatar: null,
    student_count: 12,
    submitted_count: 0,
    instructions: null,
    grades_released_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "t2",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a2"],
    title: "Exercícios p. 45-47",
    status: "published",
    due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
    artifacts: [{ id: "a2", artifact_type: "worksheet", artifact_name: "Exercícios Física", icon: null }],
    teacher_name: "Prof. João",
    teacher_avatar: null,
    student_count: 10,
    submitted_count: 2,
    instructions: null,
    grades_released_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "t3",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a3"],
    title: "Quiz - Vocabulary Unit 3",
    status: "published",
    due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    artifacts: [{ id: "a3", artifact_type: "quiz", artifact_name: "Quiz Vocabulary", icon: null }],
    teacher_name: "Prof. Sarah",
    teacher_avatar: null,
    student_count: 15,
    submitted_count: 5,
    instructions: null,
    grades_released_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "t4",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a4"],
    title: "Análise - Os Lusíadas",
    status: "published",
    due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
    artifacts: [{ id: "a4", artifact_type: "doc", artifact_name: "Análise Lusíadas", icon: null }],
    teacher_name: "Prof. Maria",
    teacher_avatar: null,
    student_count: 12,
    submitted_count: 3,
    instructions: null,
    grades_released_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  // In Progress/Overdue assignments (3)
  {
    id: "t5",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a5"],
    title: "Quiz - Figuras de Estilo",
    status: "published",
    due_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday (overdue but not all submitted)
    artifacts: [{ id: "a5", artifact_type: "quiz", artifact_name: "Quiz Figuras", icon: null }],
    teacher_name: "Prof. Maria",
    teacher_avatar: null,
    student_count: 12,
    submitted_count: 8,
    instructions: null,
    grades_released_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "t6",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a6"],
    title: "Ficha - Leis de Newton",
    status: "published",
    due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    artifacts: [{ id: "a6", artifact_type: "worksheet", artifact_name: "Ficha Newton", icon: null }],
    teacher_name: "Prof. João",
    teacher_avatar: null,
    student_count: 10,
    submitted_count: 7,
    instructions: null,
    grades_released_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "t7",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a7", "a8"],
    title: "Trabalho de Grupo - História",
    status: "published",
    due_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    artifacts: [
      { id: "a7", artifact_type: "doc", artifact_name: "Trabalho História", icon: null },
      { id: "a8", artifact_type: "presentation", artifact_name: "Apresentação", icon: null },
    ],
    teacher_name: "Prof. Carlos",
    teacher_avatar: null,
    student_count: 20,
    submitted_count: 15,
    instructions: null,
    grades_released_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  // Completed/Closed assignments (5) - use future dates so no "Expirado"
  {
    id: "t8",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a9"],
    title: "Quiz - Funções Quadráticas",
    status: "closed",
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Future date
    artifacts: [{ id: "a9", artifact_type: "quiz", artifact_name: "Quiz Funções", icon: null }],
    teacher_name: "Prof. Ana",
    teacher_avatar: null,
    student_count: 12,
    submitted_count: 12,
    instructions: null,
    grades_released_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "t9",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a10"],
    title: "Ficha - Trigonometria",
    status: "closed",
    due_date: null, // No due date
    artifacts: [{ id: "a10", artifact_type: "worksheet", artifact_name: "Ficha Trig", icon: null }],
    teacher_name: "Prof. Ana",
    teacher_avatar: null,
    student_count: 12,
    submitted_count: 11,
    instructions: null,
    grades_released_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "t10",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a11"],
    title: "Apresentação - Present Perfect",
    status: "closed",
    due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // Future date
    artifacts: [{ id: "a11", artifact_type: "presentation", artifact_name: "Pres. Perfect", icon: null }],
    teacher_name: "Prof. Sarah",
    teacher_avatar: null,
    student_count: 15,
    submitted_count: 15,
    instructions: null,
    grades_released_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "t11",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a12"],
    title: "Teste - Revolução Industrial",
    status: "closed",
    due_date: null, // No due date
    artifacts: [{ id: "a12", artifact_type: "quiz", artifact_name: "Teste História", icon: null }],
    teacher_name: "Prof. Carlos",
    teacher_avatar: null,
    student_count: 20,
    submitted_count: 19,
    instructions: null,
    grades_released_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "t12",
    organization_id: "org-1",
    teacher_id: "teacher-1",
    class_id: null,
    student_ids: null,
    artifact_ids: ["a13"],
    title: "Ficha - Orações Subordinadas",
    status: "closed",
    due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // Future date
    artifacts: [{ id: "a13", artifact_type: "worksheet", artifact_name: "Ficha Orações", icon: null }],
    teacher_name: "Prof. Maria",
    teacher_avatar: null,
    student_count: 12,
    submitted_count: 12,
    instructions: null,
    grades_released_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ── Component ──────────────────────────────────────────

interface LandingAssignmentsWrapperProps {
  className?: string;
}

export function LandingAssignmentsWrapper({ className }: LandingAssignmentsWrapperProps) {
  return (
    <MacWindowFrame className={className}>
      <div className="h-[400px]">
        <LandingAssignmentsShowcase
          assignments={MOCK_ASSIGNMENTS}
        />
      </div>
    </MacWindowFrame>
  );
}
