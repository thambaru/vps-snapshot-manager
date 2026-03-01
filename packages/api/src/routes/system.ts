import type { FastifyPluginAsync } from 'fastify';
import { rcloneService } from '../services/rclone.service.js';
import { progressService } from '../services/progress.service.js';
import { schedulerService } from '../services/scheduler.service.js';

const startedAt = new Date();

export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    let rcloneVersion = 'unknown';
    try {
      rcloneVersion = await rcloneService.checkInstalled();
    } catch {
      rcloneVersion = 'not installed';
    }

    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      rcloneVersion,
      wsClients: progressService.clientCount,
      activeSchedules: schedulerService.activeCount,
    };
  });

  fastify.get('/rclone-providers', async (_, reply) => {
    try {
      const providers = await rcloneService.getSupportedProviders();
      return { providers };
    } catch {
      return reply.code(503).send({ error: 'rclone not available' });
    }
  });
};
