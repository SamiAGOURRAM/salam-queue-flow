import { describe, expect, it } from 'vitest';
import { ReferralService } from './ReferralService';
import type { Referral } from './models/ReferralModels';

function makeReferral(overrides: Partial<Referral> = {}): Referral {
  return {
    id: 'ref-1',
    patientId: 'patient-1',
    clinicId: 'clinic-1',
    sourceStaffId: 'staff-1',
    sourceDoctorName: 'Dr. Source',
    targetDoctorName: 'Dr. Target',
    targetSpecialty: null,
    targetClinicId: null,
    targetClinicName: null,
    reason: 'Test referral',
    notes: null,
    status: 'pending',
    linkedAppointmentId: null,
    responseNotes: null,
    respondedAt: null,
    createdAt: '2026-06-03T12:00:00Z',
    updatedAt: '2026-06-03T12:00:00Z',
    ...overrides,
  };
}

describe('ReferralService', () => {
  describe('computeAnalytics', () => {
    const service = new ReferralService();

    it('returns zero analytics for empty array', () => {
      const result = service.computeAnalytics([]);
      expect(result.totalReferrals).toBe(0);
      expect(result.pendingReferrals).toBe(0);
      expect(result.acceptedReferrals).toBe(0);
      expect(result.conversionRate).toBe(0);
    });

    it('counts referrals by status', () => {
      const referrals = [
        makeReferral({ status: 'pending' }),
        makeReferral({ id: 'ref-2', status: 'accepted' }),
        makeReferral({ id: 'ref-3', status: 'declined' }),
        makeReferral({ id: 'ref-4', status: 'completed' }),
        makeReferral({ id: 'ref-5', status: 'cancelled' }),
      ];

      const result = service.computeAnalytics(referrals);
      expect(result.totalReferrals).toBe(5);
      expect(result.pendingReferrals).toBe(1);
      expect(result.acceptedReferrals).toBe(1);
      expect(result.declinedReferrals).toBe(1);
      expect(result.completedReferrals).toBe(1);
      expect(result.cancelledReferrals).toBe(1);
    });

    it('computes conversion rate', () => {
      const referrals = [
        makeReferral({ id: 'ref-1', status: 'accepted' }),
        makeReferral({ id: 'ref-2', status: 'accepted' }),
        makeReferral({ id: 'ref-3', status: 'declined' }),
      ];

      const result = service.computeAnalytics(referrals);
      expect(result.acceptedReferrals).toBe(2);
      expect(result.declinedReferrals).toBe(1);
      // 2/3 = 0.6667 -> Math.round(66.67) / 100 = 0.67
      expect(result.conversionRate).toBeCloseTo(0.67, 1);
    });

    it('returns 0 conversion rate when no responses', () => {
      const referrals = [
        makeReferral({ id: 'ref-1', status: 'pending' }),
        makeReferral({ id: 'ref-2', status: 'cancelled' }),
      ];

      const result = service.computeAnalytics(referrals);
      expect(result.conversionRate).toBe(0);
    });
  });
});
