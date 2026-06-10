import type { ComponentType } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Save,
  Table,
  Type,
  Underline,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface EditorToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
  onOpenTemplateSearch?: () => void;
  onSaveAsTemplate?: () => void;
  onImportDocx?: () => void;
  onInsertImage?: () => void;
}

function ToolbarButton(props: {
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
}) {
  const Icon = props.icon;

  return (
    <Button
      type="button"
      variant={props.active ? 'secondary' : 'ghost'}
      size="sm"
      onClick={props.onClick}
      title={props.title}
      disabled={props.disabled}
      className="h-8 px-2"
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{props.title}</span>
    </Button>
  );
}

export function EditorToolbar({
  editor,
  disabled,
  onOpenTemplateSearch,
  onSaveAsTemplate,
  onImportDocx,
  onInsertImage,
}: EditorToolbarProps) {
  const { t } = useTranslation();
  const hasTemplateActions = Boolean(onOpenTemplateSearch || onSaveAsTemplate);

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/30 p-2">
      <ToolbarButton
        icon={Bold}
        title={t('medicalSharing.doctor.consultation.editor.toolbar.bold')}
        active={editor.isActive('bold')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={Italic}
        title={t('medicalSharing.doctor.consultation.editor.toolbar.italic')}
        active={editor.isActive('italic')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={Underline}
        title={t('medicalSharing.doctor.consultation.editor.toolbar.underline')}
        active={editor.isActive('underline')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolbarButton
        icon={Heading1}
        title={t('medicalSharing.doctor.consultation.editor.toolbar.heading1')}
        active={editor.isActive('heading', { level: 1 })}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        icon={Heading2}
        title={t('medicalSharing.doctor.consultation.editor.toolbar.heading2')}
        active={editor.isActive('heading', { level: 2 })}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        icon={Type}
        title={t('medicalSharing.doctor.consultation.editor.toolbar.paragraph')}
        active={editor.isActive('paragraph')}
        disabled={disabled}
        onClick={() => editor.chain().focus().setParagraph().run()}
      />
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolbarButton
        icon={List}
        title={t('medicalSharing.doctor.consultation.editor.toolbar.bulletList')}
        active={editor.isActive('bulletList')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrdered}
        title={t('medicalSharing.doctor.consultation.editor.toolbar.orderedList')}
        active={editor.isActive('orderedList')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={Table}
        title={t('medicalSharing.doctor.consultation.editor.toolbar.insertTable')}
        disabled={disabled}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      />

      {hasTemplateActions ? <Separator orientation="vertical" className="mx-1 h-6" /> : null}

      {onOpenTemplateSearch ? (
        <Button type="button" variant="outline" size="sm" onClick={onOpenTemplateSearch} disabled={disabled}>
          {t('medicalSharing.doctor.consultation.editor.toolbar.templates')}
        </Button>
      ) : null}

      {onSaveAsTemplate ? (
        <Button type="button" variant="outline" size="sm" onClick={onSaveAsTemplate} disabled={disabled}>
          <Save className="mr-1 h-4 w-4" />
          {t('medicalSharing.doctor.consultation.editor.toolbar.saveAsTemplate')}
        </Button>
      ) : null}

      {onInsertImage ? (
        <Button type="button" variant="outline" size="sm" onClick={onInsertImage} disabled={disabled}>
          <ImageIcon className="mr-1 h-4 w-4" />
          {t('medicalSharing.doctor.consultation.editor.toolbar.image')}
        </Button>
      ) : null}

      {onImportDocx ? (
        <Button type="button" variant="outline" size="sm" onClick={onImportDocx} disabled={disabled}>
          <Upload className="mr-1 h-4 w-4" />
          {t('medicalSharing.doctor.consultation.editor.toolbar.docx')}
        </Button>
      ) : null}
    </div>
  );
}
