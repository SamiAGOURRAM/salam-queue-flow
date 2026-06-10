import { compressMedicalImage } from '@/lib/editor/image-upload';
import type {
  MedicalProcedureReport,
  MedicalProcedureReportUpsertInput,
  MedicalReportImage,
} from './models/MedicalRecordModels';
import { ProcedureReportRepository } from './repositories/ProcedureReportRepository';
import { ReportImageRepository } from './repositories/ReportImageRepository';

function withHydratedImageUrls(content: unknown, images: MedicalReportImage[]): unknown {
  const byPath = new Map(images.map((image) => [image.storagePath, image.signedUrl]));

  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => visit(item));
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(record)) {
        next[key] = visit(nested);
      }

      if (record.type === 'image' && next.attrs && typeof next.attrs === 'object') {
        const attrs = next.attrs as Record<string, unknown>;
        const storagePath = typeof attrs.storagePath === 'string' ? attrs.storagePath : undefined;
        const signedUrl = storagePath ? byPath.get(storagePath) : undefined;

        if (signedUrl) {
          next.attrs = {
            ...attrs,
            src: signedUrl,
          };
        }
      }

      return next;
    }

    return value;
  };

  return visit(content);
}

export class ProcedureReportService {
  private reportRepository: ProcedureReportRepository;
  private imageRepository: ReportImageRepository;

  constructor(reportRepository?: ProcedureReportRepository, imageRepository?: ReportImageRepository) {
    this.reportRepository = reportRepository ?? new ProcedureReportRepository();
    this.imageRepository = imageRepository ?? new ReportImageRepository();
  }

  async getLatestReportByAppointment(appointmentId: string): Promise<MedicalProcedureReport | null> {
    const report = await this.reportRepository.getLatestByAppointment(appointmentId);
    if (!report) return null;

    const images = await this.imageRepository.listByReport(report.id);
    return {
      ...report,
      content: withHydratedImageUrls(report.content, images),
    };
  }

  async saveDraft(input: MedicalProcedureReportUpsertInput): Promise<MedicalProcedureReport> {
    return this.reportRepository.upsertReport({
      ...input,
      status: 'draft',
    });
  }

  async finalize(input: MedicalProcedureReportUpsertInput): Promise<MedicalProcedureReport> {
    if (!input.id) {
      const created = await this.reportRepository.upsertReport({
        ...input,
        status: 'finalized',
      });
      return created;
    }

    await this.reportRepository.upsertReport({
      ...input,
      status: 'finalized',
    });

    return this.reportRepository.finalizeReport(input.id);
  }

  async uploadImage(input: {
    reportId: string;
    clinicId: string;
    uploadedBy: string;
    file: File;
  }): Promise<MedicalReportImage> {
    const compressedFile = await compressMedicalImage(input.file);

    return this.imageRepository.uploadImage({
      ...input,
      file: compressedFile,
    });
  }
}

export const procedureReportService = new ProcedureReportService();
