/**
 * Queue Service Exports
 */

export * from './QueueService';
export * from './models/QueueModels';
export * from './events/QueueEvents';
export * from './QueueSnapshotService';
export * from './ManualOverridesService';
export * from './WaitlistService';
export * from './GapManagerService';

// Export singleton instance for convenience
import { QueueService } from './QueueService';
export const queueService = new QueueService();
