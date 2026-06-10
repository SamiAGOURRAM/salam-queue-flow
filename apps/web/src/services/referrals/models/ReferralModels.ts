export type ReferralStatus = 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled';

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: 'referral.status.pending',
  accepted: 'referral.status.accepted',
  declined: 'referral.status.declined',
  completed: 'referral.status.completed',
  cancelled: 'referral.status.cancelled',
};

export interface Referral {
  id: string;
  patientId: string;
  clinicId: string;
  sourceStaffId: string;
  sourceDoctorName: string;
  targetDoctorName: string;
  targetSpecialty: string | null;
  targetClinicId: string | null;
  targetClinicName: string | null;
  reason: string;
  notes: string | null;
  status: ReferralStatus;
  linkedAppointmentId: string | null;
  responseNotes: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReferralInput {
  patientId: string;
  clinicId: string;
  sourceStaffId: string;
  targetDoctorName: string;
  reason: string;
  targetSpecialty?: string;
  targetClinicId?: string;
  targetClinicName?: string;
  notes?: string;
  linkedAppointmentId?: string;
}

export interface ReferralResponseInput {
  referralId: string;
  newStatus: Extract<ReferralStatus, 'accepted' | 'declined'>;
  responseNotes?: string;
}

export interface ReferralAnalytics {
  totalReferrals: number;
  pendingReferrals: number;
  acceptedReferrals: number;
  declinedReferrals: number;
  completedReferrals: number;
  cancelledReferrals: number;
  conversionRate: number;
}
