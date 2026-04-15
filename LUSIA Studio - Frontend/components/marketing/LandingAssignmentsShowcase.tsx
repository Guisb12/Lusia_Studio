"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Assignment, ArtifactMeta } from "@/lib/assignments";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { ArtifactTypeIcon } from "@/components/docs/ArtifactIcon";

// ── Extended Assignment type for landing page mock data ──────────────

interface LandingAssignment extends Assignment {
  artifacts: ArtifactMeta[];
}

// ── Types ─────────────────────────────────────────────

interface LandingAssignmentsShowcaseProps {
  assignments: LandingAssignment[];
}

// ── Color Helpers (EXACT COPY from KanbanCard.tsx) ───────────────────

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return ((hash % 1000) + 1000) % 1000 / 1000;
}

/** Convert hex accent to a solid pastel background (like post-it paper) */
function accentToPastel(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const pr = Math.round(255 * 0.85 + r * 0.15);
  const pg = Math.round(255 * 0.85 + g * 0.15);
  const pb = Math.round(255 * 0.85 + b * 0.15);
  return `rgb(${pr}, ${pg}, ${pb})`;
}

/** Darker tint for tags on top of pastel */
function accentToTagBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const pr = Math.round(255 * 0.72 + r * 0.28);
  const pg = Math.round(255 * 0.72 + g * 0.28);
  const pb = Math.round(255 * 0.72 + b * 0.28);
  return `rgb(${pr}, ${pg}, ${pb})`;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ── Date Formatting (EXACT COPY from KanbanCard.tsx) ───────────────────

function formatDueDate(date: string | null) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const dueStart = new Date(d);
  dueStart.setHours(0, 0, 0, 0);
  const days = Math.round(
    (dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  
  if (d < now) return { text: "Expirado", short: "Expirado", color: "text-red-500", bg: "bg-red-100", dotColor: "bg-red-400" };
  if (days === 0) return { text: "Hoje", short: "Hoje", color: "text-amber-600", bg: "bg-amber-100", dotColor: "bg-amber-400" };
  if (days === 1) return { text: "Amanhã", short: "Amanhã", color: "text-amber-600", bg: "bg-amber-100", dotColor: "bg-amber-400" };
  return {
    text: `${d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}`,
    short: `${days}d`,
    color: "text-gray-500",
    bg: "bg-gray-100",
    dotColor: "bg-gray-300",
  };
}

// ── Mini Kanban Card (Compact for landing page) ──────────────────────

interface MiniKanbanCardProps {
  assignment: LandingAssignment;
  accentColor: string;
}

function MiniKanbanCard({ assignment, accentColor }: MiniKanbanCardProps) {
  const rotation = useMemo(() => seededRandom(assignment.id) * 3 - 1.5, [assignment.id]);
  const tapeRotation = useMemo(() => -1.5 + seededRandom(assignment.id + "t") * 3, [assignment.id]);
  
  const due = formatDueDate(assignment.due_date);
  const studentCount = assignment.student_count ?? 0;
  const submittedCount = assignment.submitted_count ?? 0;
  const progress = studentCount > 0 ? Math.round((submittedCount / studentCount) * 100) : 0;
  
  const artifacts = assignment.artifacts ?? [];
  const artifactTypes = new Set(artifacts.map((a) => a.artifact_type));
  const hasMixedTypes = artifactTypes.size > 1;
  const firstArtifactType = artifacts[0]?.artifact_type;
  
  const tagBg = accentToTagBg(accentColor);
  const pastelBg = accentToPastel(accentColor);

  // Tape effect component
  const tape = (
    <div
      className="absolute -top-[4px] left-1/2 w-[32px] h-[9px] rounded-sm pointer-events-none z-10"
      style={{
        backgroundColor: "rgba(255,255,255,0.85)",
        transform: `translateX(-50%) rotate(${tapeRotation}deg)`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    />
  );

  return (
    <div
      className="group relative overflow-visible rounded-lg border-[1.5px] border-black/[0.06] p-2.5 flex flex-col cursor-default"
      style={{
        backgroundColor: pastelBg,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        transform: `rotate(${rotation}deg)`,
        width: "100%",
        minWidth: "140px",
      }}
    >
      {tape}
      
      {/* Title with icon */}
      <div className="flex items-start gap-1.5 mb-1.5">
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
          style={{ backgroundColor: tagBg, color: accentColor }}
        >
          {hasMixedTypes || !firstArtifactType ? (
            <Clock className="h-3 w-3" />
          ) : (
            <ArtifactTypeIcon type={firstArtifactType} size={10} />
          )}
        </div>
        <p className="line-clamp-2 text-[10px] font-semibold leading-[1.2] text-gray-800">
          {assignment.title || "TPC"}
        </p>
      </div>

      {/* Due date badge */}
      {due && (
        <div className="flex items-center gap-1 mb-1.5">
          <span className={cn("text-[8px] font-medium px-1.5 py-0.5 rounded", due.bg, due.color)}>
            {due.short}
          </span>
        </div>
      )}

      {/* Progress bar */}
      {studentCount > 0 && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: tagBg }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: `${accentColor}90` }}
            />
          </div>
          <span className="text-[7px] text-gray-500 font-medium shrink-0">
            {submittedCount}/{studentCount}
          </span>
        </div>
      )}

      {/* Bottom row: Teacher avatar + submission status */}
      <div className="flex items-center justify-between mt-auto">
        {/* Teacher avatar */}
        <div
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[5px] font-bold text-white ring-1 ring-black/[0.06]"
          style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
        >
          {getInitials(assignment.teacher_name)}
        </div>

        {/* Artifact count */}
        {artifacts.length > 0 && (
          <span
            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[7px] font-medium"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            <ArtifactTypeIcon type={artifacts[0].artifact_type} size={8} />
            {artifacts.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────

interface KanbanColumnProps {
  title: string;
  count: number;
  assignments: LandingAssignment[];
  columnColor: string;
  statusBadge?: {
    icon: React.ReactNode;
    color: string;
    bg: string;
  };
}

function KanbanColumn({ title, count, assignments, columnColor, statusBadge }: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-[140px] flex-1 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1 shrink-0">
        <div className="flex items-center gap-1.5">
          {statusBadge && (
            <span className={cn("flex items-center justify-center rounded-full p-0.5", statusBadge.bg)}>
              {statusBadge.icon}
            </span>
          )}
          <span className="text-[10px] font-semibold" style={{ color: `${columnColor}B3` }}>{title}</span>
        </div>
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${columnColor}15`, color: `${columnColor}99` }}>
          {count}
        </span>
      </div>

      {/* Cards - fill available height */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-0">
        {assignments.map((assignment) => (
          <MiniKanbanCard
            key={assignment.id}
            assignment={assignment}
            accentColor={columnColor}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────

export function LandingAssignmentsShowcase({
  assignments,
}: LandingAssignmentsShowcaseProps) {
  // Group assignments by status
  const pendingAssignments = assignments.filter(
    (a) => a.status === "published" && (!a.due_date || new Date(a.due_date) >= new Date())
  );
  const inProgressAssignments = assignments.filter(
    (a) => a.status === "published" && a.due_date && new Date(a.due_date) < new Date()
  );
  const completedAssignments = assignments.filter(
    (a) => a.status === "closed" || (a.submitted_count && a.student_count && a.submitted_count >= a.student_count)
  );

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Kanban columns */}
      <div className="flex-1 min-h-0 p-4 overflow-hidden">
        <div className="flex gap-4 h-full">
          <KanbanColumn
            title="Pendente"
            count={pendingAssignments.length}
            assignments={pendingAssignments}
            columnColor="#10b981"
            statusBadge={{
              icon: <Clock className="h-3 w-3 text-emerald-600" />,
              color: "text-emerald-600",
              bg: "bg-emerald-100",
            }}
          />
          <KanbanColumn
            title="Em Progresso"
            count={inProgressAssignments.length}
            assignments={inProgressAssignments}
            columnColor="#f59e0b"
            statusBadge={{
              icon: <AlertCircle className="h-3 w-3 text-amber-600" />,
              color: "text-amber-600",
              bg: "bg-amber-100",
            }}
          />
          <KanbanColumn
            title="Entregue"
            count={completedAssignments.length}
            assignments={completedAssignments}
            columnColor="#1e40af"
            statusBadge={{
              icon: <CheckCircle2 className="h-3 w-3 text-blue-700" />,
              color: "text-blue-700",
              bg: "bg-blue-100",
            }}
          />
        </div>
      </div>
    </div>
  );
}
