"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/materiais/PageHeader";
import { SubjectsGallery } from "@/components/materiais/SubjectsGallery";
import { IntegratedCurriculumViewer } from "@/components/materiais/IntegratedCurriculumViewer";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import {
    fetchSubjectCatalog,
    updateSubjectPreferences,
    type SubjectCatalog,
    type MaterialSubject,
} from "@/lib/materials";

export default function MeusMateriaisPage() {
    /* ─── STATE ──────────────────────────────────────────── */
    const [catalog, setCatalog] = useState<SubjectCatalog | null>(null);
    const [selectedSubjects, setSelectedSubjects] = useState<MaterialSubject[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSubject, setActiveSubject] = useState<MaterialSubject | null>(null);

    // Dialogs
    const [selectorOpen, setSelectorOpen] = useState(false);

    /* ─── FETCH CATALOG ──────────────────────────────────── */
    const loadCatalog = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchSubjectCatalog();
            setCatalog(data);
            setSelectedSubjects(data.selected_subjects);
        } catch (err) {
            console.error("Failed to load subject catalog", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCatalog();
    }, [loadCatalog]);

    // Auto-select first subject when subjects load
    useEffect(() => {
        if (selectedSubjects.length > 0 && !activeSubject) {
            setActiveSubject(selectedSubjects[0]);
        }
    }, [selectedSubjects, activeSubject]);

    /* ─── SUBJECT ACTIONS ─────────────────────────────────── */
    const handleSubjectClick = (subject: MaterialSubject) => {
        setActiveSubject(subject);
    };

    const handleToggleSubject = async (subject: MaterialSubject) => {
        const updatedSubjects = selectedSubjects.find((s) => s.id === subject.id)
            ? selectedSubjects.filter((s) => s.id !== subject.id)
            : [
                ...selectedSubjects,
                { ...subject, is_selected: true, selected_grade: null },
            ];

        setSelectedSubjects(updatedSubjects);

        // Persist to backend
        try {
            await updateSubjectPreferences(updatedSubjects.map((s) => s.id));
        } catch (err) {
            console.error("Failed to save subject preferences", err);
        }
    };

    const handleRemoveSubject = async (subjectId: string) => {
        const updatedSubjects = selectedSubjects.filter((s) => s.id !== subjectId);
        setSelectedSubjects(updatedSubjects);

        // Persist to backend
        try {
            await updateSubjectPreferences(updatedSubjects.map((s) => s.id));
        } catch (err) {
            console.error("Failed to save subject preferences", err);
        }
    };


    /* ─── RENDER ──────────────────────────────────────────── */
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="space-y-10 pb-12"
        >
            <PageHeader
                onAddSubjectClick={() => setSelectorOpen(true)}
            />

            <SubjectsGallery
                subjects={selectedSubjects}
                loading={loading}
                onSubjectClick={handleSubjectClick}
            />

            <IntegratedCurriculumViewer subject={activeSubject} />

            {/* Subject Selector Dialog */}
            <SubjectSelector
                open={selectorOpen}
                onOpenChange={setSelectorOpen}
                catalog={catalog}
                selectedSubjects={selectedSubjects}
                onToggleSubject={handleToggleSubject}
                onRemoveSubject={handleRemoveSubject}
            />
        </motion.div>
    );
}
