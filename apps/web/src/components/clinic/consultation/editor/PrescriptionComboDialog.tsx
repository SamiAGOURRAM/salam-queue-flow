import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import type { MedicalTemplate } from '@/services/medical-records';

interface PrescriptionComboDialogProps {
  open: boolean;
  loading: boolean;
  error?: string | null;
  query: string;
  templates: MedicalTemplate[];
  onOpenChange: (open: boolean) => void;
  onQueryChange: (value: string) => void;
  onSelect: (template: MedicalTemplate) => void;
}

export function PrescriptionComboDialog({
  open,
  loading,
  error,
  query,
  templates,
  onOpenChange,
  onQueryChange,
  onSelect,
}: PrescriptionComboDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-lg">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{t('medicalSharing.doctor.consultation.editor.combo.title')}</DialogTitle>
          <DialogDescription>{t('medicalSharing.doctor.consultation.editor.combo.description')}</DialogDescription>
        </DialogHeader>

        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={onQueryChange}
            placeholder={t('medicalSharing.doctor.consultation.editor.combo.searchPlaceholder')}
          />
          <CommandList className="max-h-[320px]">
            {error ? <p className="px-3 py-2 text-sm text-destructive">{error}</p> : null}
            {loading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {t('medicalSharing.doctor.consultation.editor.combo.loading')}
              </p>
            ) : null}
            {!loading ? <CommandEmpty>{t('medicalSharing.doctor.consultation.editor.combo.empty')}</CommandEmpty> : null}
            <CommandGroup heading={t('medicalSharing.doctor.consultation.editor.combo.groupHeading')}>
              {templates.map((template) => (
                <CommandItem
                  key={template.id}
                  value={template.id}
                  onSelect={() => {
                    onSelect(template);
                    onOpenChange(false);
                  }}
                  className="flex flex-col items-start py-2"
                >
                  <span className="font-medium">{template.title}</span>
                  {template.description ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">{template.description}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
