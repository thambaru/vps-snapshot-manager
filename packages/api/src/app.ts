import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { serversRoutes } from './routes/servers.js';
import { snapshotsRoutes } from './routes/snapshots.js';
import { schedulesRoutes } from './routes/schedules.js';
import { storageRoutes } from './routes/storage.js';
import { systemRoutes } from './routes/system.js';
import { progressService } from './services/progress.service.js';
import { config } from './config.js';

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  await fastify.register(cors, {
    origin: config.nodeEnv === 'development' ? true : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(websocket);

  // WebSocket endpoint for live progress updates
  fastify.get('/ws', { websocket: true }, (socket) => {
    progressService.addClient(socket);
    socket.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  });

  // REST API routes
  await fastify.register(serversRoutes, { prefix: '/api/v1/servers' });
  await fastify.register(snapshotsRoutes, { prefix: '/api/v1/snapshots' });
  await fastify.register(schedulesRoutes, { prefix: '/api/v1/schedules' });
  await fastify.register(storageRoutes, { prefix: '/api/v1/storage' });
  await fastify.register(systemRoutes, { prefix: '/api/v1/system' });

  // Global error handler
  fastify.setErrorHandler((error: Error & { statusCode?: number }, _req, reply) => {
    fastify.log.error(error);
    if (error.name === 'ZodError') {
      return reply.code(400).send({ error: 'Validation error', details: error.message });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: error.message });
  });

  return fastify;
}
