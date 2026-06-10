import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DoctorActivityCard } from "./DoctorActivityCard";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const stableT = vi.fn(
  (key: string, defaultValue?: string | Record<string, unknown>) => {
    if (typeof defaultValue === "string") return defaultValue;
    if (defaultValue && typeof defaultValue === "object" && "defaultValue" in defaultValue) {
      return defaultValue.defaultValue as string;
    }
    return key;
  }
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: stableT }),
}));

function createDoctorRow(overrides?: Record<string, unknown>) {
  return {
    staff_id: "staff-1",
    doctor_name: "Dr. Smith",
    specialization: "Cardiology",
    completed_count: 12,
    in_progress_count: 2,
    cancelled_count: 1,
    no_show_count: 0,
    avg_duration_minutes: 18.5,
    total_patients: 15,
    ...overrides,
  };
}

describe("DoctorActivityCard", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mocks.rpc.mockReturnValue(new Promise(() => {}));

    render(<DoctorActivityCard clinicId="clinic-1" />);

    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("renders doctor rows from RPC response", async () => {
    const rows = [createDoctorRow()];
    mocks.rpc.mockResolvedValue({ data: rows, error: null });

    render(<DoctorActivityCard clinicId="clinic-1" />);

    await waitFor(() => {
      expect(screen.getByText("Dr. Smith")).toBeTruthy();
    });

    expect(screen.getByText("Cardiology")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("renders multiple doctor rows", async () => {
    const rows = [
      createDoctorRow({ staff_id: "staff-1", doctor_name: "Dr. Smith" }),
      createDoctorRow({ staff_id: "staff-2", doctor_name: "Dr. Jones" }),
    ];
    mocks.rpc.mockResolvedValue({ data: rows, error: null });

    render(<DoctorActivityCard clinicId="clinic-1" />);

    await waitFor(() => {
      expect(screen.getByText("Dr. Smith")).toBeTruthy();
    });

    expect(screen.getByText("Dr. Jones")).toBeTruthy();
  });

  it("shows empty state when RPC returns empty array", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    render(<DoctorActivityCard clinicId="clinic-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("No doctor activity in this range yet.")
      ).toBeTruthy();
    });
  });

  it("shows permission denied state on 42501 error", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for clinic analytics" },
    });

    render(<DoctorActivityCard clinicId="clinic-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("You do not have permission to view doctor activity.")
      ).toBeTruthy();
    });

    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("shows error toast for non-permission errors", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "500", message: "Internal server error" },
    });

    render(<DoctorActivityCard clinicId="clinic-1" />);

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      );
    });
  });

  it("passes correct RPC params for today range", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    render(<DoctorActivityCard clinicId="clinic-1" />);

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith("get_doctor_activity_report", {
        p_clinic_id: "clinic-1",
        p_from_date: "2026-06-03",
        p_to_date: "2026-06-03",
      });
    });
  });

  it("renders dash for null avg duration", async () => {
    const rows = [createDoctorRow({ avg_duration_minutes: null })];
    mocks.rpc.mockResolvedValue({ data: rows, error: null });

    render(<DoctorActivityCard clinicId="clinic-1" />);

    await waitFor(() => {
      expect(screen.getByText("Dr. Smith")).toBeTruthy();
    });

    expect(screen.getByText("—")).toBeTruthy();
  });
});
