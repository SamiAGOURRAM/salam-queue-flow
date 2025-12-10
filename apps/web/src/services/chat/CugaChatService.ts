/**
 * CugaChatService - CUGA IBM integration
 * 
 * This service integrates with CUGA (ConfigUrable Generalist Agent) from IBM
 * to provide intelligent chatbot capabilities with QueueMed tools.
 * 
 * CUGA Server API:
 * - POST /stream - Main streaming endpoint for chat queries
 * - POST /stop - Stop current agent execution
 * - POST /reset - Reset agent state
 */

import { IChatService, ChatMessage, ChatContext, ChatResponse } from "./ChatService";

interface CugaStreamEvent {
  name: string;
  data: string;
}

export class CugaChatService implements IChatService {
  private apiUrl: string;
  private history: ChatMessage[] = [];

  constructor() {
    // CUGA server runs on port 8005 by default
    this.apiUrl = import.meta.env.VITE_CUGA_API_URL || "http://localhost:8005";
  }

  /**
   * Parse Server-Sent Events (SSE) data from CUGA stream
   */
  private parseSSEEvent(eventStr: string): CugaStreamEvent | null {
    const lines = eventStr.trim().split('\n');
    let name = '';
    let data = '';
    
    for (const line of lines) {
      if (line.startsWith('event:')) {
        name = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data = line.slice(5).trim();
      }
    }
    
    if (name || data) {
      return { name, data };
    }
    return null;
  }

  /**
   * Extract the final answer from CUGA stream events
   */
  private extractAnswer(events: CugaStreamEvent[]): string {
    // Look for the Answer event which contains the final response
    for (const event of events) {
      if (event.name === 'Answer') {
        try {
          // CUGA may return JSON with {data: string, variables: object}
          const parsed = JSON.parse(event.data);
          if (typeof parsed === 'object' && parsed.data) {
            return parsed.data;
          }
          return event.data;
        } catch {
          // If not JSON, return as-is
          return event.data;
        }
      }
    }
    
    // If no Answer event, look for the last meaningful event
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.name !== 'tool_call' && event.data && event.data !== 'Done.') {
        return event.data;
      }
    }
    
    return "I processed your request but couldn't generate a response.";
  }

  async sendMessage(message: string, context?: ChatContext): Promise<ChatResponse> {
    try {
      // Build enriched query with context if available
      let enrichedMessage = message;
      if (context) {
        const contextParts: string[] = [];
        if (context.userRole) {
          contextParts.push(`User role: ${context.userRole}`);
        }
        if (context.userId) {
          contextParts.push(`User ID: ${context.userId}`);
        }
        if (context.clinicId) {
          contextParts.push(`Current clinic: ${context.clinicId}`);
        }
        if (contextParts.length > 0) {
          enrichedMessage = `[Context: ${contextParts.join(', ')}] ${message}`;
        }
      }

      // Call CUGA stream endpoint
      const response = await fetch(`${this.apiUrl}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: enrichedMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(`CUGA API error: ${response.status} ${response.statusText}`);
      }

      // Read the SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      const decoder = new TextDecoder();
      const events: CugaStreamEvent[] = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // SSE events are separated by double newlines
        const eventStrings = buffer.split('\n\n');
        buffer = eventStrings.pop() || ''; // Keep incomplete event in buffer

        for (const eventStr of eventStrings) {
          if (eventStr.trim()) {
            const event = this.parseSSEEvent(eventStr);
            if (event) {
              events.push(event);
              console.log('[CUGA Event]', event.name, event.data?.substring(0, 100));
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const event = this.parseSSEEvent(buffer);
        if (event) {
          events.push(event);
        }
      }

      // Extract the answer from events
      const answerText = this.extractAnswer(events);
      
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        text: answerText,
        sender: "assistant",
        timestamp: new Date(),
      };

      // Update history
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
      console.error("CUGA API error:", error);
      throw error;
    }
  }

  /**
   * Stop current agent execution
   */
  async stopExecution(): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/stop`, {
        method: "POST",
      });
    } catch (error) {
      console.error("Failed to stop CUGA execution:", error);
    }
  }

  /**
   * Reset agent state
   */
  async resetAgent(): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/reset`, {
        method: "POST",
      });
      this.history = [];
    } catch (error) {
      console.error("Failed to reset CUGA agent:", error);
    }
  }

  async getHistory(): Promise<ChatMessage[]> {
    return [...this.history];
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    // Also reset the CUGA agent state
    await this.resetAgent();
  }
}

