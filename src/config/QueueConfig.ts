/**
 * Queue System Configuration
 * 
 * This file defines the SYSTEM DEFAULTS for queue management.
 * These values are used when a clinic has not overridden them in their specific settings.
 * 
 * Hierarchy:
 * 1. Clinic Database Settings (clinics.settings JSONB)
 * 2. System Defaults (this file)
 */

export const QueueConfig = {
    // Timeouts and Thresholds
    DEFAULTS: {
        /**
         * How many minutes a patient can be late before being marked as "Late"
         * Late patients may be converted to "Walk-in" priority depending on clinic policy.
         */
        LATE_ARRIVAL_THRESHOLD_MINUTES: 10,

        /**
         * How many minutes an appointment can run over before it triggers a "Disruption" event
         * and recalculates wait times for subsequent patients.
         */
        APPOINTMENT_RUN_OVER_THRESHOLD_MINUTES: 10,

        /**
         * Default duration (in minutes) for an appointment if not specified.
         */
        DEFAULT_APPOINTMENT_DURATION_MINUTES: 15,

        /**
         * Time window (in days) to look back for historical data when estimating wait times.
         */
        HISTORICAL_DATA_LOOKBACK_DAYS: 30,

        /**
         * Minimum confidence score (0-1) required to use an ML prediction.
         * If below this, the system falls back to rule-based estimation.
         */
        ML_CONFIDENCE_THRESHOLD: 0.3,

        /**
         * How often (in minutes) the system checks for running-over appointments.
         */
        PERIODIC_CHECK_INTERVAL_MINUTES: 5,
    },

    // System Limits (Not overridable by clinics for safety)
    SYSTEM: {
        /**
         * Maximum number of disruption events to keep in memory per clinic for debouncing.
         */
        MAX_DISRUPTION_BUFFER_SIZE: 10,

        /**
         * Debounce time (in ms) for recalculating wait times.
         * Prevents thrashing the DB if multiple updates happen in quick succession.
         */
        RECALCULATION_DEBOUNCE_MS: 2000,

        /**
         * Cache TTL (in ms) for wait time estimates.
         */
        ESTIMATION_CACHE_TTL_MS: 30000,

        /**
         * Batch size for processing appointments to avoid DB timeouts.
         */
        BATCH_PROCESS_SIZE: 50,
    }
} as const;

export type QueueConfigType = typeof QueueConfig;
