/**
 * ChatWindow - Chat interface component
 * Slides up from bottom right when opened
 */
import { useState, useRef, useEffect } from "react";
import { Send, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { BookingConfirmCard } from "./BookingConfirmCard";
import type { ChatMessage } from "@/services/chat";
import { useQueueMedChat, readMessage } from "@/services/chat/useQueueMedChat";

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

const GREETING: ChatMessage = {
  id: "greeting",
  text: "Hello! I'm your AI assistant. How can I help you today?",
  sender: "assistant",
  timestamp: new Date(),
};

export function ChatWindow({ isOpen, onClose }: ChatWindowProps) {
  const { messages, sendMessage, status, addToolResult } = useQueueMedChat();

  const [inputValue, setInputValue] = useState("");
  const isLoading = status === "submitted" || status === "streaming";
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when window opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    const text = inputValue;
    setInputValue("");
    void sendMessage({ text });
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-6 z-50 w-96 h-[600px] flex flex-col bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <h3 className="font-semibold">AI Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-white hover:bg-white/20"
            aria-label="Minimize chat"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-white hover:bg-white/20"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          <MessageBubble message={GREETING} />
          {messages.map((m) => {
            const { text, cards, bookingCalls } = readMessage(m);
            if (m.role === "assistant" && text.trim() === "" && !cards && bookingCalls.length === 0) return null;
            return (
              <div key={m.id} className="flex w-full flex-col gap-1">
                {(text.trim() !== "" || cards) && (
                  <MessageBubble
                    message={{ id: m.id, text, sender: m.role === "user" ? "user" : "assistant", timestamp: new Date(), cards }}
                    onCardNavigate={onClose}
                  />
                )}
                {bookingCalls.map((bc) => (
                  <BookingConfirmCard
                    key={bc.toolCallId}
                    call={bc}
                    onDecide={(approved) =>
                      addToolResult({ tool: bc.toolName, toolCallId: bc.toolCallId, output: { approved } })
                    }
                  />
                ))}
              </div>
            );
          })}
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="flex gap-1">
                <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-sm">AI is thinking...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Powered by QueueMed AI
        </p>
      </div>
    </div>
  );
}

