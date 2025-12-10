/**
 * Event Bus Port - Interface for event-driven communication
 * 
 * This abstracts the event bus implementation.
 * Services publish domain events through this interface.
 */

export interface DomainEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  userId?: string;
  clinicId?: string;
  payload: Record<string, unknown>;
}

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

export interface IEventBus {
  /**
   * Publish an event
   */
  publish<T extends DomainEvent>(event: T): Promise<void>;
  
  /**
   * Subscribe to events of a specific type
   */
  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): () => void;
  
  /**
   * Generate a unique event ID
   */
  generateEventId(): string;
}

/**
 * In-memory event bus implementation (default)
 */
export class InMemoryEventBus implements IEventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  
  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const eventHandlers = this.handlers.get(event.eventType);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${event.eventType}:`, error);
        }
      }
    }
  }
  
  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);
    
    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler as EventHandler);
    };
  }
  
  generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * No-op event bus for testing
 */
export class NoOpEventBus implements IEventBus {
  async publish(): Promise<void> {}
  subscribe(): () => void { return () => {}; }
  generateEventId(): string { return 'test-event-id'; }
}

