/**
 * ApiChatService — talks to the QueueMed chat-api agent backend.
 *
 * - Sends the current Supabase session JWT as a Bearer token so the backend
 *   (and the MCP tools behind it) enforce per-user auth + RBAC guardrails.
 * - Streams the assistant's reply (text/plain) and accumulates it.
 * - Keeps a short conversation history so the agent has context.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DiscoveryCards } from "@queuemed/core";
import { IChatService, ChatMessage, ChatContext, ChatResponse } from "./ChatService";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export class ApiChatService implements IChatService {
  private apiUrl: string;
  private history: ChatMessage[] = [];
  private turns: Turn[] = [];

  constructor(apiUrl?: string) {
    const base = (apiUrl || import.meta.env.VITE_CHAT_API_URL || "http://localhost:8787").replace(/\/$/, "");
    this.apiUrl = `${base}/api/chat`;
  }

  private async getAuthToken(): Promise<string | undefined> {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token;
    } catch {
      return undefined;
    }
  }

  async sendMessage(message: string, _context?: ChatContext): Promise<ChatResponse> {
    const token = await this.getAuthToken();
    this.turns.push({ role: "user", content: message });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: this.turns }),
    });

    if (!response.ok) {
      throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
    }

    // The agent returns a JSON envelope: { message, cards? }.
    const data = (await response.json()) as { message?: string; cards?: DiscoveryCards };
    const text = data.message ?? "";
    const cards = data.cards;

    const timestamp = new Date();
    this.turns.push({ role: "assistant", content: text });
    this.history.push({ id: `${Date.now() - 1}`, text: message, sender: "user", timestamp });
    this.history.push({ id: `${Date.now()}`, text, sender: "assistant", timestamp, cards });

    return { message: text, timestamp, cards };
  }

  /**
   * Back-compat for callers that want a streaming-style API. chat-api is now
   * request/response (returns a `{ message, cards }` envelope), so this resolves
   * the full reply and emits it once via `onDelta`.
   */
  async sendMessageStream(
    message: string,
    onDelta?: (chunk: string, full: string) => void,
  ): Promise<ChatResponse> {
    const res = await this.sendMessage(message);
    onDelta?.(res.message, res.message);
    return res;
  }

  async getHistory(): Promise<ChatMessage[]> {
    return [...this.history];
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    this.turns = [];
  }
}
