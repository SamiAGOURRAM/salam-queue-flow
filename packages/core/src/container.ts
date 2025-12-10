/**
 * Service Container - Dependency Injection Container
 * 
 * This is the central place where all dependencies are wired together.
 * Apps create a container with their specific implementations of ports.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { 
  IDatabaseClient, 
  SupabaseAdapter 
} from './ports/database';
import { 
  ILogger, 
  ConsoleLogger 
} from './ports/logger';
import { 
  IEventBus, 
  InMemoryEventBus 
} from './ports/eventBus';

// Import services (will be created next)
import { BookingService } from './services/booking/BookingService';
import { BookingRepository } from './repositories/booking/BookingRepository';
import { QueueService } from './services/queue/QueueService';
import { QueueRepository } from './repositories/queue/QueueRepository';
import { ClinicService } from './services/clinic/ClinicService';
import { ClinicRepository } from './repositories/clinic/ClinicRepository';
import { PatientService } from './services/patient/PatientService';
import { PatientRepository } from './repositories/patient/PatientRepository';

/**
 * Container configuration
 */
export interface ContainerConfig {
  /**
   * Supabase client instance
   */
  supabaseClient: SupabaseClient;
  
  /**
   * Optional custom logger
   */
  logger?: ILogger;
  
  /**
   * Optional custom event bus
   */
  eventBus?: IEventBus;
}

/**
 * Service container holding all services
 */
export interface ServiceContainer {
  // Ports (dependencies)
  readonly db: IDatabaseClient;
  readonly logger: ILogger;
  readonly eventBus: IEventBus;
  
  // Services
  readonly booking: BookingService;
  readonly queue: QueueService;
  readonly clinic: ClinicService;
  readonly patient: PatientService;
}

/**
 * Create a fully configured service container
 * 
 * @example
 * // In web app (React)
 * import { createClient } from '@supabase/supabase-js';
 * import { createServiceContainer } from '@queuemed/core';
 * 
 * const supabase = createClient(url, key);
 * const services = createServiceContainer({ supabaseClient: supabase });
 * 
 * // Use services
 * const slots = await services.booking.getAvailableSlotsForMode(clinicId, date);
 * 
 * @example
 * // In MCP server (Node.js)
 * import { createClient } from '@supabase/supabase-js';
 * import { createServiceContainer } from '@queuemed/core';
 * 
 * const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
 * const services = createServiceContainer({ supabaseClient: supabase });
 * 
 * // Use same services!
 * const slots = await services.booking.getAvailableSlotsForMode(clinicId, date);
 */
export function createServiceContainer(config: ContainerConfig): ServiceContainer {
  // Create database adapter
  const db = new SupabaseAdapter(config.supabaseClient);
  
  // Use provided or default implementations
  const logger = config.logger ?? new ConsoleLogger();
  const eventBus = config.eventBus ?? new InMemoryEventBus();
  
  // Create repositories
  const bookingRepository = new BookingRepository(db, logger);
  const queueRepository = new QueueRepository(db, logger);
  const clinicRepository = new ClinicRepository(db, logger);
  const patientRepository = new PatientRepository(db, logger);
  
  // Create services
  const bookingService = new BookingService(bookingRepository, eventBus, logger);
  const queueService = new QueueService(queueRepository, eventBus, logger);
  const clinicService = new ClinicService(clinicRepository, logger);
  const patientService = new PatientService(patientRepository, logger);
  
  return {
    db,
    logger,
    eventBus,
    booking: bookingService,
    queue: queueService,
    clinic: clinicService,
    patient: patientService,
  };
}

