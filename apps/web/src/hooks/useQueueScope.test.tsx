import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useQueueScope, type QueueScopeSelection } from "./useQueueScope";

const mocks = vi.hoisted(() => ({
  resolveQueueScope: vi.fn(),
}));

vi.mock("@/services/staff", () => ({
  staffService: {
    resolveQueueScope: mocks.resolveQueueScope,
  },
}));

function ScopeHarness({
  clinicId = "clinic-1",
  staffId,
  initialSelection = "clinic",
}: {
  clinicId?: string;
  staffId?: string;
  initialSelection?: QueueScopeSelection;
}) {
  const {
    loading,
    effectiveSelection,
    useClinicWide,
    allowedStaffIds,
    canSwitchQueueScope,
    setSelection,
  } = useQueueScope({
    clinicId,
    staffId,
    initialSelection,
  });

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="effective-selection">{effectiveSelection}</div>
      <div data-testid="use-clinic-wide">{String(useClinicWide)}</div>
      <div data-testid="allowed-staff-ids">{allowedStaffIds?.join(",") || "none"}</div>
      <div data-testid="can-switch">{String(canSwitchQueueScope)}</div>
      <button onClick={() => setSelection("clinic")} type="button">
        Select Clinic
      </button>
      <button onClick={() => setSelection("personal")} type="button">
        Select Personal
      </button>
    </div>
  );
}

describe("useQueueScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forces provider scope to personal queue", async () => {
    mocks.resolveQueueScope.mockResolvedValue({
      clinicId: "clinic-1",
      requesterStaffId: "provider-staff-1",
      scopeMode: "provider",
      isClinicWide: false,
      isOwner: false,
      isProvider: true,
      allowedStaffIds: ["provider-staff-1"],
    });

    render(<ScopeHarness staffId="provider-staff-1" initialSelection="clinic" />);

    await waitFor(() => {
      expect(screen.getByTestId("effective-selection")).toHaveTextContent("personal");
    });

    expect(screen.getByTestId("use-clinic-wide")).toHaveTextContent("false");
    expect(screen.getByTestId("allowed-staff-ids")).toHaveTextContent("provider-staff-1");
    expect(screen.getByTestId("can-switch")).toHaveTextContent("false");
  });

  it("forces restricted scope to clinic view with allowed providers", async () => {
    mocks.resolveQueueScope.mockResolvedValue({
      clinicId: "clinic-1",
      requesterStaffId: "reception-staff-1",
      scopeMode: "restricted",
      isClinicWide: true,
      isOwner: false,
      isProvider: false,
      allowedStaffIds: ["doctor-staff-1", "doctor-staff-2"],
    });

    render(<ScopeHarness staffId="reception-staff-1" initialSelection="personal" />);

    await waitFor(() => {
      expect(screen.getByTestId("effective-selection")).toHaveTextContent("clinic");
    });

    expect(screen.getByTestId("use-clinic-wide")).toHaveTextContent("true");
    expect(screen.getByTestId("allowed-staff-ids")).toHaveTextContent("doctor-staff-1,doctor-staff-2");
    expect(screen.getByTestId("can-switch")).toHaveTextContent("false");
  });

  it("allows clinic owners to switch between clinic and personal queues", async () => {
    mocks.resolveQueueScope.mockResolvedValue({
      clinicId: "clinic-1",
      requesterStaffId: "owner-staff-1",
      scopeMode: "clinic",
      isClinicWide: true,
      isOwner: true,
      isProvider: false,
      allowedStaffIds: [],
    });

    render(<ScopeHarness staffId="owner-staff-1" initialSelection="clinic" />);

    await waitFor(() => {
      expect(screen.getByTestId("can-switch")).toHaveTextContent("true");
    });

    fireEvent.click(screen.getByRole("button", { name: /select personal/i }));

    await waitFor(() => {
      expect(screen.getByTestId("effective-selection")).toHaveTextContent("personal");
    });

    expect(screen.getByTestId("use-clinic-wide")).toHaveTextContent("false");
    expect(screen.getByTestId("allowed-staff-ids")).toHaveTextContent("owner-staff-1");
  });

  it("falls back to clinic-wide defaults when requester has no staff profile", async () => {
    render(<ScopeHarness staffId={undefined} initialSelection="personal" />);

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("effective-selection")).toHaveTextContent("clinic");
    expect(screen.getByTestId("use-clinic-wide")).toHaveTextContent("true");
    expect(screen.getByTestId("allowed-staff-ids")).toHaveTextContent("none");
    expect(screen.getByTestId("can-switch")).toHaveTextContent("false");
    expect(mocks.resolveQueueScope).not.toHaveBeenCalled();
  });
});
