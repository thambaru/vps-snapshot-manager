import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { storageRemotes } from '../db/schema.js';
import { cryptoService } from '../services/crypto.service.js';
import { rcloneService } from '../services/rclone.service.js';

const CreateRemoteSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Name must be alphanumeric, dashes, or underscores'),
  type: z.string().min(1),
  config: z.record(z.string()),  // rclone config key-value pairs
  remotePath: z.string().default('VPS-Snapshots/'),
  isDefault: z.boolean().default(false),
});

export const storageRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /storage
  fastify.get('/', async () => {
    const remotes = await db.select({
      id: storageRemotes.id,
      name: storageRemotes.name,
      type: storageRemotes.type,
      remotePath: storageRemotes.remotePath,
      isDefault: storageRemotes.isDefault,
      createdAt: storageRemotes.createdAt,
    }).from(storageRemotes);
    return remotes;
  });

  // GET /storage/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const [remote] = await db
      .select({
        id: storageRemotes.id,
        name: storageRemotes.name,
        type: storageRemotes.type,
        remotePath: storageRemotes.remotePath,
        isDefault: storageRemotes.isDefault,
        createdAt: storageRemotes.createdAt,
      })
      .from(storageRemotes)
      .where(eq(storageRemotes.id, req.params.id));
    if (!remote) return reply.code(404).send({ error: 'Remote not found' });
    return remote;
  });

  // POST /storage
  fastify.post('/', async (req, reply) => {
    const body = CreateRemoteSchema.parse(req.body);
    const id = uuidv4();

    if (body.isDefault) {
      // Unset current default
      await db.update(storageRemotes).set({ isDefault: false });
    }

    await db.insert(storageRemotes).values({
      id,
      name: body.name,
      type: body.type,
      encryptedConfig: cryptoService.encrypt(JSON.stringify(body.config)),
      remotePath: body.remotePath,
      isDefault: body.isDefault,
    });

    reply.code(201);
    return { id };
  });

  // PUT /storage/:id
  fastify.put<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const body = CreateRemoteSchema.partial().parse(req.body);
    const [existing] = await db.select().from(storageRemotes).where(eq(storageRemotes.id, req.params.id));
    if (!existing) return reply.code(404).send({ error: 'Remote not found' });

    if (body.isDefault) {
      await db.update(storageRemotes).set({ isDefault: false });
    }

    await db.update(storageRemotes).set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.config !== undefined && { encryptedConfig: cryptoService.encrypt(JSON.stringify(body.config)) }),
      ...(body.remotePath !== undefined && { remotePath: body.remotePath }),
      ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
    }).where(eq(storageRemotes.id, req.params.id));

    return { success: true };
  });

  // DELETE /storage/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const [existing] = await db.select().from(storageRemotes).where(eq(storageRemotes.id, req.params.id));
    if (!existing) return reply.code(404).send({ error: 'Remote not found' });
    if (existing.name === 'local-storage') return reply.code(400).send({ error: 'Cannot delete the built-in local storage remote' });
    await db.delete(storageRemotes).where(eq(storageRemotes.id, req.params.id));
    return { success: true };
  });

  // POST /storage/:id/test
  fastify.post<{ Params: { id: string } }>('/:id/test', async (req, reply) => {
    const [existing] = await db.select().from(storageRemotes).where(eq(storageRemotes.id, req.params.id));
    if (!existing) return reply.code(404).send({ error: 'Remote not found' });
    return rcloneService.testRemote(req.params.id);
  });

  // POST /storage/:id/set-default
  fastify.post<{ Params: { id: string } }>('/:id/set-default', async (req, reply) => {
    const [existing] = await db.select().from(storageRemotes).where(eq(storageRemotes.id, req.params.id));
    if (!existing) return reply.code(404).send({ error: 'Remote not found' });
    await db.update(storageRemotes).set({ isDefault: false });
    await db.update(storageRemotes).set({ isDefault: true }).where(eq(storageRemotes.id, req.params.id));
    return { success: true };
  });

  // GET /storage/:id/browse?path=
  fastify.get<{ Params: { id: string } }>('/:id/browse', async (req, reply) => {
    const query = req.query as { path?: string };
    const [existing] = await db.select().from(storageRemotes).where(eq(storageRemotes.id, req.params.id));
    if (!existing) return reply.code(404).send({ error: 'Remote not found' });
    try {
      const files = await rcloneService.listFiles(req.params.id, query.path);
      return { files };
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  });
};
