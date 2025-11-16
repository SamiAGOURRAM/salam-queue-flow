/**
 * Event Bus for Domain Event Communication
 * Implements pub/sub pattern for loose coupling between services
 */

import { logger } from '../logging/Logger';

export interface DomainEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  userId?: string;
  clinicId?: string;
  payload: Record<string, unknown>;
}

type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

interface Subscription {
  eventType: string;
  handler: EventHandler;
  id: string;
}

class EventBus {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private eventHistory: DomainEvent[] = [];
  private maxHistorySize = 100;

  /**
   * Subscribe to an event type
   * @returns Unsubscribe function
   */
  subscribe<T extends DomainEvent = DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): () => void {
    const subscription: Subscription = {
      eventType,
      handler: handler as EventHandler,
      id: this.generateSubscriptionId(),
    };

    const handlers = this.subscriptions.get(eventType) || [];
    handlers.push(subscription);
    this.subscriptions.set(eventType, handlers);

    // Only log subscriptions in verbose mode to reduce noise
    // logger.debug(`Subscribed to event: ${eventType}`, { subscriptionId: subscription.id });

    // Return unsubscribe function
    return () => {
      this.unsubscribe(eventType, subscription.id);
    };
  }

  /**
   * Unsubscribe from an event
   */
  private unsubscribe(eventType: string, subscriptionId: string): void {
    const handlers = this.subscriptions.get(eventType) || [];
    const filtered = handlers.filter(sub => sub.id !== subscriptionId);
    
    if (filtered.length > 0) {
      this.subscriptions.set(eventType, filtered);
    } else {
      this.subscriptions.delete(eventType);
    }

    // Only log unsubscriptions in verbose mode to reduce noise
    // logger.debug(`Unsubscribed from event: ${eventType}`, { subscriptionId });
  }

  /**
   * Publish an event to all subscribers
   */
  async publish<T extends DomainEvent = DomainEvent>(event: T): Promise<void> {
    // Add to history
    this.addToHistory(event);

    const handlers = this.subscriptions.get(event.eventType) || [];

    logger.info(`Publishing event: ${event.eventType}`, {
      eventId: event.eventId,
      subscriberCount: handlers.length,
    });

    if (handlers.length === 0) {
      logger.warn(`No subscribers for event: ${event.eventType}`, { eventId: event.eventId });
      return;
    }

    // Execute all handlers (in parallel for better performance)
    const promises = handlers.map(async (subscription) => {
      try {
        await subscription.handler(event);
        logger.debug(`Event handler executed successfully`, {
          eventType: event.eventType,
          eventId: event.eventId,
          subscriptionId: subscription.id,
        });
      } catch (error) {
        logger.error(
          `Event handler failed for ${event.eventType}`,
          error as Error,
          {
            eventId: event.eventId,
            subscriptionId: subscription.id,
          }
        );
        // Don't throw - we want other handlers to continue
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get all subscriptions for an event type
   */
  getSubscribers(eventType: string): number {
    return this.subscriptions.get(eventType)?.length || 0;
  }

  /**
   * Get event history (useful for debugging)
   */
  getEventHistory(limit?: number): DomainEvent[] {
    return limit ? this.eventHistory.slice(-limit) : [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Clear all subscriptions (useful for testing)
   */
  clearAllSubscriptions(): void {
    this.subscriptions.clear();
    logger.info('All event subscriptions cleared');
  }

  /**
   * Add event to history with size management
   */
  private addToHistory(event: DomainEvent): void {
    this.eventHistory.push(event);
    
    // Keep history size under control
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate unique event ID
   */
  static generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// Export both the class and singleton instance
export const eventBus = new EventBus();
export { EventBus };
