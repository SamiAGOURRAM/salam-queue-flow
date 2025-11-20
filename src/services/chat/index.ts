/**
 * Chat Service Exports
 */
// Export types
export type { IChatService, ChatMessage, ChatContext, ChatResponse } from "./ChatService";

// Export classes
export { MockChatService } from "./MockChatService";
export { CugaChatService } from "./CugaChatService";

// Synchronous version for React components
import { MockChatService } from "./MockChatService";
import { CugaChatService } from "./CugaChatService";
import type { IChatService } from "./ChatService";

/**
 * Factory function to create the appropriate chat service
 * Uses CUGA if enabled and configured, otherwise falls back to mock
 */
export function createChatService(): IChatService {
  const useCuga = import.meta.env.VITE_CUGA_ENABLED === "true";
  const hasCugaConfig = 
    import.meta.env.VITE_CUGA_API_URL && 
    import.meta.env.VITE_CUGA_API_KEY;

  if (useCuga && hasCugaConfig) {
    try {
      return new CugaChatService();
    } catch (error) {
      console.warn("Failed to initialize CUGA service, falling back to mock:", error);
      return new MockChatService();
    }
  }

  return new MockChatService();
}

