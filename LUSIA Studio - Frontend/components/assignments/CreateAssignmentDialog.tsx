"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { StudentPicker } from "@/components/calendar/StudentPicker";
import { StudentInfo } from "@/components/calendar/StudentHoverCard";
import { Artifact, fetchArtifacts } from "@/lib/artifacts";
import { createAssignment, AssignmentCreate } from "@/lib/assignments";
import { cn } from "@/lib/utils";
import { CalendarDays, Link2 } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface CreateAssignmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}

export function CreateAssignmentDialog({
    open,
    onOpenChange,
    onCreated,
}: CreateAssignmentDialogProps) {
    const [title, setTitle] = useState("");
    const [instructions, setInstructions] = useState("");
    const [artifactId, setArtifactId] = useState<string | null>(null);
    const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [saving, setSaving] = useState(false);
    const [selectedStudents, setSelectedStudents] = useState<StudentInfo[]>([]);

    // Load artifacts
    useEffect(() => {
        if (open) {
            fetchArtifacts().then(setArtifacts).catch(() => setArtifacts([]));
        }
    }, [open]);

    // Reset on close
    useEffect(() => {
        if (!open) {
            setTitle("");
            setInstructions("");
            setArtifactId(null);
            setDueDate(undefined);
            setSelectedStudents([]);
        }
    }, [open]);

    const handleSave = async (status: "draft" | "published") => {
        setSaving(true);
        try {
            const data: AssignmentCreate = {
                title: title.trim() || undefined,
                instructions: instructions.trim() || undefined,
                artifact_id: artifactId || undefined,
                student_ids: selectedStudents.length > 0 ? selectedStudents.map((s) => s.id) : undefined,
                due_date: dueDate ? dueDate.toISOString() : undefined,
                status,
            };
            await createAssignment(data);
            onOpenChange(false);
            onCreated();
        } catch (e) {
            console.error("Failed to create assignment:", e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-instrument text-brand-primary">
                        Novo TPC
                    </DialogTitle>
                </DialogHeader>

                <div className="py-2 space-y-5">
                    {/* Title */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/80">Título</Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ex: Exercícios de Matemática — Cap. 5"
                            autoFocus
                        />
                    </div>

                    {/* Instructions */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/80">Instruções</Label>
                        <Textarea
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="Ex: Resolver os exercícios 1 a 15 do manual..."
                            rows={3}
                            className="resize-none"
                        />
                    </div>

                    {/* Attach artifact */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/80 flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5" />
                            Documento associado
                            <span className="text-brand-primary/30 font-normal">(opcional)</span>
                        </Label>
                        <Select
                            value={artifactId || "none"}
                            onValueChange={(v) => setArtifactId(v === "none" ? null : v)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecionar documento..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhum</SelectItem>
                                {artifacts.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                        {a.icon || "📄"} {a.artifact_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Due date */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/80">Data de entrega</Label>
                        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-start gap-2 text-left font-normal",
                                        !dueDate && "text-brand-primary/40"
                                    )}
                                >
                                    <CalendarDays className="h-4 w-4" />
                                    {dueDate
                                        ? format(dueDate, "PPP", { locale: pt })
                                        : "Selecionar data..."}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={dueDate}
                                    onSelect={(d) => {
                                        setDueDate(d);
                                        setCalendarOpen(false);
                                    }}
                                    disabled={(date) => date < new Date()}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Students — reusing the exact same StudentPicker from calendar */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/80">Alunos</Label>
                        <StudentPicker
                            value={selectedStudents}
                            onChange={setSelectedStudents}
                            dropUp
                        />
                    </div>
                </div>

                <DialogFooter className="flex items-center justify-between gap-2">
                    <Button
                        variant="outline"
                        onClick={() => handleSave("draft")}
                        disabled={saving}
                    >
                        Guardar rascunho
                    </Button>
                    <Button
                        onClick={() => handleSave("published")}
                        disabled={saving || !title.trim()}
                    >
                        {saving ? "A criar..." : "Publicar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
