import { logger } from '@/services/shared/logging/Logger';
import type {
  AccessLogEntry,
  ActiveShare,
  AccessRequestResult,
  ActiveGrantCheck,
  OtpValidationResult,
  SharedAppointmentDetail,
  SharedAppointmentSummary,
} from './models/MedicalRecordModels';
import { MedicalRecordSharingRepository } from './repositories/MedicalRecordSharingRepository';

export class MedicalRecordSharingService {
  private repository: MedicalRecordSharingRepository;

  constructor(repository?: MedicalRecordSharingRepository) {
    this.repository = repository || new MedicalRecordSharingRepository();
  }

  async requestAccess(
    patientId: string,
    appointmentId: string,
    clinicId: string,
    ownerOverrideReason?: string
  ): Promise<AccessRequestResult> {
    const request = await this.repository.requestAccess(patientId, appointmentId, clinicId, ownerOverrideReason);

    try {
      const delivery = await this.repository.deliverOtp(request.grantId);
      return {
        ...request,
        deliveryStatus: delivery.success ? 'sent' : 'failed',
      };
    } catch (error) {
      // Keep grant pending even when delivery fails to allow app approval or retry.
      logger.warn('OTP delivery failed after grant request', {
        grantId: request.grantId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return {
        ...request,
        deliveryStatus: 'failed',
      };
    }
  }

  async resendOtp(grantId: string): Promise<{ sent: boolean; retryAfterSeconds?: number }> {
    const resend = await this.repository.resendOtp(grantId);
    if (!resend.readyForDelivery) {
      return { sent: false, retryAfterSeconds: resend.retryAfterSeconds };
    }

    const delivery = await this.repository.deliverOtp(grantId);
    return {
      sent: delivery.success,
    };
  }

  async validateOtp(grantId: string, code: string, durationSeconds: number): Promise<OtpValidationResult> {
    return this.repository.validateOtp(grantId, code, durationSeconds);
  }

  async checkActiveAccess(patientId: string): Promise<ActiveGrantCheck> {
    return this.repository.checkActiveAccess(patientId);
  }

  async getSharedHistory(grantId: string): Promise<SharedAppointmentSummary[]> {
    return this.repository.getSharedHistory(grantId);
  }

  async getSharedDetail(grantId: string, appointmentId: string): Promise<SharedAppointmentDetail> {
    return this.repository.getSharedDetail(grantId, appointmentId);
  }

  async getMyActiveShares(): Promise<ActiveShare[]> {
    return this.repository.getMyActiveShares();
  }

  async approveAccess(grantId: string, durationSeconds: number): Promise<void> {
    return this.repository.approveAccess(grantId, durationSeconds);
  }

  async revokeAccess(grantId: string): Promise<void> {
    return this.repository.revokeAccess(grantId);
  }

  async revokeAll(): Promise<number> {
    return this.repository.revokeAllAccess();
  }

  async getAuditLog(limit: number, offset: number): Promise<AccessLogEntry[]> {
    return this.repository.getMyAccessAuditLog(limit, offset);
  }
}

export const medicalRecordSharingService = new MedicalRecordSharingService();
