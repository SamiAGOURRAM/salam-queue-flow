/**
 * DoctorCard — a clickable provider result rendered inside a chat message.
 * Tapping navigates to the code-minted booking deep link (which preselects the
 * doctor via ?staffId=) and closes the chat.
 */
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Stethoscope, Building2, MapPin, Calendar, ArrowRight } from "lucide-react";
import type { DoctorCardItem, NextAvailableSlot } from "@queuemed/core";

interface DoctorCardProps {
  item: DoctorCardItem;
  onNavigate?: () => void;
}

/** Render the discriminated next-slot union: a concrete time vs a walk-in day. */
function formatSlot(slot: NextAvailableSlot | undefined): string | null {
  if (!slot) return null;
  if (slot.kind === "datetime") return `Next: ${slot.value.replace("T", " ")}`;
  return `Walk-in: ${slot.value}`;
}

export function DoctorCard({ item, onNavigate }: DoctorCardProps) {
  const navigate = useNavigate();
  const go = () => {
    onNavigate?.();
    navigate(item.bookingHref);
  };
  const slotLabel = formatSlot(item.nextAvailableSlot);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      className="cursor-pointer p-3 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <Stethoscope className="h-4 w-4 shrink-0 text-blue-600" />
            <span className="truncate">{item.fullName}</span>
          </div>
          {item.specialization && <p className="mt-0.5 text-xs text-gray-600">{item.specialization}</p>}
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <Building2 className="h-3 w-3" />
            <span className="truncate">{item.clinicName}</span>
            {item.city && (
              <>
                <MapPin className="ml-1 h-3 w-3" />
                {item.city}
              </>
            )}
          </p>
          {slotLabel && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600">
              <Calendar className="h-3 w-3" />
              {slotLabel}
            </p>
          )}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
      </div>
    </Card>
  );
}
