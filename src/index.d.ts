/**
 * CronRadar Node.js SDK TypeScript Definitions
 */

export interface MonitorOptions {
  /**
   * Cron expression for auto-registration if monitor doesn't exist
   */
  schedule?: string;

  /**
   * Grace period in seconds for auto-registration
   */
  gracePeriod?: number;
}

export interface SyncOptions {
  /**
   * Source framework (e.g., "bull", "agenda"). Auto-detected if not provided.
   */
  source?: string;

  /**
   * Human-readable name. Generated from key if not provided.
   */
  name?: string;

  /**
   * Grace period in seconds before alerting (default: 60)
   */
  gracePeriod?: number;
}

/**
 * Monitor a job execution by recording it in CronRadar.
 * Optionally provide schedule for self-healing (auto-registration on 404).
 *
 * @param monitorKey - The monitor key identifying your job
 * @param options - Optional configuration
 * @returns Promise that resolves when monitoring is complete
 */
export function monitor(monitorKey: string, options?: MonitorOptions): Promise<void>;

/**
 * Signal that a job has started executing.
 * Used for lifecycle tracking to detect hung jobs and measure execution duration.
 *
 * @param monitorKey - The monitor key identifying your job
 * @param options - Optional configuration (schedule for auto-registration)
 */
export function startJob(monitorKey: string, options?: MonitorOptions): Promise<void>;

/**
 * Signal that a job has completed successfully.
 * Used for lifecycle tracking to record completion time and calculate duration.
 *
 * @param monitorKey - The monitor key identifying your job
 */
export function completeJob(monitorKey: string): Promise<void>;

/**
 * Signal that a job has failed. Triggers immediate alerts without waiting for grace period.
 *
 * @param monitorKey - The monitor key identifying your job
 * @param message - Optional failure message for debugging
 */
export function failJob(monitorKey: string, message?: string | null): Promise<void>;

/**
 * Wrap an async function with automatic lifecycle monitoring.
 * Handles start/complete/fail signals automatically.
 *
 * @param monitorKey - The monitor key identifying your job
 * @param func - The async function to wrap
 * @param options - Optional configuration (schedule for auto-registration)
 * @returns Wrapped function with the same call signature
 */
export function wrap<TArgs extends unknown[], TReturn>(
  monitorKey: string,
  func: (...args: TArgs) => Promise<TReturn> | TReturn,
  options?: MonitorOptions
): (...args: TArgs) => Promise<TReturn>;

/**
 * Pre-register a monitor with CronRadar, setting up expectations for when it should run.
 * Used internally by extensions to sync discovered jobs. Advanced usage only.
 *
 * @param monitorKey - The unique identifier for this monitor
 * @param schedule - Cron expression defining when the job runs
 * @param options - Optional configuration
 * @returns Promise that resolves when sync is complete
 */
export function syncMonitor(
  monitorKey: string,
  schedule: string,
  options?: SyncOptions
): Promise<void>;
