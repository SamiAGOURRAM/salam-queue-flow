import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DoctorDirectory from "./DoctorDirectory";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  from: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string, options?: { count?: number }) => {
      if (typeof defaultValue === "string") {
        return defaultValue.replace("{{count}}", String(options?.count ?? ""));
      }
      return key;
    },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
  },
}));

type StaffRow = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: string;
  specialization: string | null;
};

type ClinicRow = {
  id: string;
  name: string;
  specialty: string;
  city: string;
  is_active: boolean;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

const renderDirectory = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <DoctorDirectory />
    </QueryClientProvider>
  );
};

const setSupabaseResults = ({
  staffData,
  clinicsData,
  profilesData,
}: {
  staffData: StaffRow[];
  clinicsData: ClinicRow[];
  profilesData: ProfileRow[];
}) => {
  mocks.from.mockImplementation((tableName: string) => {
    if (tableName === "clinic_staff") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: staffData, error: null }),
        })),
      };
    }

    if (tableName === "clinics") {
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: clinicsData, error: null }),
          })),
        })),
      };
    }

    if (tableName === "profiles") {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: profilesData, error: null }),
        })),
      };
    }

    throw new Error(`Unexpected table: ${tableName}`);
  });
};

describe("DoctorDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists doctor-like staff (role-based) and excludes non-clinical roles", async () => {
    setSupabaseResults({
      staffData: [
        { id: "staff-1", clinic_id: "clinic-1", user_id: "user-1", role: "doctor", specialization: null },        // included (role)
        { id: "staff-2", clinic_id: "clinic-1", user_id: "user-2", role: "dentist", specialization: null },       // included (clinical allowlist)
        { id: "staff-3", clinic_id: "clinic-1", user_id: "user-3", role: "receptionist", specialization: null },  // excluded
        { id: "staff-4", clinic_id: "clinic-1", user_id: "user-4", role: "nurse", specialization: "Cardiology" }, // excluded (a specialization no longer qualifies a non-clinical role)
      ],
      clinicsData: [
        { id: "clinic-1", name: "Atlas Clinic", specialty: "General Medicine", city: "Rabat", is_active: true },
      ],
      profilesData: [
        { id: "user-1", full_name: "Dr Nadia Lahlou" },
        { id: "user-2", full_name: "Dr Sami Alaoui" },
      ],
    });

    renderDirectory();

    expect(await screen.findByText("Dr Nadia Lahlou")).toBeInTheDocument();
    expect(screen.getByText("Dr Sami Alaoui")).toBeInTheDocument();
    // Only the two clinical providers surface (receptionist + nurse-with-specialization excluded).
    expect(screen.getAllByRole("button", { name: "Book" })).toHaveLength(2);
  });

  it("navigates to staff-aware booking URL from doctor card action", async () => {
    setSupabaseResults({
      staffData: [
        { id: "staff-1", clinic_id: "clinic-1", user_id: "user-1", role: "doctor", specialization: "Dermatology" },
      ],
      clinicsData: [
        { id: "clinic-1", name: "Atlas Clinic", specialty: "General Medicine", city: "Rabat", is_active: true },
      ],
      profilesData: [
        { id: "user-1", full_name: "Dr Nadia Lahlou" },
      ],
    });

    renderDirectory();

    await screen.findByText("Dr Nadia Lahlou");
    await userEvent.click(screen.getByRole("button", { name: "Book" }));

    expect(mocks.navigate).toHaveBeenCalledWith("/booking/clinic-1?staffId=staff-1");
  });

  it("filters the doctor list from the search input", async () => {
    setSupabaseResults({
      staffData: [
        { id: "staff-1", clinic_id: "clinic-1", user_id: "user-1", role: "doctor", specialization: "Cardiology" },
        { id: "staff-2", clinic_id: "clinic-2", user_id: "user-2", role: "doctor", specialization: "Dermatology" },
      ],
      clinicsData: [
        { id: "clinic-1", name: "Atlas Clinic", specialty: "General Medicine", city: "Rabat", is_active: true },
        { id: "clinic-2", name: "Ocean Clinic", specialty: "Skin Care", city: "Casablanca", is_active: true },
      ],
      profilesData: [
        { id: "user-1", full_name: "Dr Nadia Lahlou" },
        { id: "user-2", full_name: "Dr Karim Amrani" },
      ],
    });

    renderDirectory();

    await screen.findByText("Dr Nadia Lahlou");
    await screen.findByText("Dr Karim Amrani");

    await userEvent.type(
      screen.getByPlaceholderText("Search by doctor, specialty, clinic, or city"),
      "casablanca"
    );

    await waitFor(() => {
      expect(screen.queryByText("Dr Nadia Lahlou")).not.toBeInTheDocument();
      expect(screen.getByText("Dr Karim Amrani")).toBeInTheDocument();
    });
  });
});
