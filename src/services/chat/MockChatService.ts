/**
 * MockChatService - Mock implementation for development/testing
 * This will be replaced with CugaChatService once CUGA is integrated
 */
import { IChatService, ChatMessage, ChatContext, ChatResponse } from "./ChatService";

export class MockChatService implements IChatService {
  private history: ChatMessage[] = [];

  async sendMessage(message: string, context?: ChatContext): Promise<ChatResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock response based on message content
    let response = "I'm a mock AI assistant. CUGA integration is coming soon!";
    
    if (message.toLowerCase().includes("hello") || message.toLowerCase().includes("hi")) {
      response = "Hello! How can I help you with your queue management today?";
    } else if (message.toLowerCase().includes("appointment")) {
      response = "I can help you with appointments. Would you like to book a new appointment or check an existing one?";
    } else if (message.toLowerCase().includes("queue")) {
      response = "I can help you understand the queue system. What would you like to know?";
    } else if (message.toLowerCase().includes("help")) {
      response = "I'm here to help! I can assist with:\n- Booking appointments\n- Understanding the queue\n- Clinic information\n- General questions";
    }

    const assistantMessage: ChatMessage = {
      id: Date.now().toString(),
      text: response,
      sender: "assistant",
      timestamp: new Date(),
    };

    this.history.push({
      id: (Date.now() - 1).toString(),
      text: message,
      sender: "user",
      timestamp: new Date(),
    });

    this.history.push(assistantMessage);

    return {
      message: response,
      timestamp: new Date(),
    };
  }

  async getHistory(): Promise<ChatMessage[]> {
    return [...this.history];
  }

  async clearHistory(): Promise<void> {
    this.history = [];
  }
}

