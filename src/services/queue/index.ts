/**
 * Queue Service Exports
 */

export * from './QueueService';
export * from './models/QueueModels';
export * from './events/QueueEvents';
export * from './QueueSnapshotService';

// Export singleton instance for convenience
import { QueueService } from './QueueService';
export const queueService = new QueueService();