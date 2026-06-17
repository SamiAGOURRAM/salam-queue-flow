import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { DoctorListing } from "@queuemed/core";
import DoctorDirectory from "./DoctorDirectory";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchDoctors: vi.fn(),
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

// Mock at the service boundary: DoctorDirectory now consumes useDoctorSearch ->
// clinicService.searchDoctors (which performs the clinics->staff->profiles join and
// role-gating in the repository). Tests exercise the real hook + react-query.
vi.mock("@/services/clinic/ClinicService", () => ({
  clinicService: { searchDoctors: mocks.searchDoctors },
}));

const renderDirectory = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DoctorDirectory />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const listing = (over: Partial<DoctorListing> & Pick<DoctorListing, "staffId" | "clinicId" | "fullName">): DoctorListing => ({
  role: "doctor",
  clinicName: "Atlas Clinic",
  clinicSpecialty: "General Medicine",
  city: "Rabat",
  ...over,
});

describe("DoctorDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the doctors returned by the search service", async () => {
    mocks.searchDoctors.mockResolvedValue([
      listing({ staffId: "staff-1", clinicId: "clinic-1", fullName: "Dr Nadia Lahlou" }),
      listing({ staffId: "staff-2", clinicId: "clinic-1", fullName: "Dr Sami Alaoui", specialization: "Dentistry" }),
    ]);

    renderDirectory();

    expect(await screen.findByText("Dr Nadia Lahlou")).toBeInTheDocument();
    expect(screen.getByText("Dr Sami Alaoui")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Book" })).toHaveLength(2);
  });

  it("navigates to the staff-aware booking URL from a doctor card action", async () => {
    mocks.searchDoctors.mockResolvedValue([
      listing({ staffId: "staff-1", clinicId: "clinic-1", fullName: "Dr Nadia Lahlou", specialization: "Dermatology" }),
    ]);

    renderDirectory();

    await screen.findByText("Dr Nadia Lahlou");
    await userEvent.click(screen.getByRole("button", { name: "Book" }));

    expect(mocks.navigate).toHaveBeenCalledWith("/booking/clinic-1?staffId=staff-1");
  });

  it("filters the doctor list from the search input", async () => {
    mocks.searchDoctors.mockResolvedValue([
      listing({ staffId: "staff-1", clinicId: "clinic-1", fullName: "Dr Nadia Lahlou", specialization: "Cardiology", clinicName: "Atlas Clinic", city: "Rabat" }),
      listing({ staffId: "staff-2", clinicId: "clinic-2", fullName: "Dr Karim Amrani", specialization: "Dermatology", clinicName: "Ocean Clinic", city: "Casablanca" }),
    ]);

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
