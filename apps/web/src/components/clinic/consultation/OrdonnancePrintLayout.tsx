import { forwardRef } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type {
  ClinicPrintInfo,
  ConsultationPrescriptionInput,
  DoctorPrintInfo,
} from '@/services/medical-records';

interface OrdonnancePrintLayoutProps {
  clinic: ClinicPrintInfo;
  doctor: DoctorPrintInfo;
  patientName: string;
  issuedAt: Date;
  prescriptions: ConsultationPrescriptionInput[];
}

export const OrdonnancePrintLayout = forwardRef<HTMLDivElement, OrdonnancePrintLayoutProps>(
  ({ clinic, doctor, patientName, issuedAt, prescriptions }, ref) => {
    const { t } = useTranslation();
    const printableRows = prescriptions.filter((item) => item.medicationName.trim());

    return (
      <div
        ref={ref}
        style={{
          width: '148mm',
          minHeight: '210mm',
          padding: '14mm',
          color: '#111827',
          background: '#ffffff',
          fontFamily: 'Georgia, Times New Roman, serif',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12mm' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', letterSpacing: '0.4px' }}>{clinic.name}</h1>
            {clinic.specialty && <p style={{ margin: '2px 0 0', fontSize: '12px' }}>{clinic.specialty}</p>}
            <p style={{ margin: '2px 0 0', fontSize: '11px' }}>
              {[clinic.address, clinic.city].filter(Boolean).join(', ')}
            </p>
            {clinic.phone && (
              <p style={{ margin: '2px 0 0', fontSize: '11px' }}>
                {t('medicalSharing.doctor.consultation.print.clinicPhoneLabel')}: {clinic.phone}
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>{doctor.fullName}</p>
            {doctor.specialization && <p style={{ margin: '2px 0 0', fontSize: '11px' }}>{doctor.specialization}</p>}
            {doctor.licenseNumber && (
              <p style={{ margin: '2px 0 0', fontSize: '11px' }}>
                {t('medicalSharing.doctor.consultation.print.doctorLicenseLabel')}: {doctor.licenseNumber}
              </p>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #d1d5db', borderBottom: '1px solid #d1d5db', padding: '8px 0', marginBottom: '8mm' }}>
          <h2 style={{ margin: 0, textAlign: 'center', fontSize: '17px', letterSpacing: '1px' }}>
            {t('medicalSharing.doctor.consultation.print.title')}
          </h2>
        </div>

        <div style={{ marginBottom: '8mm', fontSize: '12px' }}>
          <p style={{ margin: '0 0 2px' }}>
            <strong>{t('medicalSharing.doctor.consultation.print.patientLabel')}:</strong>{' '}
            {patientName || t('medicalSharing.doctor.consultation.print.patientFallback')}
          </p>
          <p style={{ margin: 0 }}>
            <strong>{t('medicalSharing.doctor.consultation.print.dateLabel')}:</strong> {format(issuedAt, 'dd/MM/yyyy')}
          </p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #9ca3af', padding: '4px 2px' }}>
                {t('medicalSharing.doctor.consultation.print.headers.medication')}
              </th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #9ca3af', padding: '4px 2px' }}>
                {t('medicalSharing.doctor.consultation.print.headers.dosage')}
              </th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #9ca3af', padding: '4px 2px' }}>
                {t('medicalSharing.doctor.consultation.print.headers.frequency')}
              </th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #9ca3af', padding: '4px 2px' }}>
                {t('medicalSharing.doctor.consultation.print.headers.duration')}
              </th>
            </tr>
          </thead>
          <tbody>
            {printableRows.map((item, index) => (
              <tr key={item.id ?? `${item.medicationName}-${index}`}>
                <td style={{ borderBottom: '1px solid #e5e7eb', padding: '6px 2px' }}>{item.medicationName}</td>
                <td style={{ borderBottom: '1px solid #e5e7eb', padding: '6px 2px' }}>
                  {[item.dosage, item.route].filter(Boolean).join(' - ') || '-'}
                </td>
                <td style={{ borderBottom: '1px solid #e5e7eb', padding: '6px 2px' }}>{item.frequency || '-'}</td>
                <td style={{ borderBottom: '1px solid #e5e7eb', padding: '6px 2px' }}>
                  {item.durationDays ? `${item.durationDays} ${t('medicalSharing.doctor.consultation.print.durationDaysSuffix')}` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '16mm', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'center', width: '60mm' }}>
            <p style={{ margin: 0, fontSize: '11px' }}>{t('medicalSharing.doctor.consultation.print.signatureLabel')}</p>
            <div style={{ borderBottom: '1px solid #9ca3af', marginTop: '20mm' }} />
          </div>
        </div>
      </div>
    );
  }
);

OrdonnancePrintLayout.displayName = 'OrdonnancePrintLayout';
