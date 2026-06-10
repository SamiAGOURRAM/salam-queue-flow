/**
 * MockChatService - offline fallback used when VITE_CHAT_API_URL is not set.
 * The real agent lives in the chat-api backend (see ApiChatService).
 */
import { buildBookingHref, type DiscoveryCards } from "@queuemed/core";
import { IChatService, ChatMessage, ChatContext, ChatResponse } from "./ChatService";

/** Sample discovery cards so the card UI demos without the chat-api backend. */
function demoCards(message: string): DiscoveryCards | undefined {
  const m = message.toLowerCase();
  if (m.includes("doctor")) {
    return {
      kind: "doctor_cards",
      items: [
        {
          doctorId: "demo-staff-1",
          fullName: "Dr. Amina Benali",
          specialization: "Dermatology",
          clinicId: "demo-clinic-1",
          clinicName: "Casa Family Care",
          city: "Casablanca",
          nextAvailableSlot: { kind: "datetime", value: "2026-06-06T09:30" },
          bookingHref: buildBookingHref({ clinicId: "demo-clinic-1", staffId: "demo-staff-1" }),
        },
      ],
    };
  }
  if (m.includes("clinic")) {
    return {
      kind: "clinic_cards",
      items: [
        {
          clinicId: "demo-clinic-1",
          name: "Casa Family Care",
          specialty: "General Medicine",
          city: "Casablanca",
          bookingHref: buildBookingHref({ clinicId: "demo-clinic-1" }),
        },
      ],
    };
  }
  return undefined;
}

export class MockChatService implements IChatService {
  private history: ChatMessage[] = [];

  async sendMessage(message: string, context?: ChatContext): Promise<ChatResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock response based on message content
    let response = "I'm the QueueMed assistant (offline demo mode). Connect the chat-api backend to enable live, tool-powered answers.";

    const cards = demoCards(message);
    if (cards) {
      response = cards.kind === "doctor_cards"
        ? "Here are some doctors I found (demo data):"
        : "Here are some clinics I found (demo data):";
    } else if (message.toLowerCase().includes("hello") || message.toLowerCase().includes("hi")) {
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
      cards,
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
      cards,
    };
  }

  async getHistory(): Promise<ChatMessage[]> {
    return [...this.history];
  }

  async clearHistory(): Promise<void> {
    this.history = [];
  }
}

