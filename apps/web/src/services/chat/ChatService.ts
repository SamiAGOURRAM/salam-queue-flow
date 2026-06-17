/**
 * Shared chat message shape used by the chat UI (MessageBubble) and the
 * `useQueueMedChat` UI-message adapters. The live transport is AI SDK v5
 * `useChat` (see useQueueMedChat.ts) — this is just the render-side type.
 */
import type { DiscoveryCards } from "@queuemed/core";

export interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
  /** Optional structured discovery cards rendered as clickable doctor/clinic cards. */
  cards?: DiscoveryCards;
}
