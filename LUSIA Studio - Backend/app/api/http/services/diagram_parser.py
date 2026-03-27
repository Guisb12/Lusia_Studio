"""
Incremental parser and validator for streamed diagram generation events.
"""

from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from app.api.http.schemas.diagram_generation import (
    DiagramContent,
    DiagramKind,
    DiagramNode,
    DiagramType,
)

ALLOWED_DIAGRAM_TYPES = {"mindmap", "flowchart", "sequence"}
ALLOWED_KINDS = {"concept", "step", "outcome", "example", "question"}
PATCHABLE_FIELDS = {"parent_id", "label", "summary", "kind", "relation", "order"}


class DiagramParserError(ValueError):
    """Raised when the streamed diagram becomes unrecoverably invalid."""


@dataclass
class DiagramParserStats:
    nodes_accepted: int = 0
    patches_applied: int = 0
    invalid_events_ignored: int = 0
    unresolved_refs: int = 0
    duplicate_ids: int = 0
    coerced_kinds: int = 0
    pending_patches: int = 0


@dataclass
class DiagramStreamParser:
    diagram_type: str
    title: str
    generation_params: dict[str, Any]
    buffer: str = ""
    nodes: dict[str, dict[str, Any]] = field(default_factory=dict)
    pending_nodes: dict[str, dict[str, Any]] = field(default_factory=dict)
    pending_patches: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    stats: DiagramParserStats = field(default_factory=DiagramParserStats)
    _saw_done: bool = False

    def __post_init__(self) -> None:
        if self.diagram_type not in ALLOWED_DIAGRAM_TYPES:
            raise DiagramParserError(f"Unsupported diagram type: {self.diagram_type}")

    def hydrate_payload(self, phase: str, *, is_processed: bool, processing_failed: bool) -> dict[str, Any]:
        return {
            "type": "hydrate",
            "diagram": self.build_content(phase=phase),
            "is_processed": is_processed,
            "processing_failed": processing_failed,
            "warnings": list(self.warnings),
        }

    def feed(self, chunk: str) -> list[dict[str, Any]]:
        self.buffer += chunk
        events: list[dict[str, Any]] = []

        while "\n" in self.buffer:
            line, self.buffer = self.buffer.split("\n", 1)
            stripped = line.strip()
            if not stripped:
                continue

            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                self.stats.invalid_events_ignored += 1
                self.warnings.append(f"Invalid JSON line ignored: {stripped[:120]}")
                continue

            next_events = self._apply_payload(payload)
            events.extend(next_events)

        return events

    def finalize(self) -> dict[str, Any]:
        if self.buffer.strip():
            try:
                payload = json.loads(self.buffer.strip())
            except json.JSONDecodeError:
                self.stats.invalid_events_ignored += 1
                self.warnings.append("Trailing partial line ignored at end of stream.")
            else:
                self._apply_payload(payload)
            self.buffer = ""

        self._flush_pending_nodes()
        self._flush_pending_patches()
        self._validate_graph()

        nodes = sorted(
            (deepcopy(node) for node in self.nodes.values()),
            key=lambda node: ((node.get("parent_id") or ""), int(node["order"]), node["id"]),
        )
        if not nodes:
            raise DiagramParserError("No valid nodes were produced.")

        self.stats.unresolved_refs = len(self.pending_nodes)
        self.stats.pending_patches = sum(len(items) for items in self.pending_patches.values())
        return {
            "title": self.title,
            "diagram_type": self.diagram_type,
            "nodes": nodes,
            "warnings": list(self.warnings),
            "stats": self.stats.__dict__.copy(),
        }

    def build_content(self, *, phase: str) -> dict[str, Any]:
        return DiagramContent(
            title=self.title,
            diagram_type=self.diagram_type,  # type: ignore[arg-type]
            phase=phase,
            generation_params=self.generation_params,
            nodes=[
                DiagramNode(**node)
                for node in sorted(
                    self.nodes.values(),
                    key=lambda item: ((item.get("parent_id") or ""), int(item["order"]), item["id"]),
                )
            ],
        ).model_dump()

    def _apply_payload(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        event_type = payload.get("type")
        if event_type == "done":
            self._saw_done = True
            return []
        if event_type == "meta":
            return self._handle_meta(payload)
        if event_type == "node":
            node_data = payload.get("node")
            if not isinstance(node_data, dict):
                self.stats.invalid_events_ignored += 1
                self.warnings.append("Ignored node event without object payload.")
                return []
            return self._handle_node(node_data)
        if event_type == "node_patch":
            return self._handle_patch(payload)

        self.stats.invalid_events_ignored += 1
        self.warnings.append(f"Ignored unsupported event type: {event_type!r}")
        return []

    def _handle_meta(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        title = str(payload.get("title") or "").strip()
        diagram_type = str(payload.get("diagram_type") or "").strip().lower()
        if title:
            self.title = title
        if diagram_type in ALLOWED_DIAGRAM_TYPES:
            self.diagram_type = diagram_type
        elif diagram_type:
            self.warnings.append(f"Ignored invalid diagram_type: {diagram_type}")
        return [{
            "type": "diagram_updated",
            "diagram": self.build_content(phase="generating_diagram"),
        }]

    def _handle_node(self, raw_node: dict[str, Any]) -> list[dict[str, Any]]:
        node = self._normalize_node(raw_node)
        node_id = node["id"]
        if node_id in self.nodes or node_id in self.pending_nodes:
            self.stats.duplicate_ids += 1
            raise DiagramParserError(f"Duplicate node id: {node_id}")

        if node["parent_id"] and node["parent_id"] not in self.nodes:
            self.pending_nodes[node_id] = node
            self.stats.unresolved_refs = len(self.pending_nodes)
            return []

        self.nodes[node_id] = node
        self.stats.nodes_accepted += 1
        events = [{
            "type": "node_added",
            "node": deepcopy(node),
        }, {
            "type": "node_committed",
            "node": deepcopy(node),
        }]
        events.extend(self._apply_buffered_patches(node_id))
        events.extend(self._resolve_pending_children(node_id))
        return events

    def _handle_patch(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        node_id = payload.get("id")
        field = payload.get("field")
        value = payload.get("value")
        if not isinstance(node_id, str) or field not in PATCHABLE_FIELDS:
            self.stats.invalid_events_ignored += 1
            self.warnings.append("Ignored invalid node_patch event.")
            return []

        patch = {"field": field, "value": value}
        if node_id not in self.nodes:
            self.pending_patches.setdefault(node_id, []).append(patch)
            self.stats.pending_patches = sum(len(items) for items in self.pending_patches.values())
            return []

        updated = self._apply_patch(self.nodes[node_id], patch)
        self.stats.patches_applied += 1
        return [{
            "type": "node_updated",
            "node": deepcopy(updated),
        }, {
            "type": "node_committed",
            "node": deepcopy(updated),
        }]

    def _normalize_node(self, raw_node: dict[str, Any]) -> dict[str, Any]:
        node_id = str(raw_node.get("id") or "").strip()
        label = str(raw_node.get("label") or "").strip()
        summary = str(raw_node.get("summary") or "").strip()
        if not node_id or not label or not summary:
            raise DiagramParserError("Node is missing id, label, or summary.")

        parent_id = raw_node.get("parent_id")
        if parent_id is not None:
            parent_id = str(parent_id).strip() or None
        kind = str(raw_node.get("kind") or "concept").strip().lower()
        if kind not in ALLOWED_KINDS:
            kind = "concept"
            self.stats.coerced_kinds += 1
            self.warnings.append(f"Coerced invalid kind to concept for node {node_id}.")
        relation = raw_node.get("relation")
        if relation is not None:
            relation = str(relation).strip() or None
        try:
            order = int(raw_node.get("order", 0))
        except (TypeError, ValueError) as exc:
            raise DiagramParserError(f"Invalid order for node {node_id}.") from exc

        return DiagramNode(
            id=node_id,
            parent_id=parent_id,
            label=label,
            summary=summary,
            kind=kind,  # type: ignore[arg-type]
            relation=relation,
            order=order,
        ).model_dump()

    def _apply_patch(self, node: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
        field = patch["field"]
        value = patch["value"]
        updated = deepcopy(node)
        if field == "kind":
            normalized = str(value or "concept").strip().lower()
            if normalized not in ALLOWED_KINDS:
                normalized = "concept"
                self.stats.coerced_kinds += 1
                self.warnings.append(f"Coerced invalid kind to concept for node {node['id']}.")
            updated[field] = normalized
        elif field == "order":
            updated[field] = int(value)
        elif field == "parent_id":
            parent_id = None if value in (None, "", "null") else str(value).strip()
            updated[field] = parent_id or None
        elif field == "relation":
            updated[field] = None if value in (None, "") else str(value).strip()
        else:
            normalized = str(value or "").strip()
            if not normalized:
                self.stats.invalid_events_ignored += 1
                self.warnings.append(f"Ignored empty patch for {field} on node {node['id']}.")
                return node
            updated[field] = normalized

        if updated["parent_id"] == updated["id"]:
            raise DiagramParserError(f"Node {updated['id']} cannot parent itself.")
        self.nodes[updated["id"]] = updated
        return updated

    def _apply_buffered_patches(self, node_id: str) -> list[dict[str, Any]]:
        pending = self.pending_patches.pop(node_id, [])
        events: list[dict[str, Any]] = []
        for patch in pending:
            updated = self._apply_patch(self.nodes[node_id], patch)
            self.stats.patches_applied += 1
            events.append({"type": "node_updated", "node": deepcopy(updated)})
            events.append({"type": "node_committed", "node": deepcopy(updated)})
        self.stats.pending_patches = sum(len(items) for items in self.pending_patches.values())
        return events

    def _resolve_pending_children(self, parent_id: str) -> list[dict[str, Any]]:
        ready = [
            node_id
            for node_id, node in self.pending_nodes.items()
            if node.get("parent_id") == parent_id
        ]
        events: list[dict[str, Any]] = []
        for node_id in ready:
            node = self.pending_nodes.pop(node_id)
            self.nodes[node_id] = node
            self.stats.nodes_accepted += 1
            events.append({"type": "node_added", "node": deepcopy(node)})
            events.append({"type": "node_committed", "node": deepcopy(node)})
            events.extend(self._apply_buffered_patches(node_id))
            events.extend(self._resolve_pending_children(node_id))
        self.stats.unresolved_refs = len(self.pending_nodes)
        return events

    def _flush_pending_nodes(self) -> None:
        unresolved: list[str] = []
        progressed = True
        while progressed and self.pending_nodes:
            progressed = False
            for node_id, node in list(self.pending_nodes.items()):
                parent_id = node.get("parent_id")
                if parent_id is None or parent_id in self.nodes:
                    self.pending_nodes.pop(node_id)
                    self.nodes[node_id] = node
                    self.stats.nodes_accepted += 1
                    self._apply_buffered_patches(node_id)
                    progressed = True
            self.stats.unresolved_refs = len(self.pending_nodes)

        if self.pending_nodes:
            unresolved = sorted(self.pending_nodes.keys())
            self.warnings.append(
                f"Dropped nodes with unresolved parents: {', '.join(unresolved[:10])}"
            )
            self.pending_nodes.clear()
            self.stats.unresolved_refs = 0

    def _flush_pending_patches(self) -> None:
        if not self.pending_patches:
            return
        unresolved = sorted(self.pending_patches.keys())
        self.warnings.append(
            f"Dropped patches for unresolved nodes: {', '.join(unresolved[:10])}"
        )
        self.pending_patches.clear()
        self.stats.pending_patches = 0

    def _validate_graph(self) -> None:
        for node_id, node in self.nodes.items():
            parent_id = node.get("parent_id")
            if parent_id is None:
                continue
            if parent_id == node_id:
                raise DiagramParserError(f"Node {node_id} cannot parent itself.")
            if parent_id not in self.nodes:
                raise DiagramParserError(f"Node {node_id} references unknown parent {parent_id}.")

        visiting: set[str] = set()
        visited: set[str] = set()

        def walk(node_id: str) -> None:
            if node_id in visited:
                return
            if node_id in visiting:
                raise DiagramParserError(f"Cycle detected at node {node_id}.")
            visiting.add(node_id)
            parent_id = self.nodes[node_id].get("parent_id")
            if parent_id:
                walk(parent_id)
            visiting.remove(node_id)
            visited.add(node_id)

        for node_id in sorted(self.nodes):
            walk(node_id)
