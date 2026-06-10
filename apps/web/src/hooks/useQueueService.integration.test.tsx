import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueueService } from "./useQueueService";

const ALLOWED_STAFF_IDS = ["doctor-1", "doctor-2"];

const mocks = vi.hoisted(() => ({
  getDailySchedule: vi.fn(),
  createAppointment: vi.fn(),
  callNextPatient: vi.fn(),
  callSpecificPatient: vi.fn(),
  markPatientAbsent: vi.fn(),
  markPatientReturned: vi.fn(),
  resolveAbsentAppointment: vi.fn(),
  completeAppointment: vi.fn(),
  reorderQueue: vi.fn(),
  checkInPatient: vi.fn(),
  markPatientPresent: vi.fn(),
  markPatientNotPresent: vi.fn(),
  toast: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("../services/queue/QueueService", () => ({
  QueueService: vi.fn().mockImplementation(() => ({
    getDailySchedule: mocks.getDailySchedule,
    createAppointment: mocks.createAppointment,
    callNextPatient: mocks.callNextPatient,
    callSpecificPatient: mocks.callSpecificPatient,
    markPatientAbsent: mocks.markPatientAbsent,
    markPatientReturned: mocks.markPatientReturned,
    resolveAbsentAppointment: mocks.resolveAbsentAppointment,
    completeAppointment: mocks.completeAppointment,
    reorderQueue: mocks.reorderQueue,
    checkInPatient: mocks.checkInPatient,
    markPatientPresent: mocks.markPatientPresent,
    markPatientNotPresent: mocks.markPatientNotPresent,
  })),
}));

vi.mock("../services/shared/events/EventBus", () => ({
  eventBus: {
    subscribe: mocks.subscribe,
  },
}));

vi.mock("./use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

function QueueServiceHarness({ staffId }: { staffId?: string }) {
  const queue = useQueueService({
    staffId,
    clinicId: "clinic-1",
    autoRefresh: false,
    useClinicWide: true,
    allowedStaffIds: ALLOWED_STAFF_IDS,
  });

  return (
    <div>
      <button
        onClick={() =>
          queue.callNextPatient({
            clinicId: "clinic-1",
            date: new Date("2026-01-02T09:00:00.000Z"),
            performedBy: "user-1",
          })
        }
        type="button"
      >
        Call Next
      </button>
      <button
        onClick={() =>
          queue.callSpecificPatient({
            appointmentId: "apt-2",
            clinicId: "clinic-1",
            performedBy: "user-1",
          })
        }
        type="button"
      >
        Call Specific
      </button>
      <button
        onClick={() => queue.markPatientAbsent({ appointmentId: "apt-1", performedBy: "user-1" })}
        type="button"
      >
        Mark Absent
      </button>
      <button
        onClick={() => queue.markPatientReturned("apt-1", "user-1")}
        type="button"
      >
        Mark Returned
      </button>
      <button
        onClick={() => queue.resolveAbsentAppointment("apt-1", "user-1", "rebooked")}
        type="button"
      >
        Resolve Absent
      </button>
      <button onClick={() => queue.completeAppointment("apt-1", "user-1")} type="button">
        Complete
      </button>
      <button
        onClick={() =>
          queue.reorderQueue({
            appointmentId: "apt-1",
            newPosition: 2,
            performedBy: "user-1",
            reason: "manual",
          })
        }
        type="button"
      >
        Reorder
      </button>
      <button onClick={() => queue.checkInPatient("apt-1")} type="button">
        Check In
      </button>
      <button onClick={() => queue.markPatientPresent("apt-1", "user-1")} type="button">
        Mark Present
      </button>
      <button onClick={() => queue.markPatientNotPresent("apt-1", "user-1")} type="button">
        Mark Not Present
      </button>
    </div>
  );
}

describe("useQueueService scope propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.subscribe.mockReturnValue(() => undefined);
    mocks.getDailySchedule.mockResolvedValue({ queue_mode: "fluid", schedule: [] });
    mocks.createAppointment.mockResolvedValue({ id: "apt-2" });
    mocks.callNextPatient.mockResolvedValue({ id: "apt-next" });
    mocks.callSpecificPatient.mockResolvedValue({ id: "apt-specific" });
    mocks.markPatientAbsent.mockResolvedValue({ id: "apt-1" });
    mocks.markPatientReturned.mockResolvedValue({ id: "apt-1" });
    mocks.resolveAbsentAppointment.mockResolvedValue({ id: "apt-1" });
    mocks.completeAppointment.mockResolvedValue({ id: "apt-1" });
    mocks.reorderQueue.mockResolvedValue({ id: "apt-1" });
    mocks.checkInPatient.mockResolvedValue({ id: "apt-1" });
    mocks.markPatientPresent.mockResolvedValue({ id: "apt-1" });
    mocks.markPatientNotPresent.mockResolvedValue({ id: "apt-1" });
  });

  it("loads clinic-wide schedule with clinicId when staffId is unavailable", async () => {
    render(<QueueServiceHarness staffId={undefined} />);

    await waitFor(() => {
      expect(mocks.getDailySchedule).toHaveBeenCalledWith(
        undefined,
        expect.any(String),
        true,
        ALLOWED_STAFF_IDS,
        "clinic-1"
      );
    });
  });

  it("propagates allowedStaffIds into queue actions", async () => {
    render(<QueueServiceHarness staffId="staff-1" />);

    await waitFor(() => {
      expect(mocks.getDailySchedule).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole("button", { name: /call next/i }));
    await userEvent.click(screen.getByRole("button", { name: /call specific/i }));
    await userEvent.click(screen.getByRole("button", { name: /mark absent/i }));
    await userEvent.click(screen.getByRole("button", { name: /mark returned/i }));
    await userEvent.click(screen.getByRole("button", { name: /resolve absent/i }));
    await userEvent.click(screen.getByRole("button", { name: /complete/i }));
    await userEvent.click(screen.getByRole("button", { name: /reorder/i }));
    await userEvent.click(screen.getByRole("button", { name: /check in/i }));
    await userEvent.click(screen.getByRole("button", { name: /mark present/i }));
    await userEvent.click(screen.getByRole("button", { name: /mark not present/i }));

    await waitFor(() => {
      expect(mocks.callNextPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedStaffIds: ["doctor-1", "doctor-2"],
        })
      );
      expect(mocks.callSpecificPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: "apt-2",
          allowedStaffIds: ALLOWED_STAFF_IDS,
        })
      );
      expect(mocks.markPatientAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: "apt-1",
          allowedStaffIds: ALLOWED_STAFF_IDS,
        })
      );
      expect(mocks.markPatientReturned).toHaveBeenCalledWith("apt-1", "user-1", ALLOWED_STAFF_IDS);
      expect(mocks.resolveAbsentAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: "apt-1",
          resolution: "rebooked",
          allowedStaffIds: ALLOWED_STAFF_IDS,
        })
      );
      expect(mocks.completeAppointment).toHaveBeenCalledWith("apt-1", "user-1", ALLOWED_STAFF_IDS);
      expect(mocks.reorderQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: "apt-1",
          newPosition: 2,
          allowedStaffIds: ALLOWED_STAFF_IDS,
        })
      );
      expect(mocks.checkInPatient).toHaveBeenCalledWith("apt-1", ALLOWED_STAFF_IDS);
      expect(mocks.markPatientPresent).toHaveBeenCalledWith("apt-1", "user-1", ALLOWED_STAFF_IDS);
      expect(mocks.markPatientNotPresent).toHaveBeenCalledWith("apt-1", "user-1", ALLOWED_STAFF_IDS);
    });
  });
});
