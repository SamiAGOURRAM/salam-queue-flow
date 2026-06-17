/**
 * Queue Repository Port
 *
 * Defines the contract for queue-management data access.
 * Implementations: SupabaseQueueRepository, MySQLQueueRepository, etc.
 */

import type {
  QueueEntry,
  DailyScheduleEntry,
  CallNextPatientDTO,
  AppointmentStatus,
  QueueActionType,
} from '../../types.js';

/** Audit-trail record for a manual queue action (e.g. reorder). */
export interface QueueOverrideInput {
  clinicId: string;
  appointmentId: string;
  action: QueueActionType;
  performedBy: string;
  reason?: string;
  previousPosition?: number;
  newPosition?: number;
}

export interface IQueueRepository {
  /** Get daily schedule for a staff member. */
  getDailySchedule(staffId: string, targetDate: string): Promise<DailyScheduleEntry[]>;

  /** Get all queue entries for a clinic on a specific date. */
  getQueueEntries(clinicId: string, date: string): Promise<QueueEntry[]>;

  /** Get a single queue entry by appointment ID. */
  getQueueEntry(appointmentId: string): Promise<QueueEntry | null>;

  /** Get a patient's queue position + estimated wait. */
  getQueuePosition(
    clinicId: string,
    patientId: string,
    date: string,
  ): Promise<{ position: number; total: number; estimatedWait: number } | null>;

  /** Check in a patient. */
  checkInPatient(appointmentId: string): Promise<QueueEntry>;

  /** Call the next patient in the queue. */
  callNextPatient(dto: CallNextPatientDTO): Promise<QueueEntry>;

  /** Update an appointment's status (in-progress, completed, etc.). */
  updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): Promise<QueueEntry>;

  /** Set an appointment's queue position (manual reorder). */
  updateQueuePosition(appointmentId: string, newPosition: number): Promise<QueueEntry>;

  /** Record a manual queue action in the `queue_overrides` audit trail. */
  createQueueOverride(input: QueueOverrideInput): Promise<void>;

  /** Cancel an appointment. */
  cancelAppointment(appointmentId: string, reason?: string): Promise<void>;

  /** Get all queue entries for a patient (by patients.uuid, not auth userId). */
  getQueueEntriesByPatient(patientId: string): Promise<QueueEntry[]>;

  /** Subscribe to real-time queue updates for a clinic + date. Returns unsubscribe fn. */
  subscribeToQueueUpdates(
    clinicId: string,
    date: string,
    callback: (payload: unknown) => void,
  ): () => void;
}
