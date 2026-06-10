import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeamManagement from "./TeamManagement";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClinicPermissions: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
  getQueueAssignmentsByClinic: vi.fn(),
  replaceQueueAssignments: vi.fn(),
  updateStaff: vi.fn(),
  removeStaff: vi.fn(),
  addStaff: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/hooks/useClinicPermissions", () => ({
  useClinicPermissions: mocks.useClinicPermissions,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

vi.mock("@/services/staff", () => ({
  staffService: {
    getQueueAssignmentsByClinic: mocks.getQueueAssignmentsByClinic,
    replaceQueueAssignments: mocks.replaceQueueAssignments,
    updateStaff: mocks.updateStaff,
    removeStaff: mocks.removeStaff,
    addStaff: mocks.addStaff,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) => {
    if (open === false) return null;
    return <div>{children}</div>;
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void }) => (
    <input
      aria-label="provider-assignment"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      type="checkbox"
    />
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode; value: string }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

describe("TeamManagement queue assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useAuth.mockReturnValue({
      user: { id: "owner-user-1" },
    });

    mocks.useClinicPermissions.mockReturnValue({
      clinic: {
        id: "clinic-1",
        owner_id: "owner-user-1",
        settings: {},
      },
      loading: false,
      can: (permission: string) => ["manage_team", "manage_roles", "view_team"].includes(permission),
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "clinic_staff") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    id: "staff-doc-1",
                    clinic_id: "clinic-1",
                    user_id: "doctor-user-1",
                    role: "doctor",
                    is_active: true,
                  },
                  {
                    id: "staff-doc-2",
                    clinic_id: "clinic-1",
                    user_id: "doctor-user-2",
                    role: "doctor",
                    is_active: true,
                  },
                  {
                    id: "staff-reception",
                    clinic_id: "clinic-1",
                    user_id: "reception-user-1",
                    role: "staff",
                    is_active: true,
                  },
                ],
                error: null,
              }),
          }),
        };
      }

      if (table === "profiles") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    id: "doctor-user-1",
                    full_name: "Dr. One",
                    email: "doc1@clinic.test",
                    phone_number: null,
                  },
                  {
                    id: "doctor-user-2",
                    full_name: "Dr. Two",
                    email: "doc2@clinic.test",
                    phone_number: null,
                  },
                  {
                    id: "reception-user-1",
                    full_name: "Reception Staff",
                    email: "staff@clinic.test",
                    phone_number: null,
                  },
                ],
                error: null,
              }),
          }),
        };
      }

      if (table === "clinics") {
        return {
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    });

    mocks.getQueueAssignmentsByClinic.mockResolvedValue({
      "staff-reception": ["staff-doc-1"],
    });

    mocks.replaceQueueAssignments.mockResolvedValue({
      staffId: "staff-reception",
      assignedStaffIds: ["staff-doc-2"],
    });
  });

  it("saves edited receptionist provider assignments", async () => {
    render(<TeamManagement />);

    await waitFor(() => {
      expect(mocks.getQueueAssignmentsByClinic).toHaveBeenCalledWith("clinic-1");
    });

    await userEvent.click(screen.getByRole("button", { name: "Set access" }));

    expect(await screen.findByText("Set Queue Access")).toBeInTheDocument();

    const checkboxes = screen.getAllByLabelText("provider-assignment");
    expect(checkboxes).toHaveLength(2);

    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[1]);
    await userEvent.click(screen.getByRole("button", { name: /save queue access/i }));

    await waitFor(() => {
      expect(mocks.replaceQueueAssignments).toHaveBeenCalledWith("staff-reception", ["staff-doc-2"]);
    });

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Queue assignments updated",
      })
    );
  });

  it("shows clinic owner as owner-first even with doctor clinical role", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "clinic_staff") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    id: "staff-owner",
                    clinic_id: "clinic-1",
                    user_id: "owner-user-1",
                    role: "doctor",
                    is_active: true,
                  },
                  {
                    id: "staff-doc-1",
                    clinic_id: "clinic-1",
                    user_id: "doctor-user-1",
                    role: "doctor",
                    is_active: true,
                  },
                ],
                error: null,
              }),
          }),
        };
      }

      if (table === "profiles") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    id: "owner-user-1",
                    full_name: "Clinic Owner",
                    email: "owner@clinic.test",
                    phone_number: null,
                  },
                  {
                    id: "doctor-user-1",
                    full_name: "Dr. One",
                    email: "doc1@clinic.test",
                    phone_number: null,
                  },
                ],
                error: null,
              }),
          }),
        };
      }

      if (table === "clinics") {
        return {
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    });

    mocks.getQueueAssignmentsByClinic.mockResolvedValue({});

    render(<TeamManagement />);

    expect(await screen.findByText("All clinic queues (Owner)")).toBeInTheDocument();
    expect(screen.getByText("Clinical role")).toBeInTheDocument();
    expect(screen.getAllByText("Clinic Owner").length).toBeGreaterThan(0);
  });
});
