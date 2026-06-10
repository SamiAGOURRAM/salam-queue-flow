import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, type JSONContent } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useMedicalEditor } from '@/hooks/useMedicalEditor';
import { useTemplates } from '@/hooks/useTemplates';
import { importDocxAsHtml } from '@/lib/editor/docx-import';
import { compressMedicalImage } from '@/lib/editor/image-upload';
import { extractSlashQuery, type SlashQueryState } from '@/lib/editor/slash-command';
import { createTemplateVariableContext } from '@/lib/editor/variable-node';
import type { MedicalTemplateType, TemplateVariableContext } from '@/services/medical-records';
import { cn } from '@/lib/utils';
import { EditorToolbar } from './EditorToolbar';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { SlashCommandMenu } from './SlashCommandMenu';
import { TemplateSearchDialog } from './TemplateSearchDialog';

interface MedicalEditorProps {
  value?: unknown;
  placeholder: string;
  templateType: MedicalTemplateType;
  clinicId?: string;
  userId?: string;
  specialty?: string;
  className?: string;
  editable?: boolean;
  allowImageUpload?: boolean;
  allowDocxImport?: boolean;
  canSaveClinicTemplate?: boolean;
  showToolbar?: boolean;
  showTemplateActions?: boolean;
  variableContext?: TemplateVariableContext;
  editorTestId?: string;
  onChangeDebounceMs?: number;
  onChange?: (payload: { json: JSONContent; html: string; text: string }) => void;
  onImageUpload?: (file: File) => Promise<{ signedUrl?: string; storagePath?: string }>;
}

interface MedicalImageNodeAttributes {
  src: string;
  alt?: string;
  storagePath?: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read image data.'));
        return;
      }

      resolve(result);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read image data.'));
    };

    reader.readAsDataURL(file);
  });
}

export function MedicalEditor({
  value,
  placeholder,
  templateType,
  clinicId,
  userId,
  specialty,
  className,
  editable = true,
  allowImageUpload = false,
  allowDocxImport = false,
  canSaveClinicTemplate = false,
  showToolbar = true,
  showTemplateActions = true,
  variableContext,
  editorTestId,
  onChangeDebounceMs = 0,
  onChange,
  onImageUpload,
}: MedicalEditorProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [slashState, setSlashState] = useState<SlashQueryState | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const onChangeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (onChangeTimerRef.current !== null) {
        window.clearTimeout(onChangeTimerRef.current);
      }
    };
  }, []);

  const {
    templates,
    loading,
    error,
    query,
    setQuery,
    createTemplate,
    markTemplateUsed,
    applyTemplate,
  } = useTemplates({
    clinicId,
    userId,
    templateType,
    specialty,
    limit: 25,
  });

  const slashTemplates = useMemo(
    () => (slashState ? templates.slice(0, 6) : []),
    [slashState, templates]
  );

  const editor = useMedicalEditor({
    value,
    placeholder,
    editable,
    onUpdate: ({ json, html, text, editor: tiptapEditor }) => {
      if (onChange) {
        const payload = { json, html, text };

        if (onChangeDebounceMs > 0) {
          if (onChangeTimerRef.current !== null) {
            window.clearTimeout(onChangeTimerRef.current);
          }

          onChangeTimerRef.current = window.setTimeout(() => {
            onChange(payload);
            onChangeTimerRef.current = null;
          }, onChangeDebounceMs);
        } else {
          onChange(payload);
        }
      }

      const selection = tiptapEditor.state.selection;
      const cursor = selection.from;
      const textBeforeCursor = tiptapEditor.state.doc.textBetween(
        Math.max(0, cursor - 80),
        cursor,
        '\n',
        '\0'
      );

      const slash = extractSlashQuery(textBeforeCursor, cursor);
      if (!slash) {
        setSlashState(null);
        return;
      }

      setSlashState(slash);
      setQuery(slash.query);
    },
  });

  const templateContext = useMemo(
    () => createTemplateVariableContext(variableContext ?? {}, { locale: i18n.language }),
    [i18n.language, variableContext]
  );

  const insertTemplateIntoEditor = async (templateId: string) => {
    if (!editor) return;

    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    const resolved = applyTemplate(template, templateContext);

    if (slashState) {
      editor
        .chain()
        .focus()
        .deleteRange({ from: slashState.from, to: slashState.to })
        .run();
      setSlashState(null);
    }

    editor.chain().focus().insertContent(resolved as JSONContent).run();
    await markTemplateUsed(template.id);
  };

  const handleImageInput = async (file?: File | null) => {
    if (!file || !editor) return;

    try {
      const preparedFile = onImageUpload ? file : await compressMedicalImage(file);
      const uploadResult = onImageUpload ? await onImageUpload(preparedFile) : undefined;
      const src = uploadResult?.signedUrl ?? (await fileToDataUrl(preparedFile));
      const attrs: MedicalImageNodeAttributes = {
        src,
        alt: preparedFile.name,
        storagePath: uploadResult?.storagePath,
      };

      editor
        .chain()
        .focus()
        .insertContent({
          type: 'image',
          attrs,
        })
        .run();
    } catch (uploadError) {
      toast({
        title: t('medicalSharing.doctor.consultation.editor.errors.imageUploadTitle'),
        description:
          uploadError instanceof Error
            ? uploadError.message
            : t('medicalSharing.doctor.consultation.editor.errors.imageUploadDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleDocxInput = async (file?: File | null) => {
    if (!file || !editor) return;

    try {
      const html = await importDocxAsHtml(file);
      editor.chain().focus().insertContent(html).run();
    } catch (importError) {
      toast({
        title: t('medicalSharing.doctor.consultation.editor.errors.docxImportTitle'),
        description:
          importError instanceof Error
            ? importError.message
            : t('medicalSharing.doctor.consultation.editor.errors.docxImportDescription'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        data-testid={editorTestId ? `${editorTestId}-image-input` : undefined}
        className="hidden"
        onChange={(event) => {
          const [file] = Array.from(event.target.files ?? []);
          void handleImageInput(file);
          event.currentTarget.value = '';
        }}
      />

      <input
        ref={docxInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        data-testid={editorTestId ? `${editorTestId}-docx-input` : undefined}
        className="hidden"
        onChange={(event) => {
          const [file] = Array.from(event.target.files ?? []);
          void handleDocxInput(file);
          event.currentTarget.value = '';
        }}
      />

      <div className="relative">
        {showToolbar ? (
          <EditorToolbar
            editor={editor}
            disabled={!editable}
            onOpenTemplateSearch={showTemplateActions ? () => setTemplateDialogOpen(true) : undefined}
            onSaveAsTemplate={showTemplateActions ? () => setSaveDialogOpen(true) : undefined}
            onImportDocx={allowDocxImport ? () => docxInputRef.current?.click() : undefined}
            onInsertImage={allowImageUpload ? () => imageInputRef.current?.click() : undefined}
          />
        ) : null}

        <SlashCommandMenu
          open={Boolean(slashState)}
          query={slashState?.query ?? ''}
          loading={loading}
          templates={slashTemplates}
          onClose={() => setSlashState(null)}
          onSelect={(template) => {
            void insertTemplateIntoEditor(template.id);
          }}
        />
      </div>

      <div className="min-h-[220px] rounded-md border border-border bg-background p-3">
        <EditorContent
          editor={editor}
          data-testid={editorTestId}
          className="prose prose-sm max-w-none [&_.ProseMirror]:min-h-[180px] [&_.ProseMirror]:outline-none"
        />
      </div>

      {showTemplateActions ? (
        <TemplateSearchDialog
          open={templateDialogOpen}
          loading={loading}
          error={error}
          query={query}
          templates={templates}
          onOpenChange={setTemplateDialogOpen}
          onQueryChange={setQuery}
          onSelect={(template) => {
            void insertTemplateIntoEditor(template.id);
          }}
        />
      ) : null}

      {showTemplateActions ? (
        <SaveTemplateDialog
          open={saveDialogOpen}
          loading={savingTemplate}
          canSaveClinicTemplate={canSaveClinicTemplate}
          onOpenChange={setSaveDialogOpen}
          onSubmit={async ({ title, description, tags, scope }) => {
            if (!editor || !userId) {
              throw new Error(t('medicalSharing.doctor.consultation.editor.errors.missingUserContext'));
            }

            setSavingTemplate(true);

            try {
              await createTemplate({
                scope,
                clinicId,
                specialty,
                title,
                description,
                tags,
                content: editor.getJSON(),
              });
              setSaveDialogOpen(false);
              toast({
                title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
                description: t('medicalSharing.doctor.consultation.toasts.templateSaved'),
              });
            } finally {
              setSavingTemplate(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
