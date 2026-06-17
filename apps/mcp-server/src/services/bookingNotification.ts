/**
 * Booking confirmation handler (MCP / agent side)
 *
 * Closes the agent-parity loop opened by Phase C: when the AI agent books an
 * appointment, core's BookingService publishes `appointment.booked` on the
 * request's container event bus. This handler — subscribed per container —
 * resolves the patient's contact via core PatientService (RLS-scoped to the
 * caller's JWT) and delivers a confirmation through the container's INotifier.
 *
 * Recipient resolution lives in core (PatientService.getPatientProfile returns
 * phone/email/preferred language), so the agent needs no web-only ChannelRouter.
 *
 * Fire-and-forget: a notification never blocks or fails the booking tool.
 */
import {
  APPOINTMENT_BOOKED_EVENT,
  selectNotifyRoute,
  type DomainEvent,
  type ServiceContainer,
} from "@queuemed/core";
import { logger } from "../utils/logger.js";

/** Subscribe the confirmation handler to a container's event bus. */
export function subscribeBookingConfirmation(container: ServiceContainer): void {
  container.eventBus.subscribe(APPOINTMENT_BOOKED_EVENT, (event) => {
    // Fire-and-forget so booking latency never includes delivery.
    void handleAppointmentBooked(container, event);
  });
}

/** Exported for testing; resolves the recipient and delivers. Never throws. */
export async function handleAppointmentBooked(
  container: ServiceContainer,
  event: DomainEvent,
): Promise<void> {
  const patientId = event.payload.patientId as string | undefined;
  const appointmentId = event.payload.appointmentId as string | undefined;

  if (!patientId) {
    logger.warn("appointment.booked missing patientId; cannot send confirmation", {
      eventId: event.eventId,
    });
    return;
  }

  try {
    const profile = await container.patient.getPatientProfile(patientId);
    const route = selectNotifyRoute({
      phoneNumber: profile.phoneNumber,
      email: profile.email,
      preferredLanguage: profile.preferredLanguage,
      notificationPreferences: profile.notificationPreferences,
    });
    if (!route) {
      logger.warn("Skipping booking confirmation: patient has no reachable channel", { patientId });
      return;
    }

    await container.notifier.notify({
      clinicId: (event.clinicId as string) ?? "",
      patientId,
      appointmentId,
      channel: route.channel,
      type: "appointment_confirmed",
      phoneNumber: route.phoneNumber,
      email: route.email,
      language: route.preferredLanguage,
      variables: {
        appointmentDate: (event.payload.appointmentDate as string) ?? "",
        scheduledTime: (event.payload.scheduledTime as string) ?? "",
        appointmentType: (event.payload.appointmentType as string) ?? "",
      },
    });

    logger.info("Booking confirmation dispatched (agent)", { patientId, appointmentId, channel: route.channel });
  } catch (error) {
    logger.error("Failed to dispatch booking confirmation", {
      patientId,
      appointmentId,
      error: (error as Error).message,
    });
  }
}
