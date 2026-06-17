/**
 * Repository Ports — contracts for data access.
 * 
 * These are the true hexagonal-architecture ports. Each interface captures
 * the public methods of the corresponding domain repository, enabling any
 * database backend (Supabase, MySQL, raw PostgreSQL, etc.) to be swapped in
 * by writing a new adapter that implements the interface.
 */

export type { IBookingRepository, ClinicDetails } from './IBookingRepository.js';
export type { IQueueRepository } from './IQueueRepository.js';
export type { IClinicRepository, ClinicSearchParams } from './IClinicRepository.js';
export type { IPatientRepository } from './IPatientRepository.js';
