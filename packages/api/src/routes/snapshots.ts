import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { snapshots, snapshotLogs, storageRemotes } from '../db/schema.js';
import { snapshotService } from '../services/snapshot.service.js';
import { rcloneService } from '../services/rclone.service.js';

const TriggerSchema = z.object({
  serverId: z.string().uuid(),
  storageRemoteId: z.string().uuid(),
});

export const snapshotsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /snapshots?serverId=&status=&page=&limit=
  fastify.get('/', async (req) => {
    const query = req.query as { serverId?: string; status?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, parseInt(query.limit ?? '20', 10));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.serverId) conditions.push(eq(snapshots.serverId, query.serverId));
    if (query.status) conditions.push(eq(snapshots.status, query.status));

    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(snapshots)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(snapshots.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(snapshots)
        .where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return { items, total: count, page, limit };
  });

  // GET /snapshots/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const [snapshot] = await db.select().from(snapshots).where(eq(snapshots.id, req.params.id));
    if (!snapshot) return reply.code(404).send({ error: 'Snapshot not found' });
    return snapshot;
  });

  // GET /snapshots/:id/logs?since=
  fastify.get<{ Params: { id: string } }>('/:id/logs', async (req, reply) => {
    const query = req.query as { since?: string; limit?: string };
    const limit = Math.min(500, parseInt(query.limit ?? '100', 10));

    const conditions = [eq(snapshotLogs.snapshotId, req.params.id)];
    if (query.since) {
      conditions.push(sql`${snapshotLogs.id} > ${parseInt(query.since, 10)}`);
    }

    const logs = await db
      .select()
      .from(snapshotLogs)
      .where(and(...conditions))
      .orderBy(snapshotLogs.id)
      .limit(limit);

    return logs;
  });

  // POST /snapshots — trigger new snapshot
  fastify.post('/', async (req, reply) => {
    const body = TriggerSchema.parse(req.body);
    const snapshotId = await snapshotService.triggerSnapshot(
      body.serverId,
      body.storageRemoteId,
      'manual',
    );
    reply.code(202);
    return { snapshotId };
  });

  // DELETE /snapshots/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const [snapshot] = await db.select().from(snapshots).where(eq(snapshots.id, req.params.id));
    if (!snapshot) return reply.code(404).send({ error: 'Snapshot not found' });

    if (snapshot.status === 'running' || snapshot.status === 'uploading') {
      return reply.code(409).send({ error: 'Cannot delete a running snapshot. Cancel it first.' });
    }

    // Attempt to delete the remote file
    if (snapshot.storageRemoteId && snapshot.remotePath) {
      try {
        await rcloneService.deleteFile(snapshot.storageRemoteId, snapshot.remotePath);
      } catch {
        // Log but don't block deletion
      }
    }

    await db.delete(snapshots).where(eq(snapshots.id, req.params.id));
    return { success: true };
  });

  // POST /snapshots/:id/cancel
  fastify.post<{ Params: { id: string } }>('/:id/cancel', async (req, reply) => {
    const [snapshot] = await db.select().from(snapshots).where(eq(snapshots.id, req.params.id));
    if (!snapshot) return reply.code(404).send({ error: 'Snapshot not found' });
    if (snapshot.status !== 'running' && snapshot.status !== 'uploading') {
      return reply.code(409).send({ error: 'Snapshot is not running' });
    }

    await snapshotService.cancelSnapshot(req.params.id);

    return { success: true };
  });
};
