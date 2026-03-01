import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { schedules } from '../db/schema.js';
import { snapshotService } from './snapshot.service.js';
import type { InferSelectModel } from 'drizzle-orm';

type Schedule = InferSelectModel<typeof schedules>;

class SchedulerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  async initializeFromDatabase(): Promise<void> {
    const enabled = await db.select().from(schedules).where(eq(schedules.isEnabled, true));
    for (const schedule of enabled) {
      this.register(schedule);
    }
    console.log(`Scheduler: loaded ${enabled.length} active schedules`);
  }

  register(schedule: Schedule): void {
    if (this.jobs.has(schedule.id)) {
      this.jobs.get(schedule.id)!.stop();
    }

    if (!cron.validate(schedule.cronExpression)) {
      console.warn(`Invalid cron expression for schedule ${schedule.id}: ${schedule.cronExpression}`);
      return;
    }

    const task = cron.schedule(
      schedule.cronExpression,
      async () => {
        try {
          const snapshotId = await snapshotService.triggerSnapshot(
            schedule.serverId,
            schedule.storageRemoteId,
            'scheduled',
            schedule.id,
          );
          await db
            .update(schedules)
            .set({ lastRunAt: new Date(), lastRunStatus: 'running', lastSnapshotId: snapshotId })
            .where(eq(schedules.id, schedule.id));
        } catch (err) {
          console.error(`Scheduled snapshot failed for schedule ${schedule.id}:`, err);
          await db
            .update(schedules)
            .set({ lastRunAt: new Date(), lastRunStatus: 'failed' })
            .where(eq(schedules.id, schedule.id));
        }
      },
      { timezone: 'UTC' },
    );

    this.jobs.set(schedule.id, task);
  }

  unregister(scheduleId: string): void {
    const task = this.jobs.get(scheduleId);
    if (task) {
      task.stop();
      this.jobs.delete(scheduleId);
    }
  }

  get activeCount(): number {
    return this.jobs.size;
  }
}

export const schedulerService = new SchedulerService();
