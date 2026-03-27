export type DiagramType = "mindmap" | "flowchart" | "sequence";
export type DiagramKind = "concept" | "step" | "outcome" | "example" | "question";

export interface DiagramNode {
    id: string;
    parent_id: string | null;
    label: string;
    summary: string;
    kind: DiagramKind;
    relation: string | null;
    order: number;
}

export interface DiagramContent {
    title: string;
    diagram_type: DiagramType;
    phase: "pending" | "planning" | "generating_diagram" | "completed" | "failed" | string;
    generation_params?: Record<string, any>;
    nodes: DiagramNode[];
    warnings?: string[];
    stats?: Record<string, any>;
}

export type DiagramStreamEvent =
    | { type: "hydrate"; diagram: DiagramContent; is_processed: boolean; processing_failed: boolean; warnings?: string[] }
    | { type: "status"; step?: string; step_label?: string }
    | { type: "diagram_updated"; diagram: DiagramContent }
    | { type: "node_added"; node: DiagramNode }
    | { type: "node_updated"; node: DiagramNode }
    | { type: "node_committed"; node: DiagramNode }
    | { type: "done"; artifact_id: string }
    | { type: "error"; message: string };

export interface DiagramStreamState {
    diagram: DiagramContent | null;
    status: string | null;
    status_label: string | null;
    done: boolean;
    error: string | null;
}
