/**
 * Notification Domain Models
 */

export enum NotificationChannel {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  PUSH = 'push',
}

export enum NotificationType {
  APPOINTMENT_CONFIRMED = 'appointment_confirmed',
  POSITION_UPDATE = 'position_update',
  ALMOST_YOUR_TURN = 'almost_your_turn',
  YOUR_TURN = 'your_turn',
  APPOINTMENT_DELAYED = 'appointment_delayed',
  APPOINTMENT_CANCELLED = 'appointment_cancelled',
  PATIENT_ABSENT = 'patient_absent',
  GRACE_PERIOD_ENDING = 'grace_period_ending',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

export interface Notification {
  id: string;
  clinicId: string;
  patientId: string;
  appointmentId?: string;
  channel: NotificationChannel;
  type: NotificationType;
  phoneNumber?: string;
  email?: string;
  message: string;
  status: NotificationStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendNotificationDTO {
  clinicId: string;
  patientId: string;
  appointmentId?: string;
  channel: NotificationChannel;
  type: NotificationType;
  phoneNumber?: string;
  email?: string;
  templateVariables?: Record<string, string>;
}

export interface NotificationTemplate {
  id: string;
  clinicId?: string; // null = system template
  templateKey: string;
  language: string;
  templateText: string;
  variables: string[];
  isActive: boolean;
  isCustom: boolean;
}
