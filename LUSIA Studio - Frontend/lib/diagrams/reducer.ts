import type { DiagramContent, DiagramNode, DiagramStreamEvent, DiagramStreamState } from "@/lib/diagrams/types";

function sortNodes(nodes: DiagramNode[]): DiagramNode[] {
    return [...nodes].sort((a, b) => {
        const aParent = a.parent_id ?? "";
        const bParent = b.parent_id ?? "";
        if (aParent !== bParent) return aParent.localeCompare(bParent);
        if (a.order !== b.order) return a.order - b.order;
        return a.id.localeCompare(b.id);
    });
}

function upsertNode(diagram: DiagramContent, node: DiagramNode): DiagramContent {
    const existing = diagram.nodes.find((item) => item.id === node.id);
    const nextNodes = existing
        ? diagram.nodes.map((item) => (item.id === node.id ? node : item))
        : [...diagram.nodes, node];
    return {
        ...diagram,
        nodes: sortNodes(nextNodes),
    };
}

export function createInitialDiagramStreamState(): DiagramStreamState {
    return {
        diagram: null,
        status: null,
        status_label: null,
        done: false,
        error: null,
    };
}

export function reduceDiagramStreamEvent(
    state: DiagramStreamState,
    event: DiagramStreamEvent,
): DiagramStreamState {
    if (event.type === "hydrate") {
        return {
            diagram: {
                ...event.diagram,
                nodes: sortNodes(event.diagram.nodes ?? []),
                warnings: event.warnings ?? event.diagram.warnings ?? [],
            },
            status: event.diagram.phase ?? null,
            status_label: null,
            done: event.is_processed,
            error: event.processing_failed ? "processing_failed" : null,
        };
    }

    if (event.type === "status") {
        return {
            ...state,
            status: event.step ?? state.status,
            status_label: event.step_label ?? state.status_label,
        };
    }

    if (event.type === "diagram_updated") {
        return {
            ...state,
            diagram: {
                ...event.diagram,
                nodes: sortNodes(event.diagram.nodes ?? []),
            },
        };
    }

    if (event.type === "node_added" || event.type === "node_updated" || event.type === "node_committed") {
        return {
            ...state,
            diagram: state.diagram
                ? upsertNode(state.diagram, event.node)
                : {
                    title: "",
                    diagram_type: "mindmap",
                    phase: "generating_diagram",
                    nodes: [event.node],
                },
        };
    }

    if (event.type === "done") {
        return {
            ...state,
            done: true,
        };
    }

    if (event.type === "error") {
        return {
            ...state,
            error: event.message,
        };
    }

    return state;
}

export function getRoots(diagram: DiagramContent | null): DiagramNode[] {
    if (!diagram) return [];
    return sortNodes(diagram.nodes.filter((node) => !node.parent_id));
}

export function getChildrenSorted(diagram: DiagramContent | null, parentId: string | null): DiagramNode[] {
    if (!diagram) return [];
    return sortNodes(diagram.nodes.filter((node) => (node.parent_id ?? null) === parentId));
}

export function groupByParent(diagram: DiagramContent | null): Record<string, DiagramNode[]> {
    if (!diagram) return {};
    return diagram.nodes.reduce<Record<string, DiagramNode[]>>((acc, node) => {
        const key = node.parent_id ?? "__root__";
        acc[key] = acc[key] ? [...acc[key], node] : [node];
        acc[key] = sortNodes(acc[key]);
        return acc;
    }, {});
}
