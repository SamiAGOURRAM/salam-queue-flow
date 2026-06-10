import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RequestMedicalHistoryDialog } from '@/components/clinic/RequestMedicalHistoryDialog';
import { SharedRecordsPanel } from '@/components/clinic/SharedRecordsPanel';
import {
  medicalRecordSharingService,
  type AccessRequestResult,
  type ActiveGrantCheck,
  type GrantScope,
  type OtpValidationResult,
  type SharedAppointmentDetail,
  type SharedAppointmentSummary,
} from '@/services/medical-records';

const MOCK_OTP = '123456';
const MOCK_PATIENT_ID = '00000000-0000-0000-0000-00000000e2e3';
const MOCK_APPOINTMENT_ID = '00000000-0000-0000-0000-00000000e2e2';
const MOCK_CLINIC_ID = '00000000-0000-0000-0000-00000000e2e4';

const MOCK_HISTORY: SharedAppointmentSummary[] = [
  {
    appointmentId: MOCK_APPOINTMENT_ID,
    date: '2026-04-05',
    clinicName: 'Salam Queue Clinic',
    doctorName: 'Dr. Florence Baron',
    appointmentType: 'Follow-up',
    status: 'completed',
    hasDiagnoses: true,
    hasNotes: true,
    hasPrescriptions: true,
    hasLabResults: true,
    hasProcedureReports: true,
  },
];

const MOCK_DETAIL: SharedAppointmentDetail = {
  ...MOCK_HISTORY[0],
  reasonForVisit: 'Follow-up for chronic headaches.',
  notes: 'Patient reports improvement and no alarming symptoms.',
  durationMinutes: 20,
  diagnoses: [
    {
      id: '00000000-0000-0000-0000-00000000d101',
      diagnosisCode: 'R51',
      diagnosisLabel: 'Headache',
      diagnosisNotes: 'Likely stress-related.',
    },
  ],
  prescriptions: [
    {
      id: '00000000-0000-0000-0000-00000000p101',
      medicationName: 'Paracetamol 500mg',
      dosage: '500mg',
      route: 'oral',
      frequency: 'BID',
      durationDays: 3,
      instructions: 'After meals',
    },
  ],
  labResults: [
    {
      id: '00000000-0000-0000-0000-00000000l101',
      testName: 'CRP',
      resultValue: '5',
      unit: 'mg/L',
      referenceRange: '0-10',
      interpretation: 'Normal',
    },
  ],
  procedureReports: [
    {
      id: '00000000-0000-0000-0000-00000000r101',
      title: 'Procedure report baseline',
      status: 'finalized',
      finalizedAt: new Date('2026-04-05T09:30:00.000Z'),
      createdAt: new Date('2026-04-05T09:00:00.000Z'),
      contentPlainText: 'Procedure completed successfully without complications.',
      images: [
        {
          id: '00000000-0000-0000-0000-00000000img1',
          storagePath: `${MOCK_CLINIC_ID}/00000000-0000-0000-0000-00000000r101/post-procedure.jpg`,
          fileName: 'post-procedure.jpg',
          fileSize: 120430,
          mimeType: 'image/jpeg',
          createdAt: new Date('2026-04-05T09:05:00.000Z'),
          signedUrl: 'https://example.local/post-procedure.jpg',
        },
      ],
    },
  ],
};

const delay = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, ms);
});

export default function MedicalSharingE2EHarness() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [grantId, setGrantId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [requestedScopeType, setRequestedScopeType] = useState<string>('not-requested');

  useEffect(() => {
    let attemptsRemaining = 3;

    const original = {
      requestAccess: medicalRecordSharingService.requestAccess.bind(medicalRecordSharingService),
      checkActiveAccess: medicalRecordSharingService.checkActiveAccess.bind(medicalRecordSharingService),
      resendOtp: medicalRecordSharingService.resendOtp.bind(medicalRecordSharingService),
      validateOtp: medicalRecordSharingService.validateOtp.bind(medicalRecordSharingService),
      getSharedHistory: medicalRecordSharingService.getSharedHistory.bind(medicalRecordSharingService),
      getSharedDetail: medicalRecordSharingService.getSharedDetail.bind(medicalRecordSharingService),
    };

    medicalRecordSharingService.requestAccess = async (
      _patientId: string,
      _appointmentId: string,
      _clinicId: string,
      _ownerOverrideReason?: string,
      scope?: GrantScope
    ): Promise<AccessRequestResult> => {
      await delay(60);

      setRequestedScopeType(scope?.type ?? 'specific_appointments');

      return {
        grantId: '00000000-0000-0000-0000-00000000e2e1',
        deliveryChannel: 'sms',
        patientHasApp: false,
        deliveryStatus: 'sent',
        otpTtlSeconds: 300,
      };
    };

    medicalRecordSharingService.checkActiveAccess = async (): Promise<ActiveGrantCheck> => {
      await delay(20);
      return { hasAccess: false };
    };

    medicalRecordSharingService.resendOtp = async () => {
      await delay(40);
      return { sent: true };
    };

    medicalRecordSharingService.validateOtp = async (
      nextGrantId: string,
      code: string,
      durationSeconds: number
    ): Promise<OtpValidationResult> => {
      await delay(60);

      if (code.trim() !== MOCK_OTP) {
        attemptsRemaining = Math.max(attemptsRemaining - 1, 0);
        return {
          success: false,
          error: 'invalid_code',
          attemptsRemaining,
        };
      }

      return {
        success: true,
        grantId: nextGrantId,
        expiresAt: new Date(Date.now() + durationSeconds * 1000),
      };
    };

    medicalRecordSharingService.getSharedHistory = async (): Promise<SharedAppointmentSummary[]> => {
      await delay(80);
      return MOCK_HISTORY;
    };

    medicalRecordSharingService.getSharedDetail = async (
      _nextGrantId: string,
      appointmentId: string
    ): Promise<SharedAppointmentDetail> => {
      await delay(80);
      if (appointmentId !== MOCK_APPOINTMENT_ID) {
        throw new Error('Appointment detail not found');
      }
      return MOCK_DETAIL;
    };

    return () => {
      medicalRecordSharingService.requestAccess = original.requestAccess;
      medicalRecordSharingService.checkActiveAccess = original.checkActiveAccess;
      medicalRecordSharingService.resendOtp = original.resendOtp;
      medicalRecordSharingService.validateOtp = original.validateOtp;
      medicalRecordSharingService.getSharedHistory = original.getSharedHistory;
      medicalRecordSharingService.getSharedDetail = original.getSharedDetail;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6" data-testid="medical-sharing-e2e-harness">
      <h1 className="text-2xl font-semibold">Medical Sharing E2E Harness</h1>
      <p className="text-sm text-muted-foreground">
        This page mocks OTP and shared records responses so browser E2E can validate the full dialog flow quickly.
      </p>

      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
        <p className="font-medium">Mock patient: Mock Patient</p>
        <p>
          OTP for this harness: <span className="font-mono" data-testid="mock-otp-code">{MOCK_OTP}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button data-testid="open-request-dialog-btn" onClick={() => setDialogOpen(true)}>
          Open Request Medical History Dialog
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setGrantId(null);
            setExpiresAt(null);
            setDialogOpen(false);
            setRequestedScopeType('not-requested');
          }}
        >
          Reset Harness State
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
        <p>
          Last requested scope:{' '}
          <span className="font-mono" data-testid="mock-requested-scope-type">
            {requestedScopeType}
          </span>
        </p>
      </div>

      <RequestMedicalHistoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clinicId={MOCK_CLINIC_ID}
        patientId={MOCK_PATIENT_ID}
        appointmentId={MOCK_APPOINTMENT_ID}
        patientName="Mock Patient"
        onAccessActivated={(nextGrantId, nextExpiresAt) => {
          setGrantId(nextGrantId);
          setExpiresAt(nextExpiresAt ?? new Date(Date.now() + 60 * 60 * 1000));
        }}
      />

      {grantId && (
        <SharedRecordsPanel
          grantId={grantId}
          patientName="Mock Patient"
          expiresAt={expiresAt}
          onClose={() => setGrantId(null)}
          onExpired={() => setGrantId(null)}
        />
      )}
    </div>
  );
}
