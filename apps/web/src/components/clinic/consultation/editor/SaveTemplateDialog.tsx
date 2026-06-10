import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { MedicalTemplateScope } from '@/services/medical-records';

interface SaveTemplateDialogProps {
  open: boolean;
  loading?: boolean;
  canSaveClinicTemplate: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    title: string;
    description?: string;
    tags: string[];
    scope: Exclude<MedicalTemplateScope, 'system'>;
  }) => Promise<void>;
}

export function SaveTemplateDialog({
  open,
  loading,
  canSaveClinicTemplate,
  onOpenChange,
  onSubmit,
}: SaveTemplateDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [scope, setScope] = useState<Exclude<MedicalTemplateScope, 'system'>>(
    canSaveClinicTemplate ? 'clinic' : 'personal'
  );

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setTags('');
      setScope(canSaveClinicTemplate ? 'clinic' : 'personal');
    }
  }, [canSaveClinicTemplate, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('medicalSharing.doctor.consultation.editor.saveTemplate.title')}</DialogTitle>
          <DialogDescription>{t('medicalSharing.doctor.consultation.editor.saveTemplate.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="template-title">{t('medicalSharing.doctor.consultation.editor.saveTemplate.titleLabel')}</Label>
            <Input
              id="template-title"
              placeholder={t('medicalSharing.doctor.consultation.editor.saveTemplate.titlePlaceholder')}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-description">{t('medicalSharing.doctor.consultation.editor.saveTemplate.descriptionLabel')}</Label>
            <Textarea
              id="template-description"
              rows={3}
              placeholder={t('medicalSharing.doctor.consultation.editor.saveTemplate.descriptionPlaceholder')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-tags">{t('medicalSharing.doctor.consultation.editor.saveTemplate.tagsLabel')}</Label>
            <Input
              id="template-tags"
              placeholder={t('medicalSharing.doctor.consultation.editor.saveTemplate.tagsPlaceholder')}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-scope">{t('medicalSharing.doctor.consultation.editor.saveTemplate.visibilityLabel')}</Label>
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as Exclude<MedicalTemplateScope, 'system'>)}
            >
              <SelectTrigger id="template-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {canSaveClinicTemplate ? (
                  <SelectItem value="clinic">
                    {t('medicalSharing.doctor.consultation.editor.saveTemplate.scopeClinic')}
                  </SelectItem>
                ) : null}
                <SelectItem value="personal">
                  {t('medicalSharing.doctor.consultation.editor.saveTemplate.scopePersonal')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('medicalSharing.doctor.consultation.editor.saveTemplate.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() =>
              void onSubmit({
                title,
                description,
                tags: tags
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
                scope,
              })
            }
            disabled={loading || !title.trim()}
          >
            {loading
              ? t('medicalSharing.doctor.consultation.editor.saveTemplate.saving')
              : t('medicalSharing.doctor.consultation.editor.saveTemplate.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
