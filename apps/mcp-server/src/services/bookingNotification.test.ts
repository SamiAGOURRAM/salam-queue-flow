/**
 * bookingNotification handler tests (agent-side confirmation)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DomainEvent, ServiceContainer } from "@queuemed/core";
import { handleAppointmentBooked } from "./bookingNotification.js";

function bookedEvent(): DomainEvent {
  return {
    eventId: "evt-1",
    eventType: "appointment.booked",
    timestamp: new Date(),
    clinicId: "clinic-1",
    userId: "patient-1",
    payload: {
      appointmentId: "apt-1",
      patientId: "patient-1",
      appointmentDate: "2026-06-20",
      scheduledTime: "10:30",
      appointmentType: "consultation",
    },
  };
}

function makeContainer(profile: unknown, opts: { profileThrows?: boolean } = {}) {
  const notify = vi.fn().mockResolvedValue({ id: "n1", status: "sent" });
  const getPatientProfile = opts.profileThrows
    ? vi.fn().mockRejectedValue(new Error("not found"))
    : vi.fn().mockResolvedValue(profile);
  const container = {
    patient: { getPatientProfile },
    notifier: { notify },
  } as unknown as ServiceContainer;
  return { container, notify, getPatientProfile };
}

describe("handleAppointmentBooked (MCP)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves SMS when the patient has a phone and delivers via the notifier", async () => {
    const { container, notify, getPatientProfile } = makeContainer({
      id: "patient-1",
      fullName: "Test",
      phoneNumber: "+212600000000",
      preferredLanguage: "ar",
    });

    await handleAppointmentBooked(container, bookedEvent());

    expect(getPatientProfile).toHaveBeenCalledWith("patient-1");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      patientId: "patient-1",
      appointmentId: "apt-1",
      channel: "sms",
      type: "appointment_confirmed",
      phoneNumber: "+212600000000",
    });
  });

  it("falls back to email when there is no phone", async () => {
    const { container, notify } = makeContainer({
      id: "patient-1",
      fullName: "Test",
      email: "p@example.com",
    });

    await handleAppointmentBooked(container, bookedEvent());

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ channel: "email", email: "p@example.com" });
  });

  it("skips delivery when the patient has no reachable channel", async () => {
    const { container, notify } = makeContainer({ id: "patient-1", fullName: "Test" });

    await handleAppointmentBooked(container, bookedEvent());

    expect(notify).not.toHaveBeenCalled();
  });

  it("never throws when profile resolution fails", async () => {
    const { container, notify } = makeContainer(null, { profileThrows: true });

    await expect(handleAppointmentBooked(container, bookedEvent())).resolves.toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips when the event has no patientId", async () => {
    const { container, notify, getPatientProfile } = makeContainer({ id: "x", fullName: "x" });
    const event = bookedEvent();
    delete (event.payload as Record<string, unknown>).patientId;

    await handleAppointmentBooked(container, event);

    expect(getPatientProfile).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
