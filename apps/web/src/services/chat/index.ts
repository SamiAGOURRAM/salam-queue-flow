/**
 * Chat Service Exports
 *
 * The live chat UI talks to the chat-api agent via the `useQueueMedChat` hook
 * (AI SDK v5 `useChat` streaming). `ChatMessage` is the shared render-side type
 * consumed by `MessageBubble` and the hook's UI-message adapters.
 */
export type { ChatMessage } from "./ChatService";
