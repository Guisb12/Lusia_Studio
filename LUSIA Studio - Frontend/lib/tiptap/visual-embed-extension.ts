import { Node, ResizableNodeView } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const VISUAL_GENERATING_SRC = "__visual_generating__";

const visualAlignPluginKey = new PluginKey("visualAlign");
const VISUAL_ASPECT_RATIO = 5 / 8;
const VISUAL_BASE_WIDTH = 720;
const VISUAL_BASE_HEIGHT = Math.round(VISUAL_BASE_WIDTH * VISUAL_ASPECT_RATIO);

export const VisualEmbed = Node.create({
    name: "visualEmbed",
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
        return {
            src: {
                default: VISUAL_GENERATING_SRC,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute("data-src") || VISUAL_GENERATING_SRC,
                renderHTML: (attributes: Record<string, any>) => ({
                    "data-src": attributes.src || VISUAL_GENERATING_SRC,
                }),
            },
            html: {
                default: "",
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute("data-html") || "",
                renderHTML: () => ({}),
            },
            width: {
                default: 720,
                parseHTML: (element: HTMLElement) => {
                    const raw = element.getAttribute("data-width");
                    return raw ? Number(raw) : 720;
                },
                renderHTML: (attributes: Record<string, any>) => ({
                    "data-width": String(attributes.width || 720),
                }),
            },
            align: {
                default: "center",
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute("data-align") || "center",
                renderHTML: (attributes: Record<string, any>) => ({
                    "data-align": attributes.align || "center",
                }),
            },
            caption: {
                default: "",
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute("data-caption") || "",
                renderHTML: (attributes: Record<string, any>) => (
                    attributes.caption ? { "data-caption": attributes.caption } : {}
                ),
            },
            visualType: {
                default: "static_visual",
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute("data-visual-type") || "static_visual",
                renderHTML: (attributes: Record<string, any>) => ({
                    "data-visual-type": attributes.visualType || "static_visual",
                }),
            },
        };
    },

    addCommands() {
        return {
            setVisualAlign:
                (align: string) =>
                ({ commands }: any) =>
                    commands.updateAttributes("visualEmbed", { align }),
        } as any;
    },

    parseHTML() {
        return [{ tag: "figure[data-note-visual]" }];
    },

    addNodeView() {
        if (typeof document === "undefined") {
            return null;
        }

        return ({ node, getPos, editor }: any) => {
            const applyIframeScale = (_iframe: HTMLIFrameElement, _width: number) => {
                // Route-backed note visuals now normalize to a fixed internal stage on the backend.
                // The iframe should only resize its viewport; applying extra document zoom here
                // causes the visual to drift, shrink, and stop centering correctly.
            };

            const buildStaticView = () => {
                const figure = document.createElement("figure");
                figure.setAttribute("data-note-visual", "");
                figure.style.margin = "1.5rem 0";
                figure.style.width = "100%";

                const host = document.createElement("div");
                host.style.display = "flex";
                host.style.width = "100%";
                figure.appendChild(host);

                const shimmerEl = document.createElement("div");
                shimmerEl.className = "tiptap-image-shimmer";
                host.appendChild(shimmerEl);

                const iframeEl = document.createElement("iframe");
                iframeEl.setAttribute("sandbox", "allow-scripts allow-same-origin");
                iframeEl.setAttribute("loading", "lazy");
                iframeEl.setAttribute("referrerpolicy", "no-referrer");
                iframeEl.setAttribute("scrolling", "no");
                iframeEl.style.border = "0";
                iframeEl.style.borderRadius = "0";
                iframeEl.style.overflow = "hidden";
                iframeEl.style.background = "transparent";
                iframeEl.style.boxShadow = "none";
                iframeEl.style.display = "block";
                host.appendChild(iframeEl);

                const captionEl = document.createElement("figcaption");
                captionEl.style.marginTop = "0.75rem";
                captionEl.style.textAlign = "center";
                captionEl.style.color = "#6b7a8d";
                captionEl.style.fontSize = "0.95rem";
                figure.appendChild(captionEl);

                const syncVisual = (attrs: Record<string, any>) => {
                    const src = String(attrs.src || "");
                    const html = String(attrs.html || "");
                    const width = Number(attrs.width || 720);
                    const height = Math.round(width * VISUAL_ASPECT_RATIO);
                    const caption = String(attrs.caption || "");
                    const align = attrs.align || "center";

                    host.style.justifyContent =
                        align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

                    shimmerEl.style.width = `${width}px`;
                    shimmerEl.style.height = `${height}px`;
                    iframeEl.style.width = `${width}px`;
                    iframeEl.style.height = `${height}px`;
                    applyIframeScale(iframeEl, width);

                    if (src === VISUAL_GENERATING_SRC && !html) {
                        shimmerEl.style.display = "block";
                        iframeEl.style.display = "none";
                        captionEl.style.display = "none";
                        iframeEl.removeAttribute("src");
                        iframeEl.removeAttribute("srcdoc");
                    } else {
                        shimmerEl.style.display = "none";
                        iframeEl.style.display = "block";
                        captionEl.style.display = caption ? "block" : "none";
                        captionEl.textContent = caption;
                        if (src && src !== VISUAL_GENERATING_SRC) {
                            iframeEl.removeAttribute("srcdoc");
                            if (iframeEl.getAttribute("src") !== src) {
                                iframeEl.setAttribute("src", src);
                                iframeEl.onload = () => applyIframeScale(iframeEl, width);
                            }
                            applyIframeScale(iframeEl, width);
                        } else if (html) {
                            iframeEl.removeAttribute("src");
                            if (iframeEl.srcdoc !== html) {
                                iframeEl.srcdoc = html;
                                iframeEl.onload = () => applyIframeScale(iframeEl, width);
                            }
                            applyIframeScale(iframeEl, width);
                        }
                    }
                };

                syncVisual(node.attrs || {});

                return {
                    dom: figure,
                    update(updatedNode: any) {
                        if (updatedNode.type !== node.type) return false;
                        syncVisual(updatedNode.attrs || {});
                        return true;
                    },
                };
            };

            if (!editor.isEditable) {
                return buildStaticView();
            }

            const iframeEl = document.createElement("iframe");
            iframeEl.setAttribute("sandbox", "allow-scripts allow-same-origin");
            iframeEl.setAttribute("loading", "lazy");
            iframeEl.setAttribute("referrerpolicy", "no-referrer");
            iframeEl.setAttribute("scrolling", "no");
            iframeEl.style.position = "relative";
            iframeEl.style.border = "0";
            iframeEl.style.borderRadius = "0";
            iframeEl.style.overflow = "hidden";
            iframeEl.style.background = "transparent";
            iframeEl.style.boxShadow = "none";
            iframeEl.style.display = "block";
            iframeEl.style.transformOrigin = "center center";
            iframeEl.style.flex = "0 0 auto";

            const shimmerEl = document.createElement("div");
            shimmerEl.className = "tiptap-image-shimmer";

            const visualWrap = document.createElement("div");
            visualWrap.style.position = "relative";
            visualWrap.style.display = "flex";
            visualWrap.style.alignItems = "center";
            visualWrap.style.justifyContent = "center";
            visualWrap.style.overflow = "hidden";
            visualWrap.appendChild(shimmerEl);
            visualWrap.appendChild(iframeEl);

            const overlayEl = document.createElement("div");
            overlayEl.contentEditable = "false";
            overlayEl.style.position = "absolute";
            overlayEl.style.top = "0";
            overlayEl.style.bottom = "0";
            overlayEl.style.left = "12px";
            overlayEl.style.right = "12px";
            overlayEl.style.background = "transparent";
            overlayEl.style.cursor = "pointer";
            overlayEl.style.zIndex = "1";
            visualWrap.appendChild(overlayEl);

            // ── Selection / interactive mode ──
            // Default: iframe is interactive (overlay hidden).
            // Click the grip button → select node + show toolbar.
            // Click outside → back to interactive.
            let selectionMode = false;

            // Start in interactive mode — overlay hidden
            overlayEl.style.pointerEvents = "none";
            overlayEl.style.display = "none";
            iframeEl.style.pointerEvents = "auto";

            // Floating grip button (top-right) to enter selection mode
            const gripBtn = document.createElement("button");
            gripBtn.type = "button";
            gripBtn.contentEditable = "false";
            gripBtn.title = "Selecionar visual";
            gripBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>`;
            gripBtn.style.cssText = `
                position: absolute; top: 6px; right: 6px; z-index: 2;
                width: 28px; height: 28px; border-radius: 6px;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255,255,255,0.85); border: 1px solid rgba(10,27,182,0.15);
                color: rgba(10,27,182,0.55); cursor: pointer; opacity: 0.45;
                transition: opacity 0.15s, background 0.15s, color 0.15s;
                backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
                padding: 0; line-height: 1;
            `;
            gripBtn.addEventListener("mouseenter", () => { gripBtn.style.opacity = "1"; });
            gripBtn.addEventListener("mouseleave", () => { gripBtn.style.opacity = "0.45"; });
            visualWrap.appendChild(gripBtn);

            const enterSelectionMode = () => {
                if (selectionMode) return;
                selectionMode = true;
                overlayEl.style.pointerEvents = "";
                overlayEl.style.display = "";
                iframeEl.style.pointerEvents = "none";
                gripBtn.style.opacity = "0";
                gripBtn.style.pointerEvents = "none";
                // Select the node so ProseMirror shows the toolbar
                const pos = getPos();
                if (pos !== undefined) {
                    editor.chain().setNodeSelection(pos).run();
                }
                document.addEventListener("pointerdown", exitOnOutsideClick, true);
            };

            const exitSelectionMode = () => {
                if (!selectionMode) return;
                selectionMode = false;
                overlayEl.style.pointerEvents = "none";
                overlayEl.style.display = "none";
                iframeEl.style.pointerEvents = "auto";
                gripBtn.style.pointerEvents = "";
                gripBtn.style.opacity = "0.45";
                document.removeEventListener("pointerdown", exitOnOutsideClick, true);
            };

            const exitOnOutsideClick = (e: PointerEvent) => {
                const target = e.target as HTMLElement | null;
                // Stay in selection mode if clicking on overlay/resize handles
                if (target && (overlayEl.contains(target) || target === overlayEl)) return;
                if (target && target.hasAttribute("data-resize-handle")) return;
                exitSelectionMode();
            };

            gripBtn.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                enterSelectionMode();
            });

            const applyViewportSize = (requestedWidth: number) => {
                const prose = visualWrap.closest(".ProseMirror") as HTMLElement | null;
                const availableWidth = prose?.clientWidth || visualWrap.parentElement?.clientWidth || requestedWidth;
                const maxWidth = Math.max(240, availableWidth - 48);
                const width = Math.min(requestedWidth, maxWidth);
                const height = Math.round(width * VISUAL_ASPECT_RATIO);
                const scale = width / VISUAL_BASE_WIDTH;

                // Keep container at full width so align-items can center the wrapper
                wrapper.style.width = `${width}px`;
                wrapper.style.height = `${height}px`;
                visualWrap.style.width = `${width}px`;
                visualWrap.style.height = `${height}px`;
                shimmerEl.style.width = `${width}px`;
                shimmerEl.style.height = `${height}px`;
                iframeEl.style.width = `${VISUAL_BASE_WIDTH}px`;
                iframeEl.style.height = `${VISUAL_BASE_HEIGHT}px`;
                iframeEl.style.transform = `scale(${scale})`;
                overlayEl.style.width = `${width}px`;
                overlayEl.style.height = `${height}px`;
                captionWrap.style.width = `${width}px`;

                return { width, height };
            };

            const nodeView = new ResizableNodeView({
                element: visualWrap,
                editor,
                node,
                getPos,
                onResize: (width: number, height: number) => {
                    const next = applyViewportSize(width);
                    applyIframeScale(iframeEl, next.width);
                },
                onCommit: (width: number) => {
                    const prose = visualWrap.closest(".ProseMirror") as HTMLElement | null;
                    const availableWidth = prose?.clientWidth || visualWrap.parentElement?.clientWidth || width;
                    const maxWidth = Math.max(240, availableWidth - 48);
                    const clampedWidth = Math.min(width, maxWidth);
                    const pos = getPos();
                    if (pos === undefined) return;
                    this.editor.chain().setNodeSelection(pos).updateAttributes(this.name, { width: clampedWidth }).run();
                },
                onUpdate: (updatedNode: any) => updatedNode.type === node.type,
                options: {
                    directions: ["left", "right"],
                    min: {
                        width: 240,
                        height: 150,
                    },
                    preserveAspectRatio: true,
                },
            });

            const container = nodeView.dom as HTMLElement;
            const wrapper = nodeView.wrapper as HTMLElement;
            const resizeHandles = Array.from(
                container.querySelectorAll("[data-resize-handle]")
            ) as HTMLElement[];

            const setResizeInteraction = (isActive: boolean) => {
                if (isActive) exitSelectionMode();
                iframeEl.style.pointerEvents = isActive ? "none" : "";
                overlayEl.style.pointerEvents = isActive ? "none" : "";
            };

            const handleResizeStart = () => {
                setResizeInteraction(true);
            };

            const handleResizeEnd = () => {
                setResizeInteraction(false);
            };

            resizeHandles.forEach((handle) => {
                handle.addEventListener("mousedown", handleResizeStart);
                handle.addEventListener("touchstart", handleResizeStart, { passive: true });
            });
            document.addEventListener("mouseup", handleResizeEnd);
            document.addEventListener("touchend", handleResizeEnd);

            const captionWrap = document.createElement("div");
            captionWrap.className = "tiptap-image-caption-wrap";
            captionWrap.contentEditable = "false";
            const captionInput = document.createElement("textarea");
            captionInput.className = "tiptap-image-caption-input";
            captionInput.placeholder = "Legenda do visual...";
            captionInput.rows = 1;
            captionWrap.appendChild(captionInput);
            container.appendChild(captionWrap);

            let syncTimer: number | null = null;

            const updateCaption = (caption: string) => {
                const pos = getPos();
                if (pos === undefined) return;
                const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
                    ...nodeView.node.attrs,
                    caption,
                });
                editor.view.dispatch(tr);
            };

            const autoResizeCaption = () => {
                captionInput.style.height = "auto";
                captionInput.style.height = captionInput.scrollHeight + "px";
            };

            const syncCaptionUI = (attrs: Record<string, any>) => {
                const caption = String(attrs.caption || "");
                captionInput.value = caption;
                captionInput.style.display = caption || editor.isEditable ? "block" : "none";
                captionInput.readOnly = !editor.isEditable;
                captionWrap.setAttribute("data-has-caption", caption ? "true" : "false");
                captionWrap.setAttribute("data-empty-caption", caption ? "false" : "true");
                captionWrap.style.width = wrapper.style.width || (attrs.width ? `${attrs.width}px` : "");
                requestAnimationFrame(autoResizeCaption);
            };

            const syncVisual = (attrs: Record<string, any>) => {
                const src = String(attrs.src || "");
                const html = String(attrs.html || "");
                const width = Number(attrs.width || 720);
                const caption = String(attrs.caption || "");

                const next = applyViewportSize(width);
                applyIframeScale(iframeEl, next.width);

                if (src === VISUAL_GENERATING_SRC && !html) {
                    shimmerEl.style.display = "block";
                    iframeEl.style.display = "none";
                    captionWrap.style.display = "none";
                    iframeEl.removeAttribute("src");
                    iframeEl.removeAttribute("srcdoc");
                } else {
                    shimmerEl.style.display = "none";
                    iframeEl.style.display = "block";
                    captionWrap.style.display = "";
                    syncCaptionUI(attrs);

                    if (src && src !== VISUAL_GENERATING_SRC) {
                        iframeEl.removeAttribute("srcdoc");
                        if (iframeEl.getAttribute("src") !== src) {
                            iframeEl.setAttribute("src", src);
                            iframeEl.onload = () => applyIframeScale(iframeEl, width);
                        }
                        applyIframeScale(iframeEl, width);
                    } else if (html) {
                        iframeEl.removeAttribute("src");
                        if (iframeEl.srcdoc !== html) {
                            iframeEl.srcdoc = html;
                            iframeEl.onload = () => applyIframeScale(iframeEl, width);
                        }
                        applyIframeScale(iframeEl, width);
                    }
                }

                const align = attrs.align || "center";
                if (align === "left") {
                    container.style.alignItems = "flex-start";
                } else if (align === "right") {
                    container.style.alignItems = "flex-end";
                } else {
                    container.style.alignItems = "center";
                }
            };

            captionInput.addEventListener("input", () => {
                const nextValue = captionInput.value;
                captionWrap.setAttribute("data-has-caption", nextValue.trim() ? "true" : "false");
                captionWrap.setAttribute("data-empty-caption", nextValue.trim() ? "false" : "true");
                autoResizeCaption();
                if (syncTimer !== null) {
                    window.clearTimeout(syncTimer);
                }
                syncTimer = window.setTimeout(() => {
                    updateCaption(nextValue);
                }, 120);
            });

            captionInput.addEventListener("blur", () => {
                const nextValue = captionInput.value.trim();
                updateCaption(nextValue);
                captionWrap.setAttribute("data-has-caption", nextValue ? "true" : "false");
                captionWrap.setAttribute("data-empty-caption", nextValue ? "false" : "true");
            });

            syncVisual(node.attrs || {});

            // Re-layout after the element is in the DOM so
            // closest(".ProseMirror") resolves and we get the correct
            // available width (fixes initial crop).
            requestAnimationFrame(() => {
                syncVisual(nodeView.node?.attrs || node.attrs || {});
            });

            const originalUpdate = nodeView.update.bind(nodeView);
            nodeView.update = (updatedNode: any, decorations: readonly any[], innerDecorations: any) => {
                const result = originalUpdate(updatedNode, decorations, innerDecorations);
                if (!result) return false;
                syncVisual(updatedNode.attrs || {});
                return true;
            };

            const stopInteractiveEvent = (event: Event) => {
                event.stopPropagation();
            };

            captionWrap.addEventListener("mousedown", stopInteractiveEvent);
            captionWrap.addEventListener("click", stopInteractiveEvent);
            captionInput.addEventListener("mousedown", stopInteractiveEvent);
            captionInput.addEventListener("click", stopInteractiveEvent);

            (nodeView as any).stopEvent = (event: Event) => {
                const target = event.target as HTMLElement | null;
                if (target && captionWrap.contains(target)) return true;
                if (target && (gripBtn === target || gripBtn.contains(target))) return true;
                // When NOT in selection mode, let iframe receive all events
                if (!selectionMode && target && (iframeEl.contains(target) || target === iframeEl)) return true;
                return false;
            };

            const originalDestroy = nodeView.destroy?.bind(nodeView);
            nodeView.destroy = () => {
                exitSelectionMode();
                resizeHandles.forEach((handle) => {
                    handle.removeEventListener("mousedown", handleResizeStart);
                    handle.removeEventListener("touchstart", handleResizeStart);
                });
                document.removeEventListener("mouseup", handleResizeEnd);
                document.removeEventListener("touchend", handleResizeEnd);
                originalDestroy?.();
            };

            return nodeView;
        };
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: visualAlignPluginKey,
                view() {
                    return {
                        update(view) {
                            const { doc } = view.state;

                            doc.descendants((node, pos) => {
                                if (node.type.name !== "visualEmbed") return;

                                const nodeDom = view.nodeDOM(pos);
                                if (!nodeDom || !(nodeDom instanceof HTMLElement)) return;

                                const container = (
                                    (nodeDom.matches("[data-resize-container]") ? nodeDom : null) ||
                                    nodeDom.closest("[data-resize-container]") ||
                                    nodeDom.querySelector("[data-resize-container]") ||
                                    nodeDom
                                ) as HTMLElement;
                                const wrapper = (
                                    container.querySelector("[data-resize-wrapper]") ||
                                    (nodeDom.matches("[data-resize-wrapper]") ? nodeDom : null)
                                ) as HTMLElement | null;
                                const iframeEl = container.querySelector("iframe") as HTMLElement | null;
                                const shimmerEl = container.querySelector(".tiptap-image-shimmer") as HTMLElement | null;

                                const align = node.attrs.align || "center";
                                const width = Number(node.attrs.width || 720);
                                const height = Math.round(width * VISUAL_ASPECT_RATIO);

                                if (align === "center") {
                                    container.style.alignItems = "center";
                                } else if (align === "right") {
                                    container.style.alignItems = "flex-end";
                                } else {
                                    container.style.alignItems = "flex-start";
                                }

                                if (wrapper) {
                                    wrapper.style.width = `${width}px`;
                                    wrapper.style.height = `${height}px`;
                                }
                                if (iframeEl) {
                                    const scale = width / VISUAL_BASE_WIDTH;
                                    iframeEl.style.width = `${VISUAL_BASE_WIDTH}px`;
                                    iframeEl.style.height = `${VISUAL_BASE_HEIGHT}px`;
                                    iframeEl.style.transform = `scale(${scale})`;
                                }
                                if (shimmerEl) {
                                    shimmerEl.style.width = `${width}px`;
                                    shimmerEl.style.height = `${height}px`;
                                }
                            });
                        },
                    };
                },
            }),
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const src = String(HTMLAttributes.src || VISUAL_GENERATING_SRC);
        const caption = String(HTMLAttributes.caption || "");
        const width = Number(HTMLAttributes.width || 720);
        const align = String(HTMLAttributes.align || "center");

        return [
            "figure",
            {
                "data-note-visual": "",
                "data-src": src,
                "data-width": String(width),
                "data-align": align,
                "data-caption": caption,
                "data-visual-type": String(HTMLAttributes.visualType || "static_visual"),
                contenteditable: "false",
                style: "margin: 1.5rem 0; width: 100%;",
            },
            ...(caption
                ? [[
                    "figcaption",
                    {
                        style: "margin-top: 0.75rem; text-align: center; color: #6b7a8d; font-size: 0.95rem;",
                    },
                    caption,
                ]]
                : []),
        ];
    },
});
