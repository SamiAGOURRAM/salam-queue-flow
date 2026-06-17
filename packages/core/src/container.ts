/**
 * Service Container - Dependency Injection Container
 * 
 * This is the central place where all dependencies are wired together.
 * Apps create a container with their specific implementations of ports.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ILogger, ConsoleLogger } from './ports/logger.js';
import { IEventBus, InMemoryEventBus } from './ports/eventBus.js';
import { INotifier, NoOpNotifier } from './ports/notifier.js';

// Import services
import { BookingService } from './services/booking/BookingService.js';
import { BookingRepository } from './repositories/booking/BookingRepository.js';
import { QueueService } from './services/queue/QueueService.js';
import { QueueRepository } from './repositories/queue/QueueRepository.js';
import { ClinicService } from './services/clinic/ClinicService.js';
import { ClinicRepository } from './repositories/clinic/ClinicRepository.js';
import { PatientService } from './services/patient/PatientService.js';
import { PatientRepository } from './repositories/patient/PatientRepository.js';

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

  /**
   * Optional notifier (messaging adapter). Defaults to a no-op so core runs
   * with no provider; apps inject a real implementation (e.g. the web
   * NotificationService) to actually deliver SMS/WhatsApp/email/push.
   */
  notifier?: INotifier;
}

/**
 * Service container holding all services
 */
export interface ServiceContainer {
  // Ports (dependencies)
  readonly logger: ILogger;
  readonly eventBus: IEventBus;
  readonly notifier: INotifier;

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
  // Use provided or default implementations
  const logger = config.logger ?? new ConsoleLogger();
  const eventBus = config.eventBus ?? new InMemoryEventBus();
  const notifier = config.notifier ?? new NoOpNotifier();

  // Create repositories (Supabase adapters implementing the repository ports)
  const bookingRepository = new BookingRepository(config.supabaseClient, logger);
  const queueRepository = new QueueRepository(config.supabaseClient, logger);
  const clinicRepository = new ClinicRepository(config.supabaseClient, logger);
  const patientRepository = new PatientRepository(config.supabaseClient, logger);

  // Create services
  const bookingService = new BookingService(bookingRepository, eventBus, logger);
  const queueService = new QueueService(queueRepository, eventBus, logger);
  const clinicService = new ClinicService(clinicRepository, logger);
  const patientService = new PatientService(patientRepository, logger);

  return {
    logger,
    eventBus,
    notifier,
    booking: bookingService,
    queue: queueService,
    clinic: clinicService,
    patient: patientService,
  };
}

