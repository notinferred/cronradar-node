/**
 * CronRadar Node.js SDK TypeScript Definitions
 */

export interface PingOptions {
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
 * Ping CronRadar to indicate your job has run successfully.
 * Optionally provide schedule for self-healing (auto-registration on 404).
 *
 * @param monitorKey - The monitor key identifying your job
 * @param options - Optional configuration
 * @returns Promise that resolves when ping is complete
 */
export function ping(monitorKey: string, options?: PingOptions): Promise<void>;

/**
 * Register a monitor with CronRadar, setting up expectations for when it should run.
 * Used by extensions to sync discovered jobs.
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
