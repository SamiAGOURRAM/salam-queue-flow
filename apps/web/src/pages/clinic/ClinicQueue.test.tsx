import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClinicQueue from "./ClinicQueue";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClinicPermissions: vi.fn(),
  getStaffByClinicAndUser: vi.fn(),
  getStaffByClinic: vi.fn(),
  addStaff: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/hooks/useClinicPermissions", () => ({
  useClinicPermissions: mocks.useClinicPermissions,
}));

vi.mock("@/services/staff", () => ({
  staffService: {
    getStaffByClinicAndUser: mocks.getStaffByClinicAndUser,
    getStaffByClinic: mocks.getStaffByClinic,
    addStaff: mocks.addStaff,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/components/clinic/EnhancedQueueManager", () => ({
  EnhancedQueueManager: ({
    clinicId,
    userId,
    staffId,
  }: {
    clinicId: string;
    userId: string;
    staffId: string;
    onSummaryChange: (summary: unknown) => void;
  }) => (
    <div data-testid="queue-manager" data-clinic-id={clinicId} data-user-id={userId} data-staff-id={staffId}>
      Queue Manager
    </div>
  ),
}));

vi.mock("@/components/clinic/BookAppointmentDialog", () => ({
  BookAppointmentDialog: ({
    open,
    onOpenChange,
    onSuccess,
    isWalkIn,
    defaultReason,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    isWalkIn?: boolean;
    defaultReason?: string;
  }) => (
    <div
      data-testid="book-dialog"
      data-open={open ? "true" : "false"}
      data-is-walkin={isWalkIn ? "true" : "false"}
      data-default-reason={defaultReason || ""}
    >
      <button onClick={onSuccess} type="button">
        Trigger Book Success
      </button>
      <button
        onClick={() => {
          onOpenChange(false);
        }}
        type="button"
      >
        Close Book Dialog
      </button>
    </div>
  ),
}));

vi.mock("@/components/clinic/EndDayConfirmationDialog", () => ({
  EndDayConfirmationDialog: ({
    open,
    onOpenChange,
    onSuccess,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
  }) => (
    <div data-testid="end-day-dialog" data-open={open ? "true" : "false"}>
      <button onClick={onSuccess} type="button">
        Trigger End Day Success
      </button>
      <button
        onClick={() => {
          onOpenChange(false);
        }}
        type="button"
      >
        Close End Day Dialog
      </button>
    </div>
  ),
}));

describe("ClinicQueue action flows", () => {
  const setPermissionContext = ({ isOwner = false } = {}) => {
    mocks.useClinicPermissions.mockReturnValue({
      clinic: { id: "clinic-1" },
      loading: false,
      isClinicOwnerAtClinic: isOwner,
      can: (permission: string) => permission === "manage_queue" || permission === "manage_appointments",
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useAuth.mockReturnValue({
      user: { id: "user-1" },
      loading: false,
    });

    setPermissionContext();

    mocks.getStaffByClinicAndUser.mockResolvedValue({ id: "staff-1" });
    mocks.getStaffByClinic.mockResolvedValue([]);
    mocks.addStaff.mockResolvedValue({ id: "created-staff-1" });
  });

  it("opens Book, Walk-in, and End Day actions", async () => {
    render(<ClinicQueue />);

    await screen.findByTestId("queue-manager");

    const bookDialog = screen.getByTestId("book-dialog");
    const endDayDialog = screen.getByTestId("end-day-dialog");

    expect(bookDialog).toHaveAttribute("data-open", "false");
    expect(endDayDialog).toHaveAttribute("data-open", "false");

    await userEvent.click(screen.getByRole("button", { name: /^book$/i }));
    expect(bookDialog).toHaveAttribute("data-open", "true");
    expect(bookDialog).toHaveAttribute("data-is-walkin", "false");

    await userEvent.click(screen.getByRole("button", { name: /close book dialog/i }));

    await userEvent.click(screen.getByRole("button", { name: /walk-in/i }));
    expect(bookDialog).toHaveAttribute("data-open", "true");
    expect(bookDialog).toHaveAttribute("data-is-walkin", "true");
    expect(bookDialog).toHaveAttribute("data-default-reason", "Walk-in patient");

    await userEvent.click(screen.getByRole("button", { name: /^end day$/i }));
    expect(endDayDialog).toHaveAttribute("data-open", "true");
  });

  it("resets booking state after success", async () => {
    render(<ClinicQueue />);

    await screen.findByTestId("queue-manager");
    const bookDialog = screen.getByTestId("book-dialog");

    await userEvent.click(screen.getByRole("button", { name: /walk-in/i }));
    expect(bookDialog).toHaveAttribute("data-is-walkin", "true");

    await userEvent.click(screen.getByRole("button", { name: /trigger book success/i }));

    await waitFor(() => {
      expect(bookDialog).toHaveAttribute("data-open", "false");
    });

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Success",
        description: "The queue has been updated.",
      })
    );

    await userEvent.click(screen.getByRole("button", { name: /^book$/i }));
    expect(bookDialog).toHaveAttribute("data-is-walkin", "false");
  });

  it("uses existing clinic staff fallback for owner without personal staff row", async () => {
    setPermissionContext({ isOwner: true });
    mocks.getStaffByClinicAndUser.mockResolvedValue(null);
    mocks.getStaffByClinic.mockResolvedValue([{ id: "fallback-staff-1" }]);

    render(<ClinicQueue />);

    await waitFor(() => {
      expect(screen.getByTestId("queue-manager")).toHaveAttribute("data-staff-id", "fallback-staff-1");
    });

    expect(mocks.addStaff).not.toHaveBeenCalled();
  });

  it("auto-creates owner staff profile when clinic has no staff rows", async () => {
    setPermissionContext({ isOwner: true });
    mocks.getStaffByClinicAndUser.mockResolvedValue(null);
    mocks.getStaffByClinic.mockResolvedValue([]);
    mocks.addStaff.mockResolvedValue({ id: "created-owner-staff-1" });

    render(<ClinicQueue />);

    await waitFor(() => {
      expect(screen.getByTestId("queue-manager")).toHaveAttribute("data-staff-id", "created-owner-staff-1");
    });

    expect(mocks.addStaff).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      userId: "user-1",
      role: "doctor",
    });
  });
});