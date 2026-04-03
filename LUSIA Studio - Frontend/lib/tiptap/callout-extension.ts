import { mergeAttributes, Node } from "@tiptap/core";

const CALLOUT_KIND_OPTIONS = [
    ["definition", "Definição"],
    ["key-idea", "Ideia-chave"],
    ["example", "Exemplo"],
    ["procedure", "Procedimento"],
    ["warning", "Aviso"],
    ["tip", "Dica"],
    ["question", "Questão"],
    ["evidence", "Evidência"],
    ["summary", "Resumo"],
] as const;

export const Callout = Node.create({
    name: "callout",
    group: "block",
    content: "block+",
    defining: true,
    isolating: true,

    addAttributes() {
        return {
            kind: {
                default: "definition",
                parseHTML: (element: HTMLElement) => element.getAttribute("data-callout-kind") || "definition",
            },
            title: {
                default: "",
                parseHTML: (element: HTMLElement) => element.getAttribute("data-callout-title") || "",
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "div[data-callout]",
                contentElement: "[data-callout-body]",
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const title = String(HTMLAttributes.title || "");
        const kind = String(HTMLAttributes.kind || "definition");
        return [
            "div",
            mergeAttributes(HTMLAttributes, {
                "data-callout": "",
                "data-callout-kind": kind,
                "data-callout-title": title,
            }),
            ["div", { "data-callout-header": "" },
                ["span", { "data-callout-icon": "", "data-callout-kind": kind, "aria-hidden": "true" }],
                ...(title ? [["div", { "data-callout-title": "" }, title]] : []),
            ],
            ["div", { "data-callout-body": "" }, 0],
        ];
    },

    addNodeView() {
        return ({ node, editor, getPos }: any) => {
            const kind = String(node.attrs.kind || "definition");

            if (!editor.isEditable) {
                const dom = document.createElement("div");
                dom.setAttribute("data-callout", "");
                dom.setAttribute("data-callout-kind", kind);
                dom.setAttribute("data-callout-title", String(node.attrs.title || ""));

                const header = document.createElement("div");
                header.setAttribute("data-callout-header", "");

                const icon = document.createElement("span");
                icon.setAttribute("data-callout-icon", "");
                icon.setAttribute("data-callout-kind", kind);
                icon.setAttribute("aria-hidden", "true");

                const title = document.createElement("div");
                title.setAttribute("data-callout-title", "");
                title.textContent = String(node.attrs.title || "");
                title.style.display = node.attrs.title ? "" : "none";

                const body = document.createElement("div");
                body.setAttribute("data-callout-body", "");

                header.appendChild(icon);
                header.appendChild(title);
                dom.appendChild(header);
                dom.appendChild(body);

                return {
                    dom,
                    contentDOM: body,
                    update(updatedNode: any) {
                        if (updatedNode.type !== node.type) return false;
                        const nextKind = String(updatedNode.attrs.kind || "definition");
                        const nextTitle = String(updatedNode.attrs.title || "");
                        dom.setAttribute("data-callout-kind", nextKind);
                        dom.setAttribute("data-callout-title", nextTitle);
                        icon.setAttribute("data-callout-kind", nextKind);
                        title.textContent = nextTitle;
                        title.style.display = nextTitle ? "" : "none";
                        return true;
                    },
                };
            }

            const dom = document.createElement("div");
            dom.setAttribute("data-callout", "");
            dom.setAttribute("data-callout-kind", kind);
            dom.setAttribute("data-callout-title", String(node.attrs.title || ""));

            const header = document.createElement("div");
            header.setAttribute("data-callout-header", "");
            header.contentEditable = "false";

            const icon = document.createElement("button");
            icon.type = "button";
            icon.setAttribute("data-callout-icon", "");
            icon.setAttribute("data-callout-kind", kind);
            icon.setAttribute("aria-hidden", "true");
            icon.contentEditable = "false";

            const title = document.createElement("input");
            title.type = "text";
            title.setAttribute("data-callout-title", "");
            title.placeholder = "Título do callout...";
            title.value = String(node.attrs.title || "");
            title.readOnly = !editor.isEditable;
            title.spellcheck = false;


            const body = document.createElement("div");
            body.setAttribute("data-callout-body", "");

            const kindPopover = document.createElement("div");
            kindPopover.setAttribute("data-callout-kind-popover", "");
            kindPopover.hidden = true;

            CALLOUT_KIND_OPTIONS.forEach(([value, label]) => {
                const option = document.createElement("button");
                option.type = "button";
                option.setAttribute("data-callout-kind-option", "");
                option.setAttribute("data-callout-kind", value);
                const optionIcon = document.createElement("span");
                optionIcon.setAttribute("data-callout-option-icon", "");
                optionIcon.setAttribute("data-callout-kind", value);
                optionIcon.setAttribute("aria-hidden", "true");
                const optionLabel = document.createElement("span");
                optionLabel.textContent = label;
                option.appendChild(optionIcon);
                option.appendChild(optionLabel);
                if (value === kind) {
                    option.setAttribute("data-active", "true");
                }
                option.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                });
                option.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const pos = getPos();
                    if (pos === undefined) return;
                    const currentNode = editor.state.doc.nodeAt(pos);
                    if (!currentNode) return;
                    const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
                        ...currentNode.attrs,
                        kind: value,
                    });
                    editor.view.dispatch(tr);
                    closePopover();
                });
                kindPopover.appendChild(option);
            });

            header.appendChild(icon);
            header.appendChild(title);
            dom.appendChild(header);
            dom.appendChild(body);

            let syncTimer: number | null = null;
            let isPopoverOpen = false;

            const resolvePopoverHost = () =>
                (dom.closest("[data-app-scroll-viewport]") as HTMLElement | null) ??
                document.body;

            const positionPopover = () => {
                const popoverHost = resolvePopoverHost();
                if (kindPopover.parentElement !== popoverHost) {
                    popoverHost.appendChild(kindPopover);
                }
                const rect = icon.getBoundingClientRect();
                const hostRect = popoverHost.getBoundingClientRect();
                kindPopover.style.top = `${rect.bottom - hostRect.top + popoverHost.scrollTop + 8}px`;
                kindPopover.style.left = `${rect.left - hostRect.left + popoverHost.scrollLeft - 6}px`;
            };

            const closePopover = () => {
                isPopoverOpen = false;
                kindPopover.hidden = true;
            };

            const openPopover = () => {
                isPopoverOpen = true;
                positionPopover();
                kindPopover.hidden = false;
            };

            const handleOutsidePointerDown = (event: MouseEvent) => {
                const target = event.target as globalThis.Node | null;
                if (!target) return;
                if (header.contains(target) || kindPopover.contains(target)) return;
                closePopover();
            };

            const handleWindowReposition = () => {
                if (!isPopoverOpen) return;
                positionPopover();
            };

            document.addEventListener("mousedown", handleOutsidePointerDown, true);
            window.addEventListener("scroll", handleWindowReposition, true);
            window.addEventListener("resize", handleWindowReposition);

            const commitTitle = () => {
                const pos = getPos();
                if (pos === undefined) return;
                const nextTitle = title.value.trim();
                const currentNode = editor.state.doc.nodeAt(pos);
                if (!currentNode) return;
                const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
                    ...currentNode.attrs,
                    title: nextTitle,
                });
                editor.view.dispatch(tr);
            };

            const queueCommit = () => {
                if (syncTimer !== null) {
                    window.clearTimeout(syncTimer);
                }
                syncTimer = window.setTimeout(commitTitle, 120);
            };

            title.addEventListener("input", queueCommit);
            title.addEventListener("blur", commitTitle);
            title.addEventListener("mousedown", (event) => {
                event.stopPropagation();
            });
            title.addEventListener("click", (event) => {
                event.stopPropagation();
            });
            title.addEventListener("keydown", (event) => {
                event.stopPropagation();
            });
            title.addEventListener("focus", (event) => {
                event.stopPropagation();
            });
            icon.addEventListener("mousedown", (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
            icon.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (isPopoverOpen) {
                    closePopover();
                } else {
                    openPopover();
                }
            });

            const syncKindOptions = (nextKind: string) => {
                Array.from(kindPopover.querySelectorAll("[data-callout-kind-option]")).forEach((element) => {
                    const option = element as HTMLElement;
                    if (option.getAttribute("data-callout-kind") === nextKind) {
                        option.setAttribute("data-active", "true");
                    } else {
                        option.removeAttribute("data-active");
                    }
                });
            };

            return {
                dom,
                contentDOM: body,
                update: (updatedNode: any) => {
                    if (updatedNode.type !== node.type) return false;
                    const nextKind = String(updatedNode.attrs.kind || "definition");
                    dom.setAttribute("data-callout-kind", nextKind);
                    dom.setAttribute("data-callout-title", String(updatedNode.attrs.title || ""));
                    icon.setAttribute("data-callout-kind", nextKind);
                    title.readOnly = !editor.isEditable;
                    if (document.activeElement !== title) {
                        title.value = String(updatedNode.attrs.title || "");
                    }
                    syncKindOptions(nextKind);
                    handleWindowReposition();
                    return true;
                },
                stopEvent: (event: Event) => {
                    const target = event.target as globalThis.Node | null;
                    return Boolean(target && (header.contains(target) || kindPopover.contains(target)));
                },
                ignoreMutation: (mutation: MutationRecord | { type: string; target: EventTarget | null }) => {
                    const target = mutation.target as globalThis.Node | null;
                    return Boolean(target && (header.contains(target) || kindPopover.contains(target)));
                },
                destroy: () => {
                    document.removeEventListener("mousedown", handleOutsidePointerDown, true);
                    window.removeEventListener("scroll", handleWindowReposition, true);
                    window.removeEventListener("resize", handleWindowReposition);
                    kindPopover.remove();
                },
            };
        };
    },
});
