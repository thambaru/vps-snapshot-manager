import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { servers, snapshotConfigs } from '../db/schema.js';
import { cryptoService } from '../services/crypto.service.js';
import { sshService } from '../services/ssh.service.js';
import { progressService } from '../services/progress.service.js';

const CreateServerSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1),
  authType: z.enum(['password', 'key']),
  secret: z.string().min(1),            // password or private key PEM
  keyPassphrase: z.string().optional(), // private key passphrase
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

const UpdateServerSchema = CreateServerSchema.partial();

export const serversRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /servers
  fastify.get('/', async () => {
    return db.select({
      id: servers.id,
      name: servers.name,
      host: servers.host,
      port: servers.port,
      username: servers.username,
      authType: servers.authType,
      status: servers.status,
      lastPingAt: servers.lastPingAt,
      tags: servers.tags,
      notes: servers.notes,
      createdAt: servers.createdAt,
      updatedAt: servers.updatedAt,
    }).from(servers);
  });

  // GET /servers/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const [server] = await db
      .select({
        id: servers.id,
        name: servers.name,
        host: servers.host,
        port: servers.port,
        username: servers.username,
        authType: servers.authType,
        status: servers.status,
        lastPingAt: servers.lastPingAt,
        tags: servers.tags,
        notes: servers.notes,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
      })
      .from(servers)
      .where(eq(servers.id, req.params.id));

    if (!server) return reply.code(404).send({ error: 'Server not found' });
    return server;
  });

  // POST /servers
  fastify.post('/', async (req, reply) => {
    const body = CreateServerSchema.parse(req.body);
    const id = uuidv4();
    const now = new Date();

    await db.insert(servers).values({
      id,
      name: body.name,
      host: body.host,
      port: body.port,
      username: body.username,
      authType: body.authType,
      encryptedSecret: cryptoService.encrypt(body.secret),
      encryptedKeyPassphrase: body.keyPassphrase
        ? cryptoService.encrypt(body.keyPassphrase)
        : undefined,
      tags: JSON.stringify(body.tags),
      notes: body.notes,
      createdAt: now,
      updatedAt: now,
    });

    // Create default empty snapshot config
    await db.insert(snapshotConfigs).values({
      id: uuidv4(),
      serverId: id,
    });

    reply.code(201);
    return { id };
  });

  // PUT /servers/:id
  fastify.put<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const body = UpdateServerSchema.parse(req.body);
    const [existing] = await db.select().from(servers).where(eq(servers.id, req.params.id));
    if (!existing) return reply.code(404).send({ error: 'Server not found' });

    await db.update(servers).set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.host !== undefined && { host: body.host }),
      ...(body.port !== undefined && { port: body.port }),
      ...(body.username !== undefined && { username: body.username }),
      ...(body.authType !== undefined && { authType: body.authType }),
      ...(body.secret !== undefined && { encryptedSecret: cryptoService.encrypt(body.secret) }),
      ...(body.keyPassphrase !== undefined && { encryptedKeyPassphrase: cryptoService.encrypt(body.keyPassphrase) }),
      ...(body.tags !== undefined && { tags: JSON.stringify(body.tags) }),
      ...(body.notes !== undefined && { notes: body.notes }),
      updatedAt: new Date(),
    }).where(eq(servers.id, req.params.id));

    return { success: true };
  });

  // DELETE /servers/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const [existing] = await db.select().from(servers).where(eq(servers.id, req.params.id));
    if (!existing) return reply.code(404).send({ error: 'Server not found' });

    await db.delete(servers).where(eq(servers.id, req.params.id));
    return { success: true };
  });

  // POST /servers/:id/test — SSH connectivity check
  fastify.post<{ Params: { id: string } }>('/:id/test', async (req, reply) => {
    const [server] = await db.select().from(servers).where(eq(servers.id, req.params.id));
    if (!server) return reply.code(404).send({ error: 'Server not found' });

    const start = Date.now();
    try {
      const result = await sshService.executeCommand(server, 'echo "ping"');
      const latencyMs = Date.now() - start;
      if (result.stdout.trim() !== 'ping') throw new Error('Unexpected ping response');

      await db.update(servers).set({ status: 'online', lastPingAt: new Date() }).where(eq(servers.id, server.id));
      progressService.broadcast({ type: 'server:status', serverId: server.id, status: 'online' });

      return { success: true, latencyMs };
    } catch (err) {
      await db.update(servers).set({ status: 'offline', lastPingAt: new Date() }).where(eq(servers.id, server.id));
      progressService.broadcast({ type: 'server:status', serverId: server.id, status: 'offline' });
      return { success: false, error: (err as Error).message, latencyMs: Date.now() - start };
    }
  });

  // GET /servers/:id/info — fetch disk/mem/cpu via SSH
  fastify.get<{ Params: { id: string } }>('/:id/info', async (req, reply) => {
    const [server] = await db.select().from(servers).where(eq(servers.id, req.params.id));
    if (!server) return reply.code(404).send({ error: 'Server not found' });

    try {
      const info = await sshService.getServerInfo(server);
      return info;
    } catch (err) {
      return reply.code(503).send({ error: `Could not fetch server info: ${(err as Error).message}` });
    }
  });

  // GET /servers/:id/config
  fastify.get<{ Params: { id: string } }>('/:id/config', async (req, reply) => {
    const [cfg] = await db
      .select()
      .from(snapshotConfigs)
      .where(eq(snapshotConfigs.serverId, req.params.id));
    if (!cfg) return reply.code(404).send({ error: 'Config not found' });
    return cfg;
  });

  // PUT /servers/:id/config
  fastify.put<{ Params: { id: string } }>('/:id/config', async (req, reply) => {
    const [existing] = await db
      .select()
      .from(snapshotConfigs)
      .where(eq(snapshotConfigs.serverId, req.params.id));

    const body = req.body as Record<string, unknown>;

    if (existing) {
      await db.update(snapshotConfigs).set({ ...body, updatedAt: new Date() } as never).where(eq(snapshotConfigs.serverId, req.params.id));
    } else {
      await db.insert(snapshotConfigs).values({ id: uuidv4(), serverId: req.params.id, ...body } as never);
    }
    return { success: true };
  });
};
