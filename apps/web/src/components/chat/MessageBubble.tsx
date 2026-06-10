/**
 * MessageBubble - Individual chat message component
 */
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/services/chat";
import { DiscoveryCardsView } from "./DiscoveryCardsView";

interface MessageBubbleProps {
  message: ChatMessage;
  /** Called when a discovery card is tapped (e.g. to close the chat before navigating). */
  onCardNavigate?: () => void;
}

export function MessageBubble({ message, onCardNavigate }: MessageBubbleProps) {
  const isUser = message.sender === "user";

  return (
    <div className={cn("flex w-full flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2 shadow-sm",
          isUser
            ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
            : "bg-gray-100 text-gray-900"
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-words">
          {message.text}
        </p>
        <p
          className={cn(
            "text-xs mt-1",
            isUser ? "text-blue-100" : "text-gray-500"
          )}
        >
          {format(message.timestamp, "HH:mm")}
        </p>
      </div>

      {message.cards && (
        <div className="mt-1 w-[90%]">
          <DiscoveryCardsView cards={message.cards} onNavigate={onCardNavigate} />
        </div>
      )}
    </div>
  );
}
