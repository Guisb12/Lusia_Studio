export type DiagramKind = "concept" | "step" | "outcome" | "example" | "question";
export type DiagramType = "mindmap" | "flowchart" | "sequence";

export interface DiagramLayoutNode {
  id: string;
  parent_id: string | null;
  label: string;
  summary: string;
  kind: DiagramKind;
  relation: string | null;
  order: number;
}

export interface DiagramLayoutContent {
  title: string;
  diagram_type: DiagramType;
  phase: string;
  nodes: DiagramLayoutNode[];
}

export interface LayoutRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type EdgeDirection = "right" | "left" | "down";

export interface LayoutEdge {
  from: string;
  to: string;
  relation: string | null;
  branchIndex: number;
  direction: EdgeDirection;
}

export interface LayoutResult {
  rects: LayoutRect[];
  edges: LayoutEdge[];
  totalWidth: number;
  totalHeight: number;
}

export type DiagramLayoutMode = "mindmap" | "horizontal" | "flowchart";

export const DIAGRAM_NODE_W = 200;
export const DIAGRAM_ROOT_W = 230;
export const DIAGRAM_GAP_SIBLING = 24;
export const DIAGRAM_GAP_LEVEL = 120;
export const DIAGRAM_INITIAL_ZOOM = 0.55;
export const DIAGRAM_FIT_PADDING = 120;
export const DIAGRAM_MIN_FIT_ZOOM = 0.3;
export const DIAGRAM_MIN_ZOOM = 0.2;
export const DIAGRAM_MAX_ZOOM = 3;

function sortNodes(nodes: DiagramLayoutNode[]): DiagramLayoutNode[] {
  return [...nodes].sort((a, b) => {
    const aParent = a.parent_id ?? "";
    const bParent = b.parent_id ?? "";
    if (aParent !== bParent) return aParent.localeCompare(bParent);
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

function getRoots(diagram: DiagramLayoutContent | null): DiagramLayoutNode[] {
  if (!diagram) return [];
  return sortNodes(diagram.nodes.filter((node) => !node.parent_id));
}

function getChildrenSorted(diagram: DiagramLayoutContent | null, parentId: string | null): DiagramLayoutNode[] {
  if (!diagram) return [];
  return sortNodes(diagram.nodes.filter((node) => (node.parent_id ?? null) === parentId));
}

export function estimateNodeWidth(isRoot: boolean): number {
  return isRoot ? DIAGRAM_ROOT_W : DIAGRAM_NODE_W;
}

export function estimateNodeHeight(node: Pick<DiagramLayoutNode, "label" | "summary">, isRoot: boolean): number {
  const labelLines = Math.ceil(node.label.length / (isRoot ? 22 : 20));
  const summaryLines = node.summary ? Math.ceil(node.summary.length / (isRoot ? 30 : 26)) : 0;
  return 32 + labelLines * 20 + Math.min(summaryLines, 3) * 15 + 18;
}

interface SubtreeSize {
  w: number;
  h: number;
}

function computeSubtreeSize(
  diagram: DiagramLayoutContent,
  nodeId: string,
  isRoot: boolean,
  horizontal: boolean,
): SubtreeSize {
  const node = diagram.nodes.find((item) => item.id === nodeId);
  if (!node) return { w: 0, h: 0 };

  const children = getChildrenSorted(diagram, nodeId);
  const nodeW = estimateNodeWidth(isRoot);
  const nodeH = estimateNodeHeight(node, isRoot);

  if (children.length === 0) {
    return { w: nodeW, h: nodeH };
  }

  const childSizes = children.map((child) => computeSubtreeSize(diagram, child.id, false, horizontal));

  if (horizontal) {
    const childrenTotalH =
      childSizes.reduce((sum, size) => sum + size.h, 0) +
      (children.length - 1) * DIAGRAM_GAP_SIBLING;
    const childrenMaxW = Math.max(...childSizes.map((size) => size.w));
    return {
      w: nodeW + DIAGRAM_GAP_LEVEL + childrenMaxW,
      h: Math.max(nodeH, childrenTotalH),
    };
  }

  const childrenTotalW =
    childSizes.reduce((sum, size) => sum + size.w, 0) +
    (children.length - 1) * DIAGRAM_GAP_SIBLING;
  const childrenMaxH = Math.max(...childSizes.map((size) => size.h));
  return {
    w: Math.max(nodeW, childrenTotalW),
    h: nodeH + DIAGRAM_GAP_LEVEL + childrenMaxH,
  };
}

function layoutSubtree(
  diagram: DiagramLayoutContent,
  nodeId: string,
  isRoot: boolean,
  direction: EdgeDirection,
  offsetX: number,
  offsetY: number,
  rects: LayoutRect[],
  edges: LayoutEdge[],
  branchIndex: number,
): SubtreeSize {
  const node = diagram.nodes.find((item) => item.id === nodeId);
  if (!node) return { w: 0, h: 0 };

  const children = getChildrenSorted(diagram, nodeId);
  const nodeW = estimateNodeWidth(isRoot);
  const nodeH = estimateNodeHeight(node, isRoot);
  const subtreeSize = computeSubtreeSize(diagram, nodeId, isRoot, direction !== "down");

  if (direction === "right") {
    const nodeY = offsetY + (subtreeSize.h - nodeH) / 2;
    rects.push({ id: nodeId, x: offsetX, y: nodeY, w: nodeW, h: nodeH });

    let childY = offsetY;
    for (const child of children) {
      const childSize = computeSubtreeSize(diagram, child.id, false, true);
      layoutSubtree(
        diagram,
        child.id,
        false,
        "right",
        offsetX + nodeW + DIAGRAM_GAP_LEVEL,
        childY,
        rects,
        edges,
        branchIndex,
      );
      edges.push({ from: nodeId, to: child.id, relation: child.relation, branchIndex, direction: "right" });
      childY += childSize.h + DIAGRAM_GAP_SIBLING;
    }
  } else if (direction === "left") {
    const nodeY = offsetY + (subtreeSize.h - nodeH) / 2;
    rects.push({ id: nodeId, x: offsetX - nodeW, y: nodeY, w: nodeW, h: nodeH });

    let childY = offsetY;
    for (const child of children) {
      const childSize = computeSubtreeSize(diagram, child.id, false, true);
      layoutSubtree(
        diagram,
        child.id,
        false,
        "left",
        offsetX - nodeW - DIAGRAM_GAP_LEVEL,
        childY,
        rects,
        edges,
        branchIndex,
      );
      edges.push({ from: nodeId, to: child.id, relation: child.relation, branchIndex, direction: "left" });
      childY += childSize.h + DIAGRAM_GAP_SIBLING;
    }
  } else {
    const nodeX = offsetX + (subtreeSize.w - nodeW) / 2;
    rects.push({ id: nodeId, x: nodeX, y: offsetY, w: nodeW, h: nodeH });

    let childX = offsetX;
    for (const child of children) {
      const childSize = computeSubtreeSize(diagram, child.id, false, false);
      layoutSubtree(
        diagram,
        child.id,
        false,
        "down",
        childX,
        offsetY + nodeH + DIAGRAM_GAP_LEVEL,
        rects,
        edges,
        branchIndex,
      );
      edges.push({ from: nodeId, to: child.id, relation: child.relation, branchIndex, direction: "down" });
      childX += childSize.w + DIAGRAM_GAP_SIBLING;
    }
  }

  return subtreeSize;
}

export function layoutDiagram(
  diagram: DiagramLayoutContent,
  layoutOverride?: DiagramLayoutMode,
): LayoutResult {
  const roots = getRoots(diagram);
  if (roots.length === 0) return { rects: [], edges: [], totalWidth: 0, totalHeight: 0 };

  const effectiveType = layoutOverride ?? diagram.diagram_type;
  const rects: LayoutRect[] = [];
  const edges: LayoutEdge[] = [];

  if (effectiveType === "horizontal" || effectiveType === "sequence") {
    let offset = 0;
    const rootGap = 60;
    for (let index = 0; index < roots.length; index += 1) {
      const root = roots[index];
      layoutSubtree(diagram, root.id, true, "right", 0, offset, rects, edges, index);
      const size = computeSubtreeSize(diagram, root.id, true, true);
      offset += size.h + rootGap;
    }
    return {
      rects,
      edges,
      totalWidth: Math.max(1, ...rects.map((rect) => rect.x + rect.w)),
      totalHeight: Math.max(1, ...rects.map((rect) => rect.y + rect.h)),
    };
  }

  if (effectiveType === "flowchart") {
    let offset = 0;
    const rootGap = 60;
    for (let index = 0; index < roots.length; index += 1) {
      const root = roots[index];
      layoutSubtree(diagram, root.id, true, "down", offset, 0, rects, edges, index);
      const size = computeSubtreeSize(diagram, root.id, true, false);
      offset += size.w + rootGap;
    }
    return {
      rects,
      edges,
      totalWidth: Math.max(1, ...rects.map((rect) => rect.x + rect.w)),
      totalHeight: Math.max(1, ...rects.map((rect) => rect.y + rect.h)),
    };
  }

  for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
    const root = roots[rootIndex];
    const children = getChildrenSorted(diagram, root.id);
    const rootW = estimateNodeWidth(true);
    const rootH = estimateNodeHeight(root, true);
    const rightChildren = children.filter((_, index) => index % 2 === 0);
    const leftChildren = children.filter((_, index) => index % 2 === 1);

    const rightSizes = rightChildren.map((child) => computeSubtreeSize(diagram, child.id, false, true));
    const leftSizes = leftChildren.map((child) => computeSubtreeSize(diagram, child.id, false, true));
    const rightTotalH =
      rightSizes.reduce((sum, size) => sum + size.h, 0) +
      Math.max(0, rightSizes.length - 1) * DIAGRAM_GAP_SIBLING;
    const leftTotalH =
      leftSizes.reduce((sum, size) => sum + size.h, 0) +
      Math.max(0, leftSizes.length - 1) * DIAGRAM_GAP_SIBLING;
    const maxSideH = Math.max(rightTotalH, leftTotalH, rootH);

    const rightMaxW = rightSizes.length > 0 ? Math.max(...rightSizes.map((size) => size.w)) : 0;
    const leftMaxW = leftSizes.length > 0 ? Math.max(...leftSizes.map((size) => size.w)) : 0;

    const leftSpan = leftMaxW > 0 ? leftMaxW + DIAGRAM_GAP_LEVEL : 0;
    const rootX = leftSpan;
    const rootY = (maxSideH - rootH) / 2;

    rects.push({ id: root.id, x: rootX, y: rootY, w: rootW, h: rootH });

    let rightY = (maxSideH - rightTotalH) / 2;
    for (let childIndex = 0; childIndex < rightChildren.length; childIndex += 1) {
      const child = rightChildren[childIndex];
      const branchIdx = rootIndex * 100 + childIndex;
      layoutSubtree(
        diagram,
        child.id,
        false,
        "right",
        rootX + rootW + DIAGRAM_GAP_LEVEL,
        rightY,
        rects,
        edges,
        branchIdx,
      );
      edges.push({
        from: root.id,
        to: child.id,
        relation: child.relation,
        branchIndex: branchIdx,
        direction: "right",
      });
      rightY += rightSizes[childIndex].h + DIAGRAM_GAP_SIBLING;
    }

    let leftY = (maxSideH - leftTotalH) / 2;
    for (let childIndex = 0; childIndex < leftChildren.length; childIndex += 1) {
      const child = leftChildren[childIndex];
      const branchIdx = rootIndex * 100 + rightChildren.length + childIndex;
      layoutSubtree(
        diagram,
        child.id,
        false,
        "left",
        rootX - DIAGRAM_GAP_LEVEL,
        leftY,
        rects,
        edges,
        branchIdx,
      );
      edges.push({
        from: root.id,
        to: child.id,
        relation: child.relation,
        branchIndex: branchIdx,
        direction: "left",
      });
      leftY += leftSizes[childIndex].h + DIAGRAM_GAP_SIBLING;
    }
  }

  const minX = Math.min(0, ...rects.map((rect) => rect.x));
  const minY = Math.min(0, ...rects.map((rect) => rect.y));
  if (minX < 0 || minY < 0) {
    for (const rect of rects) {
      rect.x -= minX;
      rect.y -= minY;
    }
  }

  return {
    rects,
    edges,
    totalWidth: Math.max(1, ...rects.map((rect) => rect.x + rect.w)),
    totalHeight: Math.max(1, ...rects.map((rect) => rect.y + rect.h)),
  };
}

export function computeFitTransformForLayout(
  layout: LayoutResult | null,
  containerWidth: number,
  containerHeight: number,
  options?: {
    padding?: number;
    minZoom?: number;
    maxZoom?: number;
  },
) {
  if (!layout || containerWidth <= 0 || containerHeight <= 0) return null;
  const padding = options?.padding ?? DIAGRAM_FIT_PADDING;
  const minZoom = options?.minZoom ?? DIAGRAM_MIN_FIT_ZOOM;
  const maxZoom = options?.maxZoom ?? 1;
  const zoom = Math.max(
    Math.min(
      containerWidth / (layout.totalWidth + padding),
      containerHeight / (layout.totalHeight + padding),
      maxZoom,
    ),
    minZoom,
  );
  return {
    zoom,
    pan: {
      x: (containerWidth - layout.totalWidth * zoom) / 2,
      y: (containerHeight - layout.totalHeight * zoom) / 2,
    },
  };
}
