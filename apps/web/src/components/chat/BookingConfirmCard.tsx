/**
 * BookingConfirmCard — the human-in-the-loop gate for a chat-initiated mutation.
 *
 * `booking_create` / `booking_cancel` arrive from the agent as un-executed tool
 * calls. This card surfaces the action with explicit Confirm / Cancel buttons;
 * only on Confirm does the server actually run the booking (via `addToolResult`
 * → auto-resubmit). Nothing mutates without this click.
 */
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck, CalendarX, Check, X } from "lucide-react";
import type { BookingCall } from "@/services/chat/useQueueMedChat";

interface BookingConfirmCardProps {
  call: BookingCall;
  onDecide: (approved: boolean) => void;
}

function field(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

export function BookingConfirmCard({ call, onDecide }: BookingConfirmCardProps) {
  const isCancel = call.toolName === "booking_cancel";
  const Icon = isCancel ? CalendarX : CalendarCheck;
  const title = isCancel ? "Cancel appointment?" : "Confirm booking?";

  const date = field(call.input, "appointmentDate");
  const time = field(call.input, "scheduledTime");
  const type = field(call.input, "appointmentType");
  const reason = field(call.input, "reasonForVisit") ?? field(call.input, "reason");

  return (
    <Card className="mt-2 border-blue-200 bg-blue-50/60 p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <Icon className={isCancel ? "h-4 w-4 text-rose-600" : "h-4 w-4 text-blue-600"} />
        {title}
      </div>

      <dl className="mt-2 space-y-0.5 text-xs text-gray-600">
        {date && <div><span className="text-gray-400">Date:</span> {date}{time ? ` · ${time}` : ""}</div>}
        {type && <div><span className="text-gray-400">Type:</span> {type}</div>}
        {reason && <div><span className="text-gray-400">Reason:</span> {reason}</div>}
      </dl>

      {call.decided ? (
        <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${call.approved ? "text-emerald-600" : "text-gray-500"}`}>
          {call.approved ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          {call.approved ? (isCancel ? "Cancellation confirmed" : "Booking confirmed") : "Dismissed"}
        </p>
      ) : (
        <div className="mt-2.5 flex gap-2">
          <Button
            size="sm"
            className="h-8 flex-1 bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => onDecide(true)}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            {isCancel ? "Cancel it" : "Confirm"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => onDecide(false)}>
            <X className="mr-1 h-3.5 w-3.5" />
            Keep it
          </Button>
        </div>
      )}
    </Card>
  );
}
