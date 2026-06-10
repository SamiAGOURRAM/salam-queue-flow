import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SlottedQueueView } from "./SlottedQueueView";
import { AppointmentStatus, AppointmentType, type QueueEntry } from "@/services/queue";

function buildQueueEntry(overrides: Partial<QueueEntry>): QueueEntry {
  const now = new Date("2026-04-09T10:00:00");

  return {
    id: "appointment-1",
    clinicId: "clinic-1",
    patientId: "patient-1",
    staffId: "staff-1",
    appointmentDate: new Date("2026-04-09T00:00:00"),
    scheduledTime: "09:15",
    queuePosition: 1,
    status: AppointmentStatus.SCHEDULED,
    appointmentType: AppointmentType.CONSULTATION,
    isPresent: true,
    skipCount: 0,
    createdAt: now,
    updatedAt: now,
    patient: {
      id: "patient-1",
      fullName: "Patient One",
    },
    ...overrides,
  };
}

describe("SlottedQueueView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders scheduled entries without local-today re-filtering", () => {
    const schedule = [
      buildQueueEntry({
        // Simulate a date object that may not match the local 'today' after timezone conversions.
        appointmentDate: new Date("2026-04-08T00:00:00"),
        scheduledTime: "09:15:00+00",
      }),
    ];

    render(
      <SlottedQueueView
        schedule={schedule}
        currentPatient={null}
      />
    );

    expect(screen.getByText("Patient One")).toBeInTheDocument();
    expect(screen.queryByText("No appointments scheduled")).not.toBeInTheDocument();
  });

  it("opens appointment details callback when patient entry is clicked", () => {
    const onOpenAppointment = vi.fn();

    render(
      <SlottedQueueView
        schedule={[buildQueueEntry({ id: "appointment-open" })]}
        currentPatient={null}
        onOpenAppointment={onOpenAppointment}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Patient One/i }));

    expect(onOpenAppointment).toHaveBeenCalledWith("appointment-open");
  });
});
