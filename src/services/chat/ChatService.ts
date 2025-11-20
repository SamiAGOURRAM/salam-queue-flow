/**
 * ChatService - Interface for chatbot communication
 * This abstract interface allows for easy swapping between different AI providers
 */

export interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

export interface ChatContext {
  userId?: string;
  userRole?: "patient" | "staff" | "clinic_owner";
  currentRoute?: string;
  clinicId?: string;
  // Add more context as needed
}

export interface ChatResponse {
  message: string;
  timestamp: Date;
}

export interface IChatService {
  /**
   * Send a message to the chatbot
   * @param message User's message
   * @param context Optional context about the user and current state
   * @returns Assistant's response
   */
  sendMessage(message: string, context?: ChatContext): Promise<ChatResponse>;

  /**
   * Get chat history (if persisted)
   * @returns Array of previous messages
   */
  getHistory(): Promise<ChatMessage[]>;

  /**
   * Clear chat history
   */
  clearHistory(): Promise<void>;
}

