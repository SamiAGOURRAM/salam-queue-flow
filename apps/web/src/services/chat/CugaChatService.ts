/**
 * CugaChatService - CUGA IBM integration
 * TODO: Implement once CUGA SDK/API is available
 * 
 * This service will integrate with CUGA (ConfigUrable Generalist Agent) from IBM
 * to provide intelligent chatbot capabilities.
 */

import { IChatService, ChatMessage, ChatContext, ChatResponse } from "./ChatService";

export class CugaChatService implements IChatService {
  private apiUrl: string;
  private apiKey: string;
  private agentId?: string;
  private history: ChatMessage[] = [];

  constructor() {
    this.apiUrl = import.meta.env.VITE_CUGA_API_URL || "http://localhost:3000/api";
    // API Key might not be needed for local server if it handles auth or is open
    this.apiKey = import.meta.env.VITE_CUGA_API_KEY || "";
    this.agentId = import.meta.env.VITE_CUGA_AGENT_ID;
  }

  async sendMessage(message: string, context?: ChatContext): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "Authorization": `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          message,
          context,
          agentId: this.agentId,
        }),
      });

      if (!response.ok) {
        throw new Error(`BeeAI Agent API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        text: data.response || data.message,
        sender: "assistant",
        timestamp: new Date(),
      };

      // Note: History management might be better handled by the caller or synchronized
      this.history.push({
        id: (Date.now() - 1).toString(),
        text: message,
        sender: "user",
        timestamp: new Date(),
      });

      this.history.push(assistantMessage);

      return {
        message: assistantMessage.text,
        timestamp: assistantMessage.timestamp,
      };
    } catch (error) {
      console.error("BeeAI Agent API error:", error);
      throw error;
    }
  }

  async getHistory(): Promise<ChatMessage[]> {
    return [...this.history];
  }

  async clearHistory(): Promise<void> {
    this.history = [];
  }
}

