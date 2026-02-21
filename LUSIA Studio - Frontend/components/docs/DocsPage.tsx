"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, Upload, ChevronDown, FolderPlus } from "lucide-react";
import Image from "next/image";
import { Artifact, fetchArtifacts, deleteArtifact } from "@/lib/artifacts";
import { fetchSubjectCatalog, updateSubjectPreferences, MaterialSubject, SubjectCatalog } from "@/lib/materials";
import { CreateDocDialog } from "@/components/docs/CreateDocDialog";
import { UploadDocDialog } from "@/components/docs/UploadDocDialog";
import { ProcessingStatusBar } from "@/components/docs/ProcessingStatusBar";
import { QuizArtifactEditorDialog } from "@/components/quiz/QuizArtifactEditorDialog";
import { SubjectsGallery } from "@/components/materiais/SubjectsGallery";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import { DocsDataTable } from "@/components/docs/DocsDataTable";
import { LusiaShimmer } from "@/components/docs/LusiaShimmer";
import { useUser } from "@/components/providers/UserProvider";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export function DocsPage() {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [quizEditorArtifactId, setQuizEditorArtifactId] = useState<string | null>(null);
    const { user } = useUser();

    // Subject filtering
    const [catalog, setCatalog] = useState<SubjectCatalog | null>(null);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [activeSubject, setActiveSubject] = useState<MaterialSubject | null>(null);
    const [selectorOpen, setSelectorOpen] = useState(false);


    // Load artifacts (no server-side type filter — we filter client-side now)
    const loadArtifacts = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchArtifacts();
            setArtifacts(data);
        } catch (e) {
            console.error("Failed to fetch artifacts:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load subject catalog
    useEffect(() => {
        setCatalogLoading(true);
        fetchSubjectCatalog()
            .then(setCatalog)
            .catch(() => setCatalog(null))
            .finally(() => setCatalogLoading(false));
    }, []);

    useEffect(() => {
        loadArtifacts();
    }, [loadArtifacts]);


    const handleDelete = async (id: string) => {
        try {
            await deleteArtifact(id);
            loadArtifacts();
        } catch (e) {
            console.error("Failed to delete artifact:", e);
        }
    };

    const handleSubjectClick = (subject: MaterialSubject) => {
        if (activeSubject?.id === subject.id) {
            setActiveSubject(null);
        } else {
            setActiveSubject(subject);
        }
    };

    const handleAddSubject = () => {
        setSelectorOpen(true);
    };

    const handleToggleSubject = async (subject: MaterialSubject) => {
        const currentSubjects = catalog?.selected_subjects || [];
        const updatedSubjects = currentSubjects.find((s) => s.id === subject.id)
            ? currentSubjects.filter((s) => s.id !== subject.id)
            : [
                ...currentSubjects,
                { ...subject, is_selected: true, selected_grade: null },
            ];

        // Update catalog state
        if (catalog) {
            setCatalog({
                ...catalog,
                selected_subjects: updatedSubjects,
            });
        }

        // Persist to backend
        try {
            await updateSubjectPreferences(updatedSubjects.map((s) => s.id));
        } catch (err) {
            console.error("Failed to save subject preferences", err);
        }
    };

    const handleRemoveSubject = async (subjectId: string) => {
        const currentSubjects = catalog?.selected_subjects || [];
        const updatedSubjects = currentSubjects.filter((s) => s.id !== subjectId);

        // Update catalog state
        if (catalog) {
            setCatalog({
                ...catalog,
                selected_subjects: updatedSubjects,
            });
        }

        // Persist to backend
        try {
            await updateSubjectPreferences(updatedSubjects.map((s) => s.id));
        } catch (err) {
            console.error("Failed to save subject preferences", err);
        }
    };

    // Client-side filtering
    const filteredArtifacts = useMemo(() => {
        let result = artifacts;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter((a) => a.artifact_name.toLowerCase().includes(q));
        }
        if (filterType) {
            result = result.filter((a) => a.artifact_type === filterType);
        }
        if (activeSubject) {
            result = result.filter((a) => a.subject_id === activeSubject.id);
        }
        return result;
    }, [artifacts, searchQuery, filterType, activeSubject]);

    const subjects = catalog?.selected_subjects || [];

    return (
        <div className="max-w-full mx-auto w-full h-full flex flex-col">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col h-full"
            >
                <header className="mb-0">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">Materiais</h1>
                    <p className="text-brand-primary/70 mt-1">
                        Organiza e gere os teus documentos e recursos de estudo.
                    </p>
                </header>

                {/* Subject Folders */}
                <div>
                    <SubjectsGallery
                        subjects={subjects}
                        loading={catalogLoading}
                        activeSubjectId={activeSubject?.id ?? null}
                        onSubjectClick={handleSubjectClick}
                        onAddSubjectClick={handleAddSubject}
                    />
                </div>

                {/* Processing status */}
                {user?.id && (
                    <ProcessingStatusBar
                        userId={user.id}
                        onDocumentProcessed={loadArtifacts}
                    />
                )}

                {/* Data table */}
                <div className="flex-1 min-h-0">
                    <DocsDataTable
                            artifacts={filteredArtifacts}
                            loading={loading}
                            onDelete={handleDelete}
                            onOpenQuiz={(id) => setQuizEditorArtifactId(id)}
                            catalog={catalog}
                            activeSubject={activeSubject}
                            onClearActiveSubject={() => setActiveSubject(null)}
                            onArtifactUpdated={(updated) =>
                                setArtifacts((prev) =>
                                    prev.map((a) => (a.id === updated.id ? updated : a))
                                )
                            }
                            toolbarRight={
                                <>
                                    <Button
                                        onClick={handleAddSubject}
                                        variant="outline"
                                        size="sm"
                                        className="gap-2 h-8 min-w-0 px-3 shrink-0"
                                    >
                                        <FolderPlus className="h-4 w-4 shrink-0" />
                                        <span className="hidden @[680px]:inline truncate">Adicionar Disciplina</span>
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="sm" className="gap-2 h-8 min-w-0 px-3 shrink-0">
                                                <Plus className="h-4 w-4 shrink-0" />
                                                <span className="hidden @[580px]:inline truncate">Adicionar Documento</span>
                                                <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0 hidden @[580px]:inline" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuItem
                                                onClick={() => setCreateOpen(true)}
                                                className="relative overflow-hidden cursor-pointer py-2.5"
                                            >
                                                <LusiaShimmer />
                                                <div className="flex items-center gap-2.5 relative z-10">
                                                    <Image
                                                        src="/lusia-symbol.png"
                                                        alt="LUSIA"
                                                        width={20}
                                                        height={20}
                                                        className="shrink-0"
                                                    />
                                                    <span className="text-sm">
                                                        Criar com{" "}
                                                        <span className="font-lusia">LUSIA</span>
                                                    </span>
                                                </div>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => setUploadOpen(true)}
                                                className="cursor-pointer py-2.5"
                                            >
                                                <Upload className="h-4 w-4 mr-2.5" />
                                                <span className="text-sm">Carregar Documento</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </>
                            }
                    />
                </div>
            </motion.div>

            <CreateDocDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreated={loadArtifacts}
            />

            <UploadDocDialog
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                onUploaded={loadArtifacts}
            />

            <QuizArtifactEditorDialog
                open={Boolean(quizEditorArtifactId)}
                artifactId={quizEditorArtifactId}
                onOpenChange={(next) => {
                    if (!next) setQuizEditorArtifactId(null);
                }}
                onSaved={loadArtifacts}
            />

            {/* Subject Selector Dialog */}
            <SubjectSelector
                open={selectorOpen}
                onOpenChange={setSelectorOpen}
                catalog={catalog}
                selectedSubjects={catalog?.selected_subjects || []}
                onToggleSubject={handleToggleSubject}
                onRemoveSubject={handleRemoveSubject}
            />
        </div>
    );
}
