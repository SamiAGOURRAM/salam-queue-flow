/**
 * MessageBubble - Individual chat message component
 */
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
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
    </div>
  );
}

