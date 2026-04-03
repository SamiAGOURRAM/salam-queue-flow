import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueueMode } from "@/services/booking/types";
import { BookAppointmentDialog } from "./BookAppointmentDialog";

const mocks = vi.hoisted(() => ({
  getAvailableSlotsForMode: vi.fn(),
  bookAppointmentForMode: vi.fn(),
  getClinic: vi.fn(),
  getStaffByClinic: vi.fn(),
  findOrCreatePatient: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/services/booking/BookingService", () => ({
  bookingService: {
    getAvailableSlotsForMode: mocks.getAvailableSlotsForMode,
    bookAppointmentForMode: mocks.bookAppointmentForMode,
  },
}));

vi.mock("@/services/clinic", () => ({
  clinicService: {
    getClinic: mocks.getClinic,
  },
}));

vi.mock("@/services/staff", () => ({
  staffService: {
    getStaffByClinic: mocks.getStaffByClinic,
  },
}));

vi.mock("@/services/patient", () => ({
  patientService: {
    findOrCreatePatient: mocks.findOrCreatePatient,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: () => <div data-testid="calendar-mock" />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode; value: string }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

describe("BookAppointmentDialog mode-aware behavior", () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  const renderDialog = () => {
    render(
      <BookAppointmentDialog
        open
        onOpenChange={onOpenChange}
        clinicId="clinic-1"
        onSuccess={onSuccess}
        preselectedDate={new Date("2026-06-15T09:00:00.000Z")}
        prefillPatient={{
          patientId: "patient-1",
          fullName: "Sara Ben Ali",
          phoneNumber: "+212600000001",
        }}
        defaultAppointmentType="consultation"
      />
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getClinic.mockResolvedValue({
      id: "clinic-1",
      queueMode: QueueMode.FLUID,
      settings: {
        appointment_types: [{ name: "consultation", label: "Consultation", duration: 15 }],
      },
    });

    mocks.getStaffByClinic.mockResolvedValue([
      {
        id: "staff-1",
        userId: "user-staff-1",
      },
    ]);

    mocks.findOrCreatePatient.mockResolvedValue({ patientId: "patient-1" });

    mocks.bookAppointmentForMode.mockResolvedValue({
      success: true,
      appointmentId: "apt-1",
      queuePosition: 4,
    });
  });

  it("allows fluid booking without selecting a time and sends scheduledTime as null", async () => {
    mocks.getAvailableSlotsForMode.mockResolvedValue({
      available: true,
      slots: [],
      mode: QueueMode.FLUID,
    });

    renderDialog();

    expect(await screen.findByText(/No fixed time slots in fluid mode/i)).toBeInTheDocument();

    const bookButton = screen.getByRole("button", { name: "Book Appointment" });
    await waitFor(() => expect(bookButton).toBeEnabled());

    await userEvent.click(bookButton);

    await waitFor(() => {
      expect(mocks.bookAppointmentForMode).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicId: "clinic-1",
          patientId: "patient-1",
          staffId: "staff-1",
          appointmentDate: "2026-06-15",
          scheduledTime: null,
          appointmentType: "consultation",
        })
      );
    });

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Success",
        description: expect.stringContaining("Queue position #4"),
      })
    );
  });

  it("keeps time required in slotted mode", async () => {
    mocks.getClinic.mockResolvedValue({
      id: "clinic-1",
      queueMode: QueueMode.SLOTTED,
      settings: {
        appointment_types: [{ name: "consultation", label: "Consultation", duration: 15 }],
      },
    });

    mocks.getAvailableSlotsForMode.mockResolvedValue({
      available: true,
      slots: [{ time: "09:30", available: true }],
      mode: QueueMode.SLOTTED,
    });

    renderDialog();

    expect(await screen.findByText(/Time Slot \*/i)).toBeInTheDocument();

    const bookButton = screen.getByRole("button", { name: "Book Appointment" });

    await waitFor(() => expect(bookButton).toBeDisabled());
    expect(mocks.bookAppointmentForMode).not.toHaveBeenCalled();
  });
});
