/**
 * Chat Service Exports
 */
// Export types
export type { IChatService, ChatMessage, ChatContext, ChatResponse } from "./ChatService";

// Export classes
export { MockChatService } from "./MockChatService";
export { ApiChatService } from "./ApiChatService";

import { MockChatService } from "./MockChatService";
import { ApiChatService } from "./ApiChatService";
import type { IChatService } from "./ChatService";

/**
 * Factory: use the real chat-api agent backend when a URL is configured,
 * otherwise fall back to the offline mock responder.
 */
export function createChatService(): IChatService {
  const apiUrl = import.meta.env.VITE_CHAT_API_URL;

  if (apiUrl) {
    try {
      return new ApiChatService(apiUrl);
    } catch (error) {
      console.warn("Failed to initialize ApiChatService, falling back to mock:", error);
      return new MockChatService();
    }
  }

  return new MockChatService();
}
