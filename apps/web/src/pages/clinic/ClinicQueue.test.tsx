import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClinicQueue from "./ClinicQueue";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClinicPermissions: vi.fn(),
  useClinicResources: vi.fn(),
  useQueueScope: vi.fn(),
  setQueueScope: vi.fn(),
  getStaffByClinicAndUser: vi.fn(),
  getStaffByClinic: vi.fn(),
  supabaseFrom: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/hooks/useClinicPermissions", () => ({
  useClinicPermissions: mocks.useClinicPermissions,
}));

vi.mock("@/hooks/useClinicResources", () => ({
  useClinicResources: mocks.useClinicResources,
}));

vi.mock("@/hooks/useQueueScope", () => ({
  useQueueScope: mocks.useQueueScope,
}));

vi.mock("@/services/staff", () => ({
  staffService: {
    getStaffByClinicAndUser: mocks.getStaffByClinicAndUser,
    getStaffByClinic: mocks.getStaffByClinic,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string, options?: Record<string, unknown>) => {
      if (typeof defaultValue === "string") {
        return defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, token) => {
          const replacement = options?.[token];
          return replacement == null ? "" : String(replacement);
        });
      }

      return key;
    },
    i18n: { resolvedLanguage: "en", language: "en" },
  }),
}));

vi.mock("@/components/clinic/EnhancedQueueManager", () => ({
  EnhancedQueueManager: ({
    clinicId,
    userId,
    staffId,
    useClinicWide,
    allowedStaffIds,
  }: {
    clinicId: string;
    userId: string;
    staffId?: string;
    useClinicWide?: boolean;
    allowedStaffIds?: string[];
    onSummaryChange: (summary: unknown) => void;
  }) => (
    <div
      data-testid="queue-manager"
      data-clinic-id={clinicId}
      data-user-id={userId}
      data-staff-id={staffId || ""}
      data-use-clinic-wide={useClinicWide ? "true" : "false"}
      data-allowed-staff-ids={(allowedStaffIds || []).join(",")}
    >
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

vi.mock("@/components/clinic/ResourceOccupancyPanel", () => ({
  ResourceOccupancyPanel: () => <div data-testid="resource-occupancy-panel">Resource Occupancy</div>,
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

    mocks.useClinicResources.mockReturnValue({
      resources: [],
      loading: false,
      refresh: vi.fn(),
    });

    mocks.useQueueScope.mockReturnValue({
      loading: false,
      error: null,
      resolvedScope: {
        clinicId: "clinic-1",
        requesterStaffId: "staff-1",
        scopeMode: "clinic",
        isClinicWide: true,
        isOwner: true,
        isProvider: false,
        allowedStaffIds: [],
      },
      selection: "clinic",
      setSelection: mocks.setQueueScope,
      canSwitchQueueScope: true,
      effectiveSelection: "clinic",
      useClinicWide: true,
      allowedStaffIds: undefined,
    });

    mocks.getStaffByClinicAndUser.mockResolvedValue({ id: "staff-1" });
    mocks.getStaffByClinic.mockResolvedValue([
      { id: "staff-1", userId: "user-1", role: "doctor", isActive: true },
      { id: "staff-2", userId: "user-2", role: "doctor", isActive: true },
    ]);
    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: [
                { id: "user-1", full_name: "Dr Owner" },
                { id: "user-2", full_name: "Dr Second" },
              ],
              error: null,
            }),
        }),
      };
    });
  });

  it("opens Book, Walk-in, and End Day actions", async () => {
    render(<ClinicQueue />);

    await screen.findByTestId("queue-manager");

    const bookDialog = screen.getByTestId("book-dialog");
    const endDayDialog = screen.getByTestId("end-day-dialog");

    expect(bookDialog).toHaveAttribute("data-open", "false");
    expect(endDayDialog).toHaveAttribute("data-open", "false");

    await userEvent.click(screen.getByRole("button", { name: /clinicQueue\.header\.book/i }));
    expect(bookDialog).toHaveAttribute("data-open", "true");
    expect(bookDialog).toHaveAttribute("data-is-walkin", "false");

    await userEvent.click(screen.getByRole("button", { name: /close book dialog/i }));

    await userEvent.click(screen.getByRole("button", { name: /clinicQueue\.header\.walkIn/i }));
    expect(bookDialog).toHaveAttribute("data-open", "true");
    expect(bookDialog).toHaveAttribute("data-is-walkin", "true");
    expect(bookDialog).toHaveAttribute("data-default-reason", "clinicQueue.booking.walkInReason");

    await userEvent.click(screen.getByRole("button", { name: /clinicQueue\.header\.endDay/i }));
    expect(endDayDialog).toHaveAttribute("data-open", "true");
  });

  it("resets booking state after success", async () => {
    render(<ClinicQueue />);

    await screen.findByTestId("queue-manager");
    const bookDialog = screen.getByTestId("book-dialog");

    await userEvent.click(screen.getByRole("button", { name: /clinicQueue\.header\.walkIn/i }));
    expect(bookDialog).toHaveAttribute("data-is-walkin", "true");

    await userEvent.click(screen.getByRole("button", { name: /trigger book success/i }));

    await waitFor(() => {
      expect(bookDialog).toHaveAttribute("data-open", "false");
    });

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "clinicQueue.toasts.successTitle",
        description: "clinicQueue.toasts.queueUpdated",
      })
    );

    await userEvent.click(screen.getByRole("button", { name: /clinicQueue\.header\.book/i }));
    expect(bookDialog).toHaveAttribute("data-is-walkin", "false");
  });

  it("lets owner view clinic-wide queue without a staff profile", async () => {
    setPermissionContext({ isOwner: true });
    mocks.getStaffByClinicAndUser.mockResolvedValue(null);

    render(<ClinicQueue />);

    await waitFor(() => {
      expect(screen.getByTestId("queue-manager")).toHaveAttribute("data-staff-id", "");
    });

    expect(screen.getByRole("button", { name: /clinicQueue\.header\.endDay/i })).toBeDisabled();
  });

  it("opens a specific doctor queue from the doctor list", async () => {
    setPermissionContext({ isOwner: true });

    render(<ClinicQueue />);

    await screen.findByTestId("queue-manager");
    expect(screen.getByTestId("queue-manager")).toHaveAttribute("data-allowed-staff-ids", "");

    await userEvent.click(screen.getByRole("button", { name: /open dr second queue/i }));

    await waitFor(() => {
      expect(screen.getByTestId("queue-manager")).toHaveAttribute("data-allowed-staff-ids", "staff-2");
      expect(screen.getByTestId("queue-manager")).toHaveAttribute("data-use-clinic-wide", "true");
    });
  });

  it("does not show owner as a duplicate doctor queue option", async () => {
    setPermissionContext({ isOwner: true });

    render(<ClinicQueue />);

    await screen.findByTestId("queue-manager");

    expect(screen.queryByRole("button", { name: /open dr owner queue/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open dr second queue/i })).toBeInTheDocument();
  });

  it("returns to general queue when clicking the active doctor quick card", async () => {
    setPermissionContext({ isOwner: true });

    render(<ClinicQueue />);

    await screen.findByTestId("queue-manager");

    await userEvent.click(screen.getByRole("button", { name: /open dr second queue/i }));

    await waitFor(() => {
      expect(screen.getByTestId("queue-manager")).toHaveAttribute("data-allowed-staff-ids", "staff-2");
    });

    await userEvent.click(screen.getByRole("button", { name: /dr second/i }));

    await waitFor(() => {
      expect(screen.getByTestId("queue-manager")).toHaveAttribute("data-allowed-staff-ids", "");
    });
  });

  it("waits for queue scope resolution before rendering manager for non-owner staff", async () => {
    setPermissionContext({ isOwner: false });
    mocks.useQueueScope.mockReturnValue({
      loading: false,
      error: null,
      resolvedScope: {
        clinicId: "clinic-1",
        requesterStaffId: undefined,
        scopeMode: "clinic",
        isClinicWide: true,
        isOwner: false,
        isProvider: false,
        allowedStaffIds: [],
      },
      selection: "clinic",
      setSelection: mocks.setQueueScope,
      canSwitchQueueScope: false,
      effectiveSelection: "clinic",
      useClinicWide: true,
      allowedStaffIds: undefined,
    });

    render(<ClinicQueue />);

    await waitFor(() => {
      expect(screen.queryByTestId("queue-manager")).not.toBeInTheDocument();
    });

    expect(screen.getByText("clinicQueue.loading.queueInfo")).toBeInTheDocument();
  });
});