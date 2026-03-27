import { ResizableNodeView } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { IMAGE_GENERATING_SRC } from "@/lib/notes/note-format";

const imageAlignPluginKey = new PluginKey("imageAlign");

/**
 * Extended Image extension that adds an `align` attribute (left | center | right)
 * and a ProseMirror plugin that applies `justify-content` to the resize container.
 */
export const CustomImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                    const raw = element.getAttribute("data-width") || element.getAttribute("width");
                    return raw ? Number(raw) : null;
                },
                renderHTML: (attributes: Record<string, any>) => {
                    if (!attributes.width) return {};
                    return {
                        "data-width": attributes.width,
                        width: attributes.width,
                    };
                },
            },
            align: {
                default: "left",
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute("data-align") || "left",
                renderHTML: (attributes: Record<string, any>) => ({
                    "data-align": attributes.align,
                }),
            },
            caption: {
                default: "",
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute("data-caption") || "",
                renderHTML: (attributes: Record<string, any>) => (
                    attributes.caption
                        ? { "data-caption": attributes.caption }
                        : {}
                ),
            },
        };
    },

    addCommands() {
        return {
            ...this.parent?.(),
            setImageAlign:
                (align: string) =>
                ({ commands }: any) =>
                    commands.updateAttributes("image", { align }),
            setImageCaption:
                (caption: string) =>
                ({ commands }: any) =>
                    commands.updateAttributes("image", { caption }),
        } as any;
    },

    addNodeView() {
        if (!this.options.resize || !this.options.resize.enabled || typeof document === "undefined") {
            return null;
        }

        const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = this.options.resize;

        return ({ node, getPos, HTMLAttributes, editor }: any) => {
            const isGenerating = HTMLAttributes.src === IMAGE_GENERATING_SRC;

            // Create the main visual element — shimmer div or real img
            const imageEl = document.createElement("img");
            const shimmerEl = document.createElement("div");
            shimmerEl.className = "tiptap-image-shimmer";

            if (isGenerating) {
                const w = Number(HTMLAttributes.width || 400);
                const h = Math.round(w * 0.62);
                shimmerEl.style.width = `${w}px`;
                shimmerEl.style.height = `${h}px`;
                imageEl.style.display = "none";
            } else {
                Object.entries(HTMLAttributes).forEach(([key, value]) => {
                    if (value == null) return;
                    switch (key) {
                        case "width":
                        case "height":
                        case "caption":
                        case "align":
                            break;
                        default:
                            imageEl.setAttribute(key, String(value));
                            break;
                    }
                });
                imageEl.src = HTMLAttributes.src;
                shimmerEl.style.display = "none";
            }

            // Wrap both elements so we can swap between them
            const visualWrap = document.createElement("div");
            visualWrap.appendChild(shimmerEl);
            visualWrap.appendChild(imageEl);

            const nodeView = new ResizableNodeView({
                element: visualWrap,
                editor,
                node,
                getPos,
                onResize: (width: number, height: number) => {
                    imageEl.style.width = `${width}px`;
                    imageEl.style.height = `${height}px`;
                },
                onCommit: (width: number, height: number) => {
                    const pos = getPos();
                    if (pos === undefined) return;
                    this.editor.chain().setNodeSelection(pos).updateAttributes(this.name, { width, height }).run();
                },
                onUpdate: (updatedNode: any) => updatedNode.type === node.type,
                options: {
                    directions,
                    min: {
                        width: minWidth,
                        height: minHeight,
                    },
                    preserveAspectRatio: alwaysPreserveAspectRatio === true,
                },
            });

            const container = nodeView.dom as HTMLElement;
            const wrapper = nodeView.wrapper as HTMLElement;

            const captionWrap = document.createElement("div");
            captionWrap.className = "tiptap-image-caption-wrap";
            captionWrap.contentEditable = "false";
            const captionInput = document.createElement("input");
            captionInput.type = "text";
            captionInput.className = "tiptap-image-caption-input";
            captionInput.placeholder = "Legenda da imagem...";

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

            const syncCaptionUI = (attrs: Record<string, any>) => {
                const caption = String(attrs.caption || "");
                const editable = Boolean(editor.isEditable);
                captionInput.value = caption;
                captionInput.style.display = editable || caption ? "block" : "none";
                captionInput.readOnly = !editable;
                captionWrap.setAttribute("data-has-caption", caption ? "true" : "false");
                captionWrap.setAttribute("data-empty-caption", caption ? "false" : "true");
                captionWrap.style.width = wrapper.style.width || (attrs.width ? `${attrs.width}px` : "");
            };

            /** Swap from shimmer to real image or update src */
            const syncImageSrc = (attrs: Record<string, any>) => {
                const src = attrs.src || "";
                if (src === IMAGE_GENERATING_SRC || !src) {
                    const w = Number(attrs.width || 400);
                    const h = Math.round(w * 0.62);
                    shimmerEl.style.width = `${w}px`;
                    shimmerEl.style.height = `${h}px`;
                    shimmerEl.style.display = "block";
                    imageEl.style.display = "none";
                    captionWrap.style.display = "none";
                } else {
                    shimmerEl.style.display = "none";
                    imageEl.style.display = "";
                    captionWrap.style.display = "";
                    if (imageEl.getAttribute("src") !== src) {
                        imageEl.src = src;
                    }
                }
            };

            captionInput.addEventListener("input", () => {
                const nextValue = captionInput.value;
                captionWrap.setAttribute("data-has-caption", nextValue.trim() ? "true" : "false");
                captionWrap.setAttribute("data-empty-caption", nextValue.trim() ? "false" : "true");
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

            syncCaptionUI(node.attrs);
            syncImageSrc(node.attrs);

            const originalUpdate = nodeView.update.bind(nodeView);
            nodeView.update = (updatedNode: any, decorations: readonly any[], innerDecorations: any) => {
                const result = originalUpdate(updatedNode, decorations, innerDecorations);
                if (!result) return false;
                syncCaptionUI(updatedNode.attrs || {});
                syncImageSrc(updatedNode.attrs || {});
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
                return Boolean(target && captionWrap.contains(target));
            };

            return nodeView;
        };
    },

    addProseMirrorPlugins() {
        const parentPlugins = this.parent?.() || [];

        return [
            ...parentPlugins,
            new Plugin({
                key: imageAlignPluginKey,
                view() {
                    return {
                        update(view) {
                            const { doc } = view.state;

                            doc.descendants((node, pos) => {
                                if (node.type.name !== "image") return;

                                const nodeDom = view.nodeDOM(pos);
                                if (!nodeDom || !(nodeDom instanceof HTMLElement)) return;

                                // The outermost element is either [data-node-view-wrapper]
                                // or the resize container itself
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
                                const imageEl = (
                                    container.querySelector("img") ||
                                    (nodeDom.tagName === "IMG" ? nodeDom : null)
                                ) as HTMLElement | null;

                                const align = node.attrs.align || "left";
                                const width = Number(node.attrs.width || 0);

                                if (align === "center") {
                                    container.style.alignItems = "center";
                                } else if (align === "right") {
                                    container.style.alignItems = "flex-end";
                                } else {
                                    container.style.alignItems = "flex-start";
                                }

                                if (width > 0) {
                                    if (wrapper) wrapper.style.width = `${width}px`;
                                    if (imageEl) imageEl.style.width = `${width}px`;
                                } else {
                                    if (wrapper) wrapper.style.width = "";
                                    if (imageEl) imageEl.style.width = "";
                                }
                            });
                        },
                    };
                },
            }),
        ];
    },
});
