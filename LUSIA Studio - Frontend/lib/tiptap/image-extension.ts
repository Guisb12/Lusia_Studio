import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const imageAlignPluginKey = new PluginKey("imageAlign");

/**
 * Extended Image extension that adds an `align` attribute (left | center | right)
 * and a ProseMirror plugin that applies `justify-content` to the resize container.
 */
export const CustomImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            align: {
                default: "left",
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute("data-align") || "left",
                renderHTML: (attributes: Record<string, any>) => ({
                    "data-align": attributes.align,
                }),
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
        } as any;
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

                                const dom = view.nodeDOM(pos);
                                if (!dom || !(dom instanceof HTMLElement)) return;

                                // The outermost element is either [data-node-view-wrapper]
                                // or the resize container itself
                                const container = (
                                    dom.closest("[data-resize-container]") ||
                                    dom.querySelector("[data-resize-container]") ||
                                    dom
                                ) as HTMLElement;

                                const align = node.attrs.align || "left";

                                if (align === "center") {
                                    container.style.justifyContent = "center";
                                } else if (align === "right") {
                                    container.style.justifyContent = "flex-end";
                                } else {
                                    container.style.justifyContent = "";
                                }
                            });
                        },
                    };
                },
            }),
        ];
    },
});
