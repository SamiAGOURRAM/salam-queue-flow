export interface BookingSlot {
    time: string;
    available: boolean;
  }
  
  export interface AvailableSlotsResponse {
    available: boolean;
    reason?: string;
    slots: BookingSlot[];
    duration?: number;
    bufferTime?: number;
    mode?: 'fluid' | 'fixed' | 'hybrid' | null;  // ← Clean Standard: Queue mode indicator
  }
  
  export interface BookingRequest {
    clinicId: string;
    patientId: string;
    appointmentDate: string;
    scheduledTime: string | null;         // ← UPDATED: Can be null for free queue
    appointmentType: string;
    reasonForVisit?: string;
  }
  
  export interface BookingResponse {
    success: boolean;
    appointmentId?: string;
    queuePosition?: number;
    staffId?: string;
    error?: string;
  }
  
  export interface AppointmentAvailability {
    available: boolean;
    existingCount: number;
    capacity: number;
  }

  /**
 * Queue mode type definition (Clean Standard)
 */
export type QueueMode = 'fluid' | 'fixed' | 'hybrid' | null;

/**
 * Manual assignment response (for staff assigning time to free queue patients)
 */
export interface ManualAssignmentResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Queue mode info
 */
export interface QueueModeInfo {
  mode: QueueMode;
  date: string;
  clinicId: string;
}