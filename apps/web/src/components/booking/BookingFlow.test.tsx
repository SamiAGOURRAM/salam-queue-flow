import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueueMode } from "@/services/queue/models/QueueModels";
import BookingFlow from "./BookingFlow";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getClinic: vi.fn(),
  getStaffByClinic: vi.fn(),
  getAvailableSlotsForMode: vi.fn(),
  bookAppointmentForMode: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
  removeChannel: vi.fn(),
  from: vi.fn(),
  channelOn: vi.fn(),
  channelSubscribe: vi.fn(),
  profileMaybeSingle: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ clinicId: "clinic-1" }),
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
  toast: mocks.toast,
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

vi.mock("@/services/booking/BookingService", () => ({
  bookingService: {
    getAvailableSlotsForMode: mocks.getAvailableSlotsForMode,
    bookAppointmentForMode: mocks.bookAppointmentForMode,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    channel: vi.fn(() => ({
      on: mocks.channelOn,
      subscribe: mocks.channelSubscribe,
    })),
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock("@/components/auth/AuthModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="auth-modal">Authentication required</div> : null,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: () => <div data-testid="calendar-mock">Calendar</div>,
}));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<((value: string) => void) | null>(null);

  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: React.ReactNode }) => (
      <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ""}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

describe("BookingFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useAuth.mockReturnValue({ user: { id: "patient-1" } });

    mocks.getClinic.mockResolvedValue({
      id: "clinic-1",
      name: "Atlas Clinic",
      specialty: "General Medicine",
      settings: {
        appointment_types: [{ name: "consultation", label: "Consultation", duration: 15 }],
        working_hours: {
          monday: { open: "09:00", close: "17:00", closed: false },
        },
      },
    });

    mocks.getStaffByClinic.mockResolvedValue([
      {
        id: "staff-1",
        userId: "doctor-user-1",
        role: "doctor",
        specialization: "General Medicine",
      },
    ]);

    mocks.profileMaybeSingle.mockResolvedValue({
      data: { full_name: "Dr Sara" },
    });

    mocks.from.mockImplementation((tableName: string) => {
      if (tableName !== "profiles") {
        throw new Error(`Unexpected table query in test: ${tableName}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mocks.profileMaybeSingle,
          })),
        })),
      };
    });

    mocks.channelOn.mockReturnValue({
      subscribe: mocks.channelSubscribe,
    });
    mocks.channelSubscribe.mockReturnValue({});

    mocks.getAvailableSlotsForMode.mockResolvedValue({
      mode: QueueMode.FLUID,
      slots: [],
      available: true,
    });

    mocks.bookAppointmentForMode.mockResolvedValue({
      success: true,
      appointmentId: "apt-1",
      queuePosition: 3,
    });
  });

  it("opens auth modal when unauthenticated user continues booking", async () => {
    mocks.useAuth.mockReturnValue({ user: null });

    render(<BookingFlow />);

    await screen.findByText("Select Date & Time");
    await userEvent.click(await screen.findByRole("button", { name: "Consultation (15 min)" }));

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => {
      expect(continueButton).toBeEnabled();
    });

    await userEvent.click(continueButton);

    expect(await screen.findByTestId("auth-modal")).toBeInTheDocument();
    expect(mocks.bookAppointmentForMode).not.toHaveBeenCalled();
  });

  it("books successfully in fluid mode without scheduled time", async () => {
    render(<BookingFlow />);

    await screen.findByText("Select Date & Time");
    await userEvent.click(await screen.findByRole("button", { name: "Consultation (15 min)" }));

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => {
      expect(continueButton).toBeEnabled();
    });

    await userEvent.click(continueButton);
    expect(await screen.findByRole("heading", { name: "Confirm Booking" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirm Booking" }));

    await waitFor(() => {
      expect(mocks.bookAppointmentForMode).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicId: "clinic-1",
          patientId: "patient-1",
          staffId: "staff-1",
          scheduledTime: null,
          appointmentType: "consultation",
        })
      );
    });

    expect(await screen.findByText("Booking Confirmed!")).toBeInTheDocument();
  });
});
