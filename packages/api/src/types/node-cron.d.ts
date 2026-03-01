declare module 'node-cron' {
  interface ScheduledTask {
    stop(): void;
    start(): void;
    destroy(): void;
  }

  interface ScheduleOptions {
    timezone?: string;
    scheduled?: boolean;
    name?: string;
  }

  function schedule(
    expression: string,
    func: () => void | Promise<void>,
    options?: ScheduleOptions,
  ): ScheduledTask;

  function validate(expression: string): boolean;
}
