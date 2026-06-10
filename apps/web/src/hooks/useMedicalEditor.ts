import { useEffect } from 'react';
import { useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { createMedicalEditorExtensions } from '@/lib/editor/editor-config';

const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

interface UseMedicalEditorOptions {
  value?: unknown;
  placeholder: string;
  editable?: boolean;
  onUpdate?: (payload: { json: JSONContent; html: string; text: string; editor: Editor }) => void;
}

function toEditorContent(value: unknown): JSONContent {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JSONContent;
  }

  if (typeof value === 'string' && value.trim()) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
    };
  }

  return EMPTY_DOC;
}

export function useMedicalEditor(options: UseMedicalEditorOptions) {
  const { value, placeholder, editable = true, onUpdate } = options;

  const editor = useEditor({
    extensions: createMedicalEditorExtensions(placeholder),
    content: toEditorContent(value),
    editable,
    autofocus: false,
    immediatelyRender: false,
    onUpdate: ({ editor: tiptapEditor }) => {
      onUpdate?.({
        json: tiptapEditor.getJSON(),
        html: tiptapEditor.getHTML(),
        text: tiptapEditor.getText(),
        editor: tiptapEditor,
      });
    },
  });

  useEffect(() => {
    if (!editor) return;

    const next = toEditorContent(value);
    const current = editor.getJSON();

    if (JSON.stringify(current) !== JSON.stringify(next)) {
      editor.commands.setContent(next, false);
    }
  }, [editor, value]);

  return editor;
}
