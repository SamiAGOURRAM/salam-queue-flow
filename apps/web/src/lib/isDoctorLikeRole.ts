/**
 * Whether a clinic_staff row should surface as a bookable "doctor" in patient discovery.
 *
 * ROLE-BASED only: the role must say "doctor" or be a known clinical role. A free-text
 * `specialization` is NOT sufficient (a receptionist with a specialization must not be
 * bookable). Kept in parity with @queuemed/core's ClinicRepository so the web search
 * and the AI agent's doctor_search return the same providers.
 */
export function isDoctorLikeRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase();
  if (normalized.includes('doctor')) return true;
  const clinicalRoles = new Set([
    'surgeon', 'dentist', 'radiologist', 'anesthesiologist', 'physiotherapist',
    'cardiologist', 'neurologist', 'pediatrician', 'orthopedist', 'dermatologist',
  ]);
  return clinicalRoles.has(normalized);
}
