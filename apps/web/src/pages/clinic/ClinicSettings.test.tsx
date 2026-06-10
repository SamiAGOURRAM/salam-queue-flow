import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClinicSettings from "./ClinicSettings";
import { permissionsFromBaseRole, type ClinicRoleDefinition } from "@/lib/clinicRolePermissions";

type ResourceRow = {
  id: string;
  clinic_id: string;
  name: string;
  resource_type: string;
  capacity: number;
  is_active: boolean;
  display_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClinicPermissions: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  activeTab: "resources",
}));

const translate = (key: string, defaultValue?: string, options?: Record<string, unknown>) => {
  if (typeof defaultValue !== "string") {
    return key;
  }

  return defaultValue.replace(/\{\{(\w+)\}\}/g, (_, token: string) => {
    const replacement = options?.[token];
    return replacement == null ? "" : String(replacement);
  });
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [new URLSearchParams(`tab=${mocks.activeTab}`), vi.fn()],
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/hooks/useClinicPermissions", () => ({
  useClinicPermissions: mocks.useClinicPermissions,
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

vi.mock("@/components/ui/select", async () => {
  const ReactModule = await import("react");
  const SelectContext = ReactModule.createContext<((value: string) => void) | null>(null);

  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: React.ReactNode }) => (
      <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ""}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const onValueChange = ReactModule.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    className?: string;
  }) => (
    <input
      role="switch"
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
      {...props}
    />
  ),
}));

vi.mock("@/components/ui/alert-dialog", async () => {
  const ReactModule = await import("react");

  type AlertDialogContextShape = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  };

  const AlertDialogContext = ReactModule.createContext<AlertDialogContextShape>({ open: false });

  return {
    AlertDialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange?: (open: boolean) => void;
      children: React.ReactNode;
    }) => (
      <AlertDialogContext.Provider value={{ open, onOpenChange }}>{children}</AlertDialogContext.Provider>
    ),
    AlertDialogContent: ({ children }: { children: React.ReactNode }) => {
      const context = ReactModule.useContext(AlertDialogContext);
      return context.open ? <div>{children}</div> : null;
    },
    AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    AlertDialogCancel: ({
      children,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      className?: string;
    }) => {
      const context = ReactModule.useContext(AlertDialogContext);
      return (
        <button
          type="button"
          onClick={() => {
            onClick?.();
            context.onOpenChange?.(false);
          }}
          {...props}
        >
          {children}
        </button>
      );
    },
    AlertDialogAction: ({
      children,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
      className?: string;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} {...props}>
        {children}
      </button>
    ),
  };
});

type SupabaseSpies = {
  update: ReturnType<typeof vi.fn>;
  updateEqId: ReturnType<typeof vi.fn>;
  updateEqClinic: ReturnType<typeof vi.fn>;
  deleteResource: ReturnType<typeof vi.fn>;
  deleteEqId: ReturnType<typeof vi.fn>;
  deleteEqClinic: ReturnType<typeof vi.fn>;
};

const baseClinic = {
  id: "clinic-1",
  name: "Atlas Clinic",
  name_ar: null,
  specialty: "General Medicine",
  phone: "+212600000000",
  email: null,
  address: "1 Main Street",
  city: "Rabat",
  settings: {},
};

const baseResource: ResourceRow = {
  id: "resource-1",
  clinic_id: "clinic-1",
  name: "Room A",
  resource_type: "room",
  capacity: 1,
  is_active: true,
  display_order: 0,
  notes: "Initial notes",
  created_at: "2026-04-04T10:00:00.000Z",
  updated_at: "2026-04-04T10:00:00.000Z",
  created_by: "user-1",
};

const setPermissionContext = ({
  canManage = true,
  roleDefinitions,
}: {
  canManage?: boolean;
  roleDefinitions?: ClinicRoleDefinition[];
} = {}) => {
  mocks.useClinicPermissions.mockReturnValue({
    clinic: { id: "clinic-1" },
    loading: false,
    roleDefinitions: roleDefinitions ?? [
      {
        key: "doctor",
        label: "Doctor",
        baseRole: "doctor",
        permissions: permissionsFromBaseRole("doctor"),
        isSystem: true,
      },
    ],
    can: (permission: string) => {
      if (permission === "view_clinic_settings") {
        return true;
      }

      if (permission === "manage_clinic_settings") {
        return canManage;
      }

      return false;
    },
  });
};

const setupSupabase = ({
  resources,
  rpcResult,
}: {
  resources: ResourceRow[];
  rpcResult?: ResourceRow;
}): SupabaseSpies => {
  const clinicSingle = vi.fn().mockResolvedValue({ data: baseClinic, error: null });
  const clinicsEq = vi.fn(() => ({ single: clinicSingle }));
  const clinicsSelect = vi.fn(() => ({ eq: clinicsEq }));

  const resourcesOrderByName = vi.fn().mockResolvedValue({ data: resources, error: null });
  const resourcesOrderByDisplay = vi.fn(() => ({ order: resourcesOrderByName }));
  const resourcesEq = vi.fn(() => ({ order: resourcesOrderByDisplay }));
  const resourcesSelect = vi.fn(() => ({ eq: resourcesEq }));

  const updateEqClinic = vi.fn().mockResolvedValue({ error: null });
  const updateEqId = vi.fn(() => ({ eq: updateEqClinic }));
  const update = vi.fn(() => ({ eq: updateEqId }));

  const deleteEqClinic = vi.fn().mockResolvedValue({ error: null });
  const deleteEqId = vi.fn(() => ({ eq: deleteEqClinic }));
  const deleteResource = vi.fn(() => ({ eq: deleteEqId }));

  mocks.from.mockImplementation((tableName: string) => {
    if (tableName === "clinics") {
      return {
        select: clinicsSelect,
      };
    }

    if (tableName === "clinic_resources") {
      return {
        select: resourcesSelect,
        update,
        delete: deleteResource,
      };
    }

    throw new Error(`Unexpected table queried in test: ${tableName}`);
  });

  if (rpcResult) {
    mocks.rpc.mockResolvedValue({ data: rpcResult, error: null });
  } else {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  }

  return {
    update,
    updateEqId,
    updateEqClinic,
    deleteResource,
    deleteEqId,
    deleteEqClinic,
  };
};

const setupDoctorOverridesSupabase = (
  doctorUserId: string,
  role = "doctor",
  options?: {
    includeDuplicateOwnProvider?: boolean;
    withProfileName?: boolean;
  }
) => {
  const clinicSingle = vi.fn().mockResolvedValue({ data: baseClinic, error: null });
  const clinicsEq = vi.fn(() => ({ single: clinicSingle }));
  const clinicsSelect = vi.fn(() => ({ eq: clinicsEq }));

  const primaryStaffRow = {
    id: "staff-doctor-1",
    clinic_id: "clinic-1",
    user_id: doctorUserId,
    role,
    specialization: "Cardiology",
    license_number: null,
    working_hours: null,
    appointment_types_override: [{ name: "consultation", label: "Consultation", duration: 20 }],
    daily_queue_modes_override: null,
    average_consultation_duration: null,
    patients_per_day_avg: null,
    is_active: true,
    created_at: "2026-04-04T10:00:00.000Z",
    updated_at: "2026-04-04T10:00:00.000Z",
  };

  const secondaryStaffRow = {
    ...primaryStaffRow,
    id: "staff-doctor-2",
    specialization: "Neurology",
  };

  const staffRows = options?.includeDuplicateOwnProvider
    ? [primaryStaffRow, secondaryStaffRow]
    : [primaryStaffRow];

  const clinicStaffOrder = vi.fn().mockResolvedValue({ data: staffRows, error: null });
  const clinicStaffEqIsActive = vi.fn(() => ({ order: clinicStaffOrder }));
  const clinicStaffMaybeSingleByUser = vi.fn().mockResolvedValue({ data: staffRows[0], error: null });
  const clinicStaffEqUserId = vi.fn(() => ({ maybeSingle: clinicStaffMaybeSingleByUser }));
  const clinicStaffSingle = vi.fn().mockResolvedValue({ data: staffRows[0], error: null });
  const clinicStaffSelectEq = vi.fn((column: string) => {
    if (column === "clinic_id") {
      return {
        eq: vi.fn((innerColumn: string) => {
          if (innerColumn === "is_active") {
            return clinicStaffEqIsActive();
          }

          if (innerColumn === "user_id") {
            return clinicStaffEqUserId();
          }

          throw new Error(`Unexpected clinic_staff nested eq column: ${innerColumn}`);
        }),
      };
    }

    if (column === "id") {
      return { single: clinicStaffSingle };
    }

    throw new Error(`Unexpected clinic_staff select eq column: ${column}`);
  });
  const clinicStaffSelect = vi.fn(() => ({ eq: clinicStaffSelectEq }));

  const profilesIn = vi.fn().mockResolvedValue({
    data: options?.withProfileName === false
      ? []
      : [{ id: doctorUserId, full_name: "Dr Editable" }],
    error: null,
  });
  const profilesSelect = vi.fn(() => ({ in: profilesIn }));

  mocks.from.mockImplementation((tableName: string) => {
    if (tableName === "clinics") {
      return {
        select: clinicsSelect,
      };
    }

    if (tableName === "clinic_staff") {
      return {
        select: clinicStaffSelect,
      };
    }

    if (tableName === "profiles") {
      return {
        select: profilesSelect,
      };
    }

    throw new Error(`Unexpected table queried in doctor-overrides test: ${tableName}`);
  });

  mocks.rpc.mockImplementation((functionName: string, payload: Record<string, unknown>) => {
    if (functionName === "update_staff_doctor_overrides") {
      return Promise.resolve({
        data: {
          ...staffRows.find((row) => row.id === payload.p_staff_id),
          working_hours: payload.p_working_hours ?? null,
          appointment_types_override: payload.p_appointment_types_override ?? null,
          daily_queue_modes_override: payload.p_daily_queue_modes_override ?? null,
          updated_at: "2026-04-05T10:00:00.000Z",
        },
        error: null,
      });
    }

    return Promise.resolve({ data: null, error: null });
  });

  return {
    staffRows,
  };
};

describe("ClinicSettings resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeTab = "resources";

    mocks.useAuth.mockReturnValue({
      user: { id: "user-1" },
      loading: false,
    });

    setPermissionContext({ canManage: true });
  });

  it("creates resources through create_clinic_resource RPC", async () => {
    const rpcResource: ResourceRow = {
      ...baseResource,
      id: "resource-2",
      name: "Consultation Room B",
      display_order: 1,
      notes: null,
    };

    setupSupabase({
      resources: [baseResource],
      rpcResult: rpcResource,
    });

    render(<ClinicSettings />);

    await screen.findByDisplayValue("Room A");

    await userEvent.type(screen.getByPlaceholderText("Consultation Room 1"), "Consultation Room B");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith(
        "create_clinic_resource",
        expect.objectContaining({
          p_clinic_id: "clinic-1",
          p_name: "Consultation Room B",
          p_resource_type: "room",
          p_capacity: 1,
          p_created_by: "user-1",
        })
      );
    });

    expect(await screen.findByDisplayValue("Consultation Room B")).toBeInTheDocument();
  });

  it("updates existing resources and persists active state", async () => {
    const spies = setupSupabase({ resources: [baseResource] });

    render(<ClinicSettings />);

    const nameInput = await screen.findByDisplayValue("Room A");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Room Alpha");

    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(spies.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Room Alpha",
          resource_type: "room",
          capacity: 1,
          notes: "Initial notes",
          is_active: false,
          display_order: 0,
        })
      );
    });

    expect(spies.updateEqId).toHaveBeenCalledWith("id", "resource-1");
    expect(spies.updateEqClinic).toHaveBeenCalledWith("clinic_id", "clinic-1");
  });

  it("requires confirmation before deleting a resource", async () => {
    const spies = setupSupabase({ resources: [baseResource] });

    render(<ClinicSettings />);

    await screen.findByDisplayValue("Room A");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete Resource")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(spies.deleteEqId).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete resource" }));

    await waitFor(() => {
      expect(spies.deleteEqId).toHaveBeenCalledWith("id", "resource-1");
      expect(spies.deleteEqClinic).toHaveBeenCalledWith("clinic_id", "clinic-1");
    });

    await waitFor(() => {
      expect(screen.queryByDisplayValue("Room A")).not.toBeInTheDocument();
    });
  });

  it("disables resource mutation actions without manage permission", async () => {
    setPermissionContext({ canManage: false });
    setupSupabase({ resources: [baseResource] });

    render(<ClinicSettings />);

    await screen.findByDisplayValue("Room A");

    const addButton = screen.getByRole("button", { name: "Add" });
    const saveButton = screen.getByRole("button", { name: "Save" });
    const deleteButton = screen.getByRole("button", { name: "Delete" });

    expect(addButton).toBeDisabled();
    expect(saveButton).toBeDisabled();
    expect(deleteButton).toBeDisabled();

    await userEvent.click(addButton);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("lets a doctor edit own overrides even without manage clinic settings", async () => {
    const doctorUserId = "doctor-user-1";
    mocks.activeTab = "doctor-overrides";

    mocks.useAuth.mockReturnValue({
      user: { id: doctorUserId },
      loading: false,
    });

    setPermissionContext({ canManage: false });
    setupDoctorOverridesSupabase(doctorUserId);

    render(<ClinicSettings />);

    const saveButton = await screen.findByRole("button", { name: "Save Doctor Settings" });

    expect(
      screen.queryByText("You have view-only access to clinic settings for this role.")
    ).not.toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith(
        "update_staff_doctor_overrides",
        expect.objectContaining({
          p_staff_id: "staff-doctor-1",
        })
      );
    });
  });

  it("treats custom doctor base roles as editable provider overrides", async () => {
    const doctorUserId = "doctor-user-1";
    mocks.activeTab = "doctor-overrides";

    mocks.useAuth.mockReturnValue({
      user: { id: doctorUserId },
      loading: false,
    });

    setPermissionContext({
      canManage: false,
      roleDefinitions: [
        {
          key: "medecin",
          label: "Medecin",
          baseRole: "doctor",
          permissions: permissionsFromBaseRole("doctor"),
          isSystem: false,
        },
      ],
    });
    setupDoctorOverridesSupabase(doctorUserId, "medecin");

    render(<ClinicSettings />);

    const saveButton = await screen.findByRole("button", { name: "Save Doctor Settings" });
    expect(saveButton).toBeEnabled();
  });

  it("keeps doctor override editing enabled when selecting another own provider profile", async () => {
    const doctorUserId = "doctor-user-1";
    mocks.activeTab = "doctor-overrides";

    mocks.useAuth.mockReturnValue({
      user: { id: doctorUserId },
      loading: false,
    });

    setPermissionContext({ canManage: false });
    setupDoctorOverridesSupabase(doctorUserId, "doctor", {
      includeDuplicateOwnProvider: true,
      withProfileName: false,
    });

    render(<ClinicSettings />);

    const saveButton = await screen.findByRole("button", { name: "Save Doctor Settings" });
    expect(saveButton).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Doctor - Neurology" }));

    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith(
        "update_staff_doctor_overrides",
        expect.objectContaining({
          p_staff_id: "staff-doctor-2",
        })
      );
    });
  });
});
