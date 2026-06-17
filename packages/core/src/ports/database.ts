/**
 * Database Adapter — removed.
 *
 * Repositories now accept SupabaseClient directly. The true hexagonal ports
 * are the repository interfaces (IBookingRepository, IClinicRepository, etc.)
 * in ./repositories/ — swap databases by writing new adapters that implement
 * those interfaces.
 *
 * This file intentionally left empty so that existing import paths
 * (import { IDatabaseClient } from '.../ports/database.js') produce a clear
 * compile error pointing to this explanation.
 */

