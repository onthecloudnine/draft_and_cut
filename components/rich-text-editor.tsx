"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

type RichTextEditorProps = {
  editable?: boolean;
  onChange?: (html: string) => void;
  placeholder?: string;
  value: string;
};

export function plainTextToHtml(text: string): string {
  if (!text) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.trim().replace(/\n/g, "<br>")}</p>`)
    .filter((paragraph) => paragraph !== "<p></p>")
    .join("");
}

export function RichTextEditor({ editable = true, onChange, placeholder, value }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] }
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
        showOnlyWhenEditable: true
      })
    ],
    content: plainTextToHtml(value),
    editorProps: {
      attributes: {
        class:
          "prose-editor min-h-[200px] max-w-none focus:outline-none text-[15px] leading-7 text-fg"
      }
    },
    onUpdate: ({ editor: instance }) => {
      onChange?.(instance.getHTML());
    }
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = plainTextToHtml(value);
    if (current === next) return;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) {
    return <div className="min-h-[200px] text-sm text-muted">Cargando editor...</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {editable ? <RichTextToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function RichTextToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-md border border-line bg-surface/95 p-1 backdrop-blur">
      <ToolbarButton
        active={editor.isActive("heading", { level: 1 })}
        label="H1"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <span className="text-xs font-bold">H1</span>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        label="H2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <span className="text-xs font-bold">H2</span>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("heading", { level: 3 })}
        label="H3"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <span className="text-xs font-bold">H3</span>
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        active={editor.isActive("bold")}
        label="Negrita"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
          <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        label="Italica"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M10 5h8M6 19h8M14 5l-4 14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("strike")}
        label="Tachado"
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M4 12h16M7 7c1-2 3-3 5-3 4 0 6 3 5 6M9 17c1 2 3 3 5 3 4 0 6-3 5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("code")}
        label="Codigo"
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        active={editor.isActive("bulletList")}
        label="Lista"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        label="Lista numerada"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M10 6h11M10 12h11M10 18h11M4 4v4M3 16h2l-2 2h2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("blockquote")}
        label="Cita"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M6 7v4a4 4 0 0 1-4 4M16 7v4a4 4 0 0 1-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        disabled={!editor.can().undo()}
        label="Deshacer"
        onClick={() => editor.chain().focus().undo().run()}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        disabled={!editor.can().redo()}
        label="Rehacer"
        onClick={() => editor.chain().focus().redo().run()}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M15 14l4-4-4-4M19 10h-9a5 5 0 0 0 0 10h3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  active,
  children,
  disabled,
  label,
  onClick
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={[
        "flex h-8 w-8 items-center justify-center rounded transition disabled:cursor-not-allowed disabled:opacity-30",
        active ? "bg-red-600/20 text-danger-fg" : "text-muted-strong hover:bg-elevated hover:text-fg-strong"
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-elevated" aria-hidden />;
}
