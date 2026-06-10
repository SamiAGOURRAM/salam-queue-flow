import { referralRepository } from './repositories/ReferralRepository';
import type {
  CreateReferralInput,
  Referral,
  ReferralAnalytics,
  ReferralResponseInput,
} from './models/ReferralModels';

export class ReferralService {
  async createReferral(input: CreateReferralInput): Promise<string> {
    return referralRepository.create(input);
  }

  async respondToReferral(input: ReferralResponseInput): Promise<boolean> {
    return referralRepository.respond(input);
  }

  async cancelReferral(referralId: string): Promise<boolean> {
    return referralRepository.cancel(referralId);
  }

  async getPatientReferrals(patientId: string, clinicId: string): Promise<Referral[]> {
    return referralRepository.getByPatient(patientId, clinicId);
  }

  computeAnalytics(referrals: Referral[]): ReferralAnalytics {
    const total = referrals.length;
    const pending = referrals.filter((r) => r.status === 'pending').length;
    const accepted = referrals.filter((r) => r.status === 'accepted').length;
    const declined = referrals.filter((r) => r.status === 'declined').length;
    const completed = referrals.filter((r) => r.status === 'completed').length;
    const cancelled = referrals.filter((r) => r.status === 'cancelled').length;
    const responded = accepted + declined;
    const conversionRate = responded > 0 ? Math.round((accepted / responded) * 100) / 100 : 0;

    return {
      totalReferrals: total,
      pendingReferrals: pending,
      acceptedReferrals: accepted,
      declinedReferrals: declined,
      completedReferrals: completed,
      cancelledReferrals: cancelled,
      conversionRate,
    };
  }
}

export const referralService = new ReferralService();
