import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import cron from 'node-cron';
import { db } from '../db/index.js';
import { schedules } from '../db/schema.js';
import { schedulerService } from '../services/scheduler.service.js';
import { snapshotService } from '../services/snapshot.service.js';

const CreateScheduleSchema = z.object({
  serverId: z.string().uuid(),
  storageRemoteId: z.string().uuid(),
  cronExpression: z.string().refine((v) => cron.validate(v), { message: 'Invalid cron expression' }),
  label: z.string().optional(),
  isEnabled: z.boolean().default(true),
});

export const schedulesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /schedules
  fastify.get('/', async () => {
    return db.select().from(schedules);
  });

  // GET /schedules/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, req.params.id));
    if (!schedule) return reply.code(404).send({ error: 'Schedule not found' });
    return schedule;
  });

  // POST /schedules
  fastify.post('/', async (req, reply) => {
    const body = CreateScheduleSchema.parse(req.body);
    const id = uuidv4();
    const now = new Date();

    await db.insert(schedules).values({
      id,
      serverId: body.serverId,
      storageRemoteId: body.storageRemoteId,
      cronExpression: body.cronExpression,
      label: body.label,
      isEnabled: body.isEnabled,
      createdAt: now,
      updatedAt: now,
    });

    if (body.isEnabled) {
      const [schedule] = await db.select().from(schedules).where(eq(schedules.id, id));
      schedulerService.register(schedule);
    }

    reply.code(201);
    return { id };
  });

  // PUT /schedules/:id
  fastify.put<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const body = CreateScheduleSchema.partial().parse(req.body);
    const [existing] = await db.select().from(schedules).where(eq(schedules.id, req.params.id));
    if (!existing) return reply.code(404).send({ error: 'Schedule not found' });

    await db.update(schedules).set({
      ...(body.serverId !== undefined && { serverId: body.serverId }),
      ...(body.storageRemoteId !== undefined && { storageRemoteId: body.storageRemoteId }),
      ...(body.cronExpression !== undefined && { cronExpression: body.cronExpression }),
      ...(body.label !== undefined && { label: body.label }),
      ...(body.isEnabled !== undefined && { isEnabled: body.isEnabled }),
      updatedAt: new Date(),
    }).where(eq(schedules.id, req.params.id));

    // Re-register with updated config
    const [updated] = await db.select().from(schedules).where(eq(schedules.id, req.params.id));
    if (updated.isEnabled) {
      schedulerService.register(updated);
    } else {
      schedulerService.unregister(req.params.id);
    }

    return { success: true };
  });

  // DELETE /schedules/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const [existing] = await db.select().from(schedules).where(eq(schedules.id, req.params.id));
    if (!existing) return reply.code(404).send({ error: 'Schedule not found' });

    schedulerService.unregister(req.params.id);
    await db.delete(schedules).where(eq(schedules.id, req.params.id));
    return { success: true };
  });

  // POST /schedules/:id/toggle
  fastify.post<{ Params: { id: string } }>('/:id/toggle', async (req, reply) => {
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, req.params.id));
    if (!schedule) return reply.code(404).send({ error: 'Schedule not found' });

    const newEnabled = !schedule.isEnabled;
    await db.update(schedules).set({ isEnabled: newEnabled, updatedAt: new Date() }).where(eq(schedules.id, req.params.id));

    if (newEnabled) {
      const [updated] = await db.select().from(schedules).where(eq(schedules.id, req.params.id));
      schedulerService.register(updated);
    } else {
      schedulerService.unregister(req.params.id);
    }

    return { isEnabled: newEnabled };
  });

  // POST /schedules/:id/run-now
  fastify.post<{ Params: { id: string } }>('/:id/run-now', async (req, reply) => {
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, req.params.id));
    if (!schedule) return reply.code(404).send({ error: 'Schedule not found' });

    const snapshotId = await snapshotService.triggerSnapshot(
      schedule.serverId,
      schedule.storageRemoteId,
      'scheduled',
      schedule.id,
    );

    reply.code(202);
    return { snapshotId };
  });
};
