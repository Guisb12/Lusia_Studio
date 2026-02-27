"use client";

import { useCallback, useRef, useState } from "react";
import { Editor } from "@tiptap/core";
import { uploadNoteImage } from "@/lib/editor-images";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    ChevronDown,
    Pilcrow,
    List,
    ListOrdered,
    ListChecks,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Quote,
    CodeSquare,
    Minus,
    ImagePlus,
    Loader2,
    Table,
    Link as LinkIcon,
    Unlink,
    Undo2,
    Redo2,
    Palette,
    Highlighter,
    Plus,
    Trash2,
    TableProperties,
    Radical,
    Type,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EditorToolbarProps {
    editor: Editor;
    artifactId?: string;
}

const TEXT_COLORS = [
    { color: "#15316b", label: "Azul escuro" },
    { color: "#0a1bb6", label: "Azul" },
    { color: "#000000", label: "Preto" },
    { color: "#6b7280", label: "Cinzento" },
    { color: "#ef4444", label: "Vermelho" },
    { color: "#f59e0b", label: "Amarelo" },
    { color: "#10b981", label: "Verde" },
    { color: "#8b5cf6", label: "Roxo" },
    { color: "#ec4899", label: "Rosa" },
];

const HIGHLIGHT_COLORS = [
    { color: "#fef08a", label: "Amarelo" },
    { color: "#bbf7d0", label: "Verde" },
    { color: "#bfdbfe", label: "Azul" },
    { color: "#fecaca", label: "Vermelho" },
    { color: "#e9d5ff", label: "Roxo" },
    { color: "#fed7aa", label: "Laranja" },
];

/* ── Shared button styles ── */

const btnBase = cn(
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
    "hover:bg-muted hover:text-muted-foreground h-8 px-1.5 min-w-8",
);

const btnActive = "bg-accent text-accent-foreground";

/* ── Reusable components ── */

function ToolbarToggle({
    pressed,
    onPressedChange,
    ariaLabel,
    children,
    disabled,
}: {
    pressed: boolean;
    onPressedChange: () => void;
    ariaLabel: string;
    children: React.ReactNode;
    disabled?: boolean;
}) {
    return (
        <Toggle
            size="sm"
            pressed={pressed}
            onPressedChange={onPressedChange}
            aria-label={ariaLabel}
            disabled={disabled}
        >
            {children}
        </Toggle>
    );
}

/** A popover that shows a grid of options — used for grouping toolbar items on mobile */
function ToolbarGroupPopover({
    icon,
    ariaLabel,
    activeLabel,
    children,
}: {
    icon: React.ReactNode;
    ariaLabel: string;
    activeLabel?: string;
    children: React.ReactNode;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(btnBase, "gap-0.5", activeLabel && btnActive)}
                    aria-label={ariaLabel}
                >
                    {icon}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-auto p-1.5"
                side="bottom"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <div className="flex items-center gap-0.5">
                    {children}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function ColorPickerPopover({
    colors,
    icon: Icon,
    ariaLabel,
    onSelect,
    onClear,
    activeColor,
}: {
    colors: { color: string; label: string }[];
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    ariaLabel: string;
    onSelect: (color: string) => void;
    onClear: () => void;
    activeColor?: string | null;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(btnBase, activeColor && btnActive)}
                    aria-label={ariaLabel}
                >
                    <Icon
                        className="h-4 w-4"
                        style={activeColor ? { color: activeColor } : undefined}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" side="bottom" align="start">
                <div className="grid grid-cols-3 gap-1">
                    {colors.map((c) => (
                        <button
                            key={c.color}
                            type="button"
                            onClick={() => onSelect(c.color)}
                            className={cn(
                                "w-7 h-7 rounded-md border border-brand-primary/10 transition-all hover:scale-110",
                                activeColor === c.color && "ring-2 ring-brand-accent ring-offset-1",
                            )}
                            style={{ backgroundColor: c.color }}
                            title={c.label}
                        />
                    ))}
                </div>
                {activeColor && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="mt-2 w-full text-xs text-brand-primary/50 hover:text-brand-primary transition-colors py-1"
                    >
                        Remover cor
                    </button>
                )}
            </PopoverContent>
        </Popover>
    );
}

function LinkPopover({ editor }: { editor: Editor }) {
    const [url, setUrl] = useState("");
    const [open, setOpen] = useState(false);

    const handleOpen = useCallback(
        (isOpen: boolean) => {
            if (isOpen) {
                const existingUrl = editor.getAttributes("link").href || "";
                setUrl(existingUrl);
            }
            setOpen(isOpen);
        },
        [editor],
    );

    const applyLink = () => {
        if (url.trim()) {
            editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url.trim() })
                .run();
        }
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={handleOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(btnBase, editor.isActive("link") && btnActive)}
                    aria-label="Link"
                >
                    <LinkIcon className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" side="bottom" align="start">
                <div className="flex flex-col gap-2">
                    <Input
                        placeholder="https://..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") applyLink();
                        }}
                        className="h-8 text-sm"
                    />
                    <div className="flex gap-2">
                        <Button size="sm" className="flex-1 h-7 text-xs" onClick={applyLink}>
                            Aplicar
                        </Button>
                        {editor.isActive("link") && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                    editor.chain().focus().unsetLink().run();
                                    setOpen(false);
                                }}
                            >
                                <Unlink className="h-3 w-3" />
                                Remover
                            </Button>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function TableControls({ editor }: { editor: Editor }) {
    if (!editor.isActive("table")) return null;

    return (
        <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className={cn(btnBase)}
                title="Adicionar coluna"
            >
                <Plus className="h-3.5 w-3.5" />
                <TableProperties className="h-3.5 w-3.5" />
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className={cn(btnBase)}
                title="Adicionar linha"
            >
                <Plus className="h-3.5 w-3.5" />
                <List className="h-3.5 w-3.5" />
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
                className={cn(btnBase, "text-red-500 hover:text-red-600")}
                title="Apagar tabela"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </>
    );
}

/* ── Custom inline icons ── */

/** T1 / T2 / T3 heading icons for Portuguese teachers */
function TitleIcon({ level, className }: { level: 1 | 2 | 3; className?: string }) {
    return (
        <span className={cn("font-bold text-xs leading-none select-none", className)}>
            T{level}
        </span>
    );
}

/** Column layout icon — shows vertical dividers */
function ColumnsIcon({ count, className }: { count: 2 | 3; className?: string }) {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
            <rect x="1" y="2" width={count === 2 ? "6" : "3.5"} height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
            {count === 2 ? (
                <rect x="9" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
            ) : (
                <>
                    <rect x="6.25" y="2" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <rect x="11.5" y="2" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </>
            )}
        </svg>
    );
}

/* ── Main toolbar ── */

export function EditorToolbar({ editor, artifactId }: EditorToolbarProps) {
    const iconSize = "h-4 w-4";
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imageUploading, setImageUploading] = useState(false);

    const handleImageSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file || !artifactId) return;
            // Reset input so the same file can be selected again
            e.target.value = "";

            setImageUploading(true);
            try {
                const url = await uploadNoteImage(artifactId, file);
                editor.chain().focus().setImage({ src: url }).run();
            } catch {
                // Fallback: if upload fails, read as base64
                const reader = new FileReader();
                reader.onload = () => {
                    if (typeof reader.result === "string") {
                        editor.chain().focus().setImage({ src: reader.result }).run();
                    }
                };
                reader.readAsDataURL(file);
            } finally {
                setImageUploading(false);
            }
        },
        [editor, artifactId],
    );

    // Determine active heading for the popover trigger label
    const activeHeading = editor.isActive("heading", { level: 1 })
        ? "T1"
        : editor.isActive("heading", { level: 2 })
            ? "T2"
            : editor.isActive("heading", { level: 3 })
                ? "T3"
                : null;

    return (
        <div>
            <div className="flex items-center gap-0.5 px-3 py-1.5 flex-wrap">
                {/* Undo / Redo */}
                <ToolbarToggle
                    pressed={false}
                    onPressedChange={() => editor.chain().focus().undo().run()}
                    ariaLabel="Desfazer"
                    disabled={!editor.can().undo()}
                >
                    <Undo2 className={iconSize} />
                </ToolbarToggle>
                <ToolbarToggle
                    pressed={false}
                    onPressedChange={() => editor.chain().focus().redo().run()}
                    ariaLabel="Refazer"
                    disabled={!editor.can().redo()}
                >
                    <Redo2 className={iconSize} />
                </ToolbarToggle>

                <Separator orientation="vertical" className="h-6 mx-1" />

                {/* Text formatting */}
                <ToolbarToggle
                    pressed={editor.isActive("bold")}
                    onPressedChange={() => editor.chain().focus().toggleBold().run()}
                    ariaLabel="Negrito"
                >
                    <Bold className={iconSize} />
                </ToolbarToggle>
                <ToolbarToggle
                    pressed={editor.isActive("italic")}
                    onPressedChange={() => editor.chain().focus().toggleItalic().run()}
                    ariaLabel="Itálico"
                >
                    <Italic className={iconSize} />
                </ToolbarToggle>
                <ToolbarToggle
                    pressed={editor.isActive("underline")}
                    onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
                    ariaLabel="Sublinhado"
                >
                    <Underline className={iconSize} />
                </ToolbarToggle>
                <ToolbarToggle
                    pressed={editor.isActive("strike")}
                    onPressedChange={() => editor.chain().focus().toggleStrike().run()}
                    ariaLabel="Riscado"
                >
                    <Strikethrough className={iconSize} />
                </ToolbarToggle>
                <ToolbarToggle
                    pressed={editor.isActive("code")}
                    onPressedChange={() => editor.chain().focus().toggleCode().run()}
                    ariaLabel="Código inline"
                >
                    <Code className={iconSize} />
                </ToolbarToggle>

                <Separator orientation="vertical" className="h-6 mx-1" />

                {/* Títulos — popover dropdown */}
                <ToolbarGroupPopover
                    icon={<Type className={iconSize} />}
                    ariaLabel="Títulos"
                    activeLabel={activeHeading ?? undefined}
                >
                    <ToolbarToggle
                        pressed={editor.isActive("heading", { level: 1 })}
                        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        ariaLabel="Título 1"
                    >
                        <TitleIcon level={1} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={editor.isActive("heading", { level: 2 })}
                        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        ariaLabel="Título 2"
                    >
                        <TitleIcon level={2} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={editor.isActive("heading", { level: 3 })}
                        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        ariaLabel="Título 3"
                    >
                        <TitleIcon level={3} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={editor.isActive("paragraph")}
                        onPressedChange={() => editor.chain().focus().setParagraph().run()}
                        ariaLabel="Parágrafo"
                    >
                        <Pilcrow className={iconSize} />
                    </ToolbarToggle>
                </ToolbarGroupPopover>

                {/* Listas — popover dropdown */}
                <ToolbarGroupPopover
                    icon={<List className={iconSize} />}
                    ariaLabel="Listas"
                    activeLabel={
                        editor.isActive("bulletList") || editor.isActive("orderedList") || editor.isActive("taskList")
                            ? "active"
                            : undefined
                    }
                >
                    <ToolbarToggle
                        pressed={editor.isActive("bulletList")}
                        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
                        ariaLabel="Lista"
                    >
                        <List className={iconSize} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={editor.isActive("orderedList")}
                        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
                        ariaLabel="Lista numerada"
                    >
                        <ListOrdered className={iconSize} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={editor.isActive("taskList")}
                        onPressedChange={() => editor.chain().focus().toggleTaskList().run()}
                        ariaLabel="Checklist"
                    >
                        <ListChecks className={iconSize} />
                    </ToolbarToggle>
                </ToolbarGroupPopover>

                {/* Alinhamento — popover dropdown */}
                <ToolbarGroupPopover
                    icon={<AlignLeft className={iconSize} />}
                    ariaLabel="Alinhamento"
                >
                    <ToolbarToggle
                        pressed={editor.isActive({ textAlign: "left" })}
                        onPressedChange={() => editor.chain().focus().setTextAlign("left").run()}
                        ariaLabel="Esquerda"
                    >
                        <AlignLeft className={iconSize} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={editor.isActive({ textAlign: "center" })}
                        onPressedChange={() => editor.chain().focus().setTextAlign("center").run()}
                        ariaLabel="Centrar"
                    >
                        <AlignCenter className={iconSize} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={editor.isActive({ textAlign: "right" })}
                        onPressedChange={() => editor.chain().focus().setTextAlign("right").run()}
                        ariaLabel="Direita"
                    >
                        <AlignRight className={iconSize} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={editor.isActive({ textAlign: "justify" })}
                        onPressedChange={() => editor.chain().focus().setTextAlign("justify").run()}
                        ariaLabel="Justificar"
                    >
                        <AlignJustify className={iconSize} />
                    </ToolbarToggle>
                </ToolbarGroupPopover>

                <Separator orientation="vertical" className="h-6 mx-1" />

                {/* Block elements — popover dropdown */}
                <ToolbarGroupPopover
                    icon={<Quote className={iconSize} />}
                    ariaLabel="Blocos"
                    activeLabel={
                        editor.isActive("blockquote") || editor.isActive("codeBlock")
                            ? "active"
                            : undefined
                    }
                >
                    <ToolbarToggle
                        pressed={editor.isActive("blockquote")}
                        onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
                        ariaLabel="Citação"
                    >
                        <Quote className={iconSize} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={editor.isActive("codeBlock")}
                        onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()}
                        ariaLabel="Bloco de código"
                    >
                        <CodeSquare className={iconSize} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={false}
                        onPressedChange={() => editor.chain().focus().setHorizontalRule().run()}
                        ariaLabel="Linha horizontal"
                    >
                        <Minus className={iconSize} />
                    </ToolbarToggle>
                </ToolbarGroupPopover>

                {/* Colors */}
                <ColorPickerPopover
                    colors={TEXT_COLORS}
                    icon={Palette}
                    ariaLabel="Cor do texto"
                    onSelect={(color) => editor.chain().focus().setColor(color).run()}
                    onClear={() => editor.chain().focus().unsetColor().run()}
                    activeColor={editor.getAttributes("textStyle").color}
                />
                <ColorPickerPopover
                    colors={HIGHLIGHT_COLORS}
                    icon={Highlighter}
                    ariaLabel="Realçar"
                    onSelect={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
                    onClear={() => editor.chain().focus().unsetHighlight().run()}
                    activeColor={
                        editor.isActive("highlight")
                            ? editor.getAttributes("highlight").color
                            : null
                    }
                />

                {/* Link */}
                <LinkPopover editor={editor} />

                <Separator orientation="vertical" className="h-6 mx-1" />

                {/* Insert: Image, Table, Math */}
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleImageSelect}
                />
                <ToolbarToggle
                    pressed={false}
                    onPressedChange={() => imageInputRef.current?.click()}
                    ariaLabel="Inserir imagem"
                    disabled={imageUploading}
                >
                    {imageUploading ? (
                        <Loader2 className={cn(iconSize, "animate-spin")} />
                    ) : (
                        <ImagePlus className={iconSize} />
                    )}
                </ToolbarToggle>
                <ToolbarToggle
                    pressed={false}
                    onPressedChange={() =>
                        editor
                            .chain()
                            .focus()
                            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                            .run()
                    }
                    ariaLabel="Inserir tabela"
                >
                    <Table className={iconSize} />
                </ToolbarToggle>
                <ToolbarToggle
                    pressed={false}
                    onPressedChange={() => {
                        const { from, to } = editor.state.selection;
                        const selectedText = editor.state.doc.textBetween(from, to, "");
                        const latex = selectedText.trim() || "";
                        editor
                            .chain()
                            .focus()
                            .insertContent({
                                type: "mathInline",
                                attrs: { latex },
                            })
                            .run();
                    }}
                    ariaLabel="Equação"
                >
                    <Radical className={iconSize} />
                </ToolbarToggle>

                {/* Columns — popover */}
                <ToolbarGroupPopover
                    icon={<ColumnsIcon count={2} className={iconSize} />}
                    ariaLabel="Colunas"
                >
                    <ToolbarToggle
                        pressed={false}
                        onPressedChange={() => editor.chain().focus().insertColumns(2).run()}
                        ariaLabel="2 colunas"
                    >
                        <ColumnsIcon count={2} className={iconSize} />
                    </ToolbarToggle>
                    <ToolbarToggle
                        pressed={false}
                        onPressedChange={() => editor.chain().focus().insertColumns(3).run()}
                        ariaLabel="3 colunas"
                    >
                        <ColumnsIcon count={3} className={iconSize} />
                    </ToolbarToggle>
                </ToolbarGroupPopover>

                {/* Table controls (contextual) */}
                <TableControls editor={editor} />
            </div>
        </div>
    );
}
