import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { MedicalTemplate } from '@/services/medical-records';

interface SlashCommandMenuProps {
  open: boolean;
  query: string;
  loading: boolean;
  templates: MedicalTemplate[];
  onSelect: (template: MedicalTemplate) => void;
  onClose: () => void;
}

export function SlashCommandMenu({
  open,
  query,
  loading,
  templates,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="absolute left-3 right-3 top-14 z-20 rounded-md border border-border bg-popover p-2 shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {query
            ? t('medicalSharing.doctor.consultation.editor.slash.headingWithQuery', { query })
            : t('medicalSharing.doctor.consultation.editor.slash.heading')}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">{t('medicalSharing.doctor.consultation.editor.slash.close')}</span>
        </Button>
      </div>

      <div className="max-h-52 space-y-1 overflow-y-auto">
        {loading ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {t('medicalSharing.doctor.consultation.editor.slash.loading')}
          </p>
        ) : null}

        {!loading && templates.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {t('medicalSharing.doctor.consultation.editor.slash.empty')}
          </p>
        ) : null}

        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={() => onSelect(template)}
          >
            <p className="font-medium leading-tight">{template.title}</p>
            {template.description ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
