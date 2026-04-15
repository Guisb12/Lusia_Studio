"use client";

import React, { useState, useMemo } from "react";
import { MacWindowFrame } from "./MacWindowFrame";
import { LandingMaterialsShowcase } from "./LandingMaterialsShowcase";
import { MaterialSubject } from "@/lib/materials";
import { Artifact } from "@/lib/artifacts";
import { subDays } from "date-fns";

// ── Mock Data ──────────────────────────────────────────

const MOCK_SUBJECTS: MaterialSubject[] = [
  { id: "mat-a-10", name: "Matemática A", slug: "matematica-a", color: "#0a1bb6", icon: "calculator", education_level: "secondary", education_level_label: "Secundário", grade_levels: ["10º", "11º", "12º"], status: "full", is_custom: false, is_selected: true, selected_grade: "10º", has_national_exam: true },
  { id: "por-10", name: "Português", slug: "portugues", color: "#dc2626", icon: "book-open", education_level: "secondary", education_level_label: "Secundário", grade_levels: ["10º", "11º", "12º"], status: "full", is_custom: false, is_selected: true, selected_grade: "10º", has_national_exam: true },
  { id: "fis-11", name: "Física", slug: "fisica", color: "#7c3aed", icon: "atom", education_level: "secondary", education_level_label: "Secundário", grade_levels: ["11º", "12º"], status: "full", is_custom: false, is_selected: true, selected_grade: "11º", has_national_exam: true },
  { id: "ing-10", name: "Inglês", slug: "ingles", color: "#ea580c", icon: "globe", education_level: "secondary", education_level_label: "Secundário", grade_levels: ["10º", "11º", "12º"], status: "full", is_custom: false, is_selected: true, selected_grade: "10º", has_national_exam: false },
  { id: "hist-10", name: "História", slug: "historia", color: "#9333ea", icon: "landmark", education_level: "secondary", education_level_label: "Secundário", grade_levels: ["10º", "11º", "12º"], status: "full", is_custom: false, is_selected: true, selected_grade: "10º", has_national_exam: true },
];

const MOCK_ARTIFACTS: Artifact[] = [
  { id: "a1", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Ficha de Trabalho - Funções Quadráticas", artifact_type: "worksheet", icon: null, subject_ids: ["mat-a-10"], subject_id: "mat-a-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 1).toISOString(), updated_at: subDays(new Date(), 1).toISOString() },
  { id: "a2", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Quiz - Trigonometria", artifact_type: "quiz", icon: null, subject_ids: ["mat-a-10"], subject_id: "mat-a-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 3).toISOString(), updated_at: subDays(new Date(), 3).toISOString() },
  { id: "a3", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Apresentação - Números Complexos", artifact_type: "presentation", icon: null, subject_ids: ["mat-a-10"], subject_id: "mat-a-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 5).toISOString(), updated_at: subDays(new Date(), 5).toISOString() },
  { id: "a4", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Ficha - Orações Subordinadas", artifact_type: "worksheet", icon: null, subject_ids: ["por-10"], subject_id: "por-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 2).toISOString(), updated_at: subDays(new Date(), 2).toISOString() },
  { id: "a5", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Quiz - Figuras de Estilo", artifact_type: "quiz", icon: null, subject_ids: ["por-10"], subject_id: "por-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 4).toISOString(), updated_at: subDays(new Date(), 4).toISOString() },
  { id: "a6", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Análise - Os Lusíadas", artifact_type: "doc", icon: null, subject_ids: ["por-10"], subject_id: "por-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 6).toISOString(), updated_at: subDays(new Date(), 6).toISOString() },
  { id: "a7", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Ficha - Leis de Newton", artifact_type: "worksheet", icon: null, subject_ids: ["fis-11"], subject_id: "fis-11", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "11º", year_levels: ["11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 1).toISOString(), updated_at: subDays(new Date(), 1).toISOString() },
  { id: "a8", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Apresentação - Campo Elétrico", artifact_type: "presentation", icon: null, subject_ids: ["fis-11"], subject_id: "fis-11", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "11º", year_levels: ["11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 4).toISOString(), updated_at: subDays(new Date(), 4).toISOString() },
  { id: "a9", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Ficha - Present Perfect", artifact_type: "worksheet", icon: null, subject_ids: ["ing-10"], subject_id: "ing-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 2).toISOString(), updated_at: subDays(new Date(), 2).toISOString() },
  { id: "a10", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Quiz - Vocabulary", artifact_type: "quiz", icon: null, subject_ids: ["ing-10"], subject_id: "ing-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 5).toISOString(), updated_at: subDays(new Date(), 5).toISOString() },
  { id: "a11", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Apresentação - Revolução Industrial", artifact_type: "presentation", icon: null, subject_ids: ["hist-10"], subject_id: "hist-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 3).toISOString(), updated_at: subDays(new Date(), 3).toISOString() },
  { id: "a12", organization_id: "org-1", user_id: "teacher-1", artifact_name: "Ficha - Feudalismo", artifact_type: "worksheet", icon: null, subject_ids: ["hist-10"], subject_id: "hist-10", content: {}, source_type: "created", conversion_requested: false, storage_path: null, tiptap_json: null, markdown_content: null, is_processed: true, processing_failed: false, processing_error: null, year_level: "10º", year_levels: ["10º", "11º", "12º"], subject_component: null, curriculum_codes: null, is_public: false, created_at: subDays(new Date(), 6).toISOString(), updated_at: subDays(new Date(), 6).toISOString() },
];

// ── Component ──────────────────────────────────────────

interface LandingMaterialsWrapperProps {
  className?: string;
}

export function LandingMaterialsWrapper({ className }: LandingMaterialsWrapperProps) {
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);

  return (
    <MacWindowFrame className={className}>
      <div className="h-[400px]">
        <LandingMaterialsShowcase
          subjects={MOCK_SUBJECTS}
          artifacts={MOCK_ARTIFACTS}
          activeSubjectId={activeSubjectId}
          onSubjectClick={setActiveSubjectId}
        />
      </div>
    </MacWindowFrame>
  );
}
