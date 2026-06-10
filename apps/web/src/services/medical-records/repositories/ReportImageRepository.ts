import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { DatabaseError } from '@/services/shared/errors';
import type { MedicalReportImage } from '../models/MedicalRecordModels';

type ReportImageRow = Database['public']['Tables']['medical_report_images']['Row'];
type ReportImageInsert = Database['public']['Tables']['medical_report_images']['Insert'];

function asDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function mapImage(row: ReportImageRow): MedicalReportImage {
  return {
    id: row.id,
    reportId: row.report_id,
    uploadedBy: row.uploaded_by,
    clinicId: row.clinic_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    createdAt: asDate(row.created_at) ?? new Date(0),
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

export class ReportImageRepository {
  private readonly bucketName = 'medical-report-images';

  async uploadImage(input: {
    reportId: string;
    clinicId: string;
    uploadedBy: string;
    file: File;
  }): Promise<MedicalReportImage> {
    const fileName = sanitizeFileName(input.file.name || 'report-image');
    const storagePath = `${input.clinicId}/${input.reportId}/${Date.now()}-${fileName}`;

    const { error: uploadError } = await supabase.storage.from(this.bucketName).upload(storagePath, input.file, {
      contentType: input.file.type,
      upsert: false,
    });

    if (uploadError) {
      throw new DatabaseError('Failed to upload report image', uploadError as unknown as Error, {
        reportId: input.reportId,
        storagePath,
      });
    }

    const payload: ReportImageInsert = {
      report_id: input.reportId,
      uploaded_by: input.uploadedBy,
      clinic_id: input.clinicId,
      storage_path: storagePath,
      file_name: input.file.name,
      file_size: input.file.size,
      mime_type: input.file.type,
    };

    const { data, error } = await supabase.from('medical_report_images').insert(payload).select('*').single();

    if (error) {
      await supabase.storage.from(this.bucketName).remove([storagePath]);
      throw new DatabaseError('Failed to persist report image metadata', error as unknown as Error, {
        reportId: input.reportId,
        storagePath,
      });
    }

    const image = mapImage(data as ReportImageRow);
    const signedUrl = await this.createSignedUrl(storagePath);
    return {
      ...image,
      signedUrl,
    };
  }

  async createSignedUrl(storagePath: string, expiresInSeconds: number = 3600): Promise<string | undefined> {
    const { data, error } = await supabase.storage.from(this.bucketName).createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      console.warn('Failed to create signed URL for report image', {
        storagePath,
        expiresInSeconds,
        error,
      });
      return undefined;
    }

    return data.signedUrl;
  }

  async listByReport(reportId: string): Promise<MedicalReportImage[]> {
    const { data, error } = await supabase
      .from('medical_report_images')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new DatabaseError('Failed to list report images', error as unknown as Error, { reportId });
    }

    const rows = (data as ReportImageRow[]) ?? [];
    const signedRows = await Promise.all(
      rows.map(async (row) => ({
        ...mapImage(row),
        signedUrl: await this.createSignedUrl(row.storage_path),
      }))
    );

    return signedRows;
  }
}
