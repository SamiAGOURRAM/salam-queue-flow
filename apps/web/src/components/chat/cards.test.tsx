import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildBookingHref, type DiscoveryCards } from "@queuemed/core";
import { DiscoveryCardsView } from "./DiscoveryCardsView";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});

describe("DiscoveryCardsView", () => {
  it("renders clinic cards and navigates to the code-minted bookingHref on click", async () => {
    mocks.navigate.mockClear();
    const onNavigate = vi.fn();
    const cards: DiscoveryCards = {
      kind: "clinic_cards",
      items: [
        {
          clinicId: "c1",
          name: "Casa Family Care",
          specialty: "Dermatologie",
          city: "Casablanca",
          bookingHref: buildBookingHref({ clinicId: "c1" }),
        },
      ],
    };

    render(<DiscoveryCardsView cards={cards} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Casa Family Care"));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/booking/c1");
  });

  it("renders a doctor card and distinguishes a walk-in (day) slot from a datetime", async () => {
    mocks.navigate.mockClear();
    const cards: DiscoveryCards = {
      kind: "doctor_cards",
      items: [
        {
          doctorId: "s1",
          fullName: "Dr. Amina",
          specialization: "Dermatology",
          clinicId: "c1",
          clinicName: "Casa Family Care",
          city: "Casablanca",
          nextAvailableSlot: { kind: "day", value: "2026-06-10" },
          bookingHref: buildBookingHref({ clinicId: "c1", staffId: "s1" }),
        },
      ],
    };

    render(<DiscoveryCardsView cards={cards} />);
    expect(screen.getByText("Dr. Amina")).toBeTruthy();
    expect(screen.getByText(/Walk-in: 2026-06-10/)).toBeTruthy();

    await userEvent.click(screen.getByText("Dr. Amina"));
    expect(mocks.navigate).toHaveBeenCalledWith("/booking/c1?staffId=s1");
  });
});
