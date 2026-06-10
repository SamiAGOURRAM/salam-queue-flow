/**
 * DiscoveryCardsView — renders a DiscoveryCards payload as a list of clickable
 * doctor or clinic cards. Discriminates on `kind` so each item gets the right card.
 */
import type { DiscoveryCards } from "@queuemed/core";
import { ClinicCard } from "./ClinicCard";
import { DoctorCard } from "./DoctorCard";

interface DiscoveryCardsViewProps {
  cards: DiscoveryCards;
  /** Called before navigating (e.g. to close the chat window). */
  onNavigate?: () => void;
}

export function DiscoveryCardsView({ cards, onNavigate }: DiscoveryCardsViewProps) {
  return (
    <div className="mt-2 space-y-2">
      {cards.kind === "doctor_cards"
        ? cards.items.map((item) => <DoctorCard key={item.doctorId} item={item} onNavigate={onNavigate} />)
        : cards.items.map((item) => <ClinicCard key={item.clinicId} item={item} onNavigate={onNavigate} />)}
    </div>
  );
}
