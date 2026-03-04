import { mkdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { snapshots, snapshotConfigs, snapshotLogs, servers, storageRemotes } from '../db/schema.js';
import { sshService } from './ssh.service.js';
import { rcloneService } from './rclone.service.js';
import { progressService } from './progress.service.js';
import { config } from '../config.js';
import type { InferSelectModel } from 'drizzle-orm';

type Snapshot = InferSelectModel<typeof snapshots>;
type SnapshotConfig = InferSelectModel<typeof snapshotConfigs>;

interface StageResult {
  stage: string;
  status: 'success' | 'failed' | 'skipped';
  sizeBytes: number;
  durationMs: number;
  error?: string;
}

async function appendLog(
  snapshotId: string,
  message: string,
  level: 'info' | 'warn' | 'error' = 'info',
  stage?: string,
): Promise<void> {
  const [log] = await db.insert(snapshotLogs).values({ snapshotId, message, level, stage }).returning();
  
  // Broadcast log via WebSocket
  if (log) {
    progressService.broadcast({
      type: 'snapshot:log',
      snapshotId,
      log: {
        id: log.id,
        level: log.level as 'info' | 'warn' | 'error',
        message: log.message,
        stage: log.stage,
        createdAt: log.createdAt,
      },
    });
  }
}

async function updateSnapshot(
  id: string,
  data: Partial<{
    status: string;
    currentStage: string | null | undefined;
    progressPercent: number;
    errorMessage: string;
    sizeBytes: number;
    completedAt: Date;
    durationSeconds: number;
    remotePath: string;
    stagesLog: string;
    configSnapshot: string;
  }>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(snapshots).set(data as any).where(eq(snapshots.id, id));
}

class SnapshotService {
  private activeSnapshots = new Set<string>();

  async triggerSnapshot(
    serverId: string,
    storageRemoteId: string,
    triggerType: 'manual' | 'scheduled' = 'manual',
    scheduleId?: string,
  ): Promise<string> {
    const snapshotId = uuidv4();
    this.activeSnapshots.add(snapshotId);

    await db.insert(snapshots).values({
      id: snapshotId,
      serverId,
      storageRemoteId,
      status: 'pending',
      triggerType,
      scheduleId,
    });

    // Run async in background — don't await
    this.runSnapshot(snapshotId, serverId, storageRemoteId).catch(async (err) => {
      const message = (err as Error).message;
      // Write to logs so the terminal panel always shows the final error
      await appendLog(snapshotId, `Snapshot failed: ${message}`, 'error').catch(() => {});
      await updateSnapshot(snapshotId, {
        status: 'failed',
        errorMessage: message,
        completedAt: new Date(),
      });
      progressService.broadcast({
        type: 'snapshot:done',
        snapshotId,
        status: 'failed',
        totalSizeBytes: 0,
        durationSeconds: 0,
        error: message,
      });
    }).finally(() => {
      this.activeSnapshots.delete(snapshotId);
    });

    return snapshotId;
  }

  async cancelSnapshot(snapshotId: string): Promise<void> {
    if (this.activeSnapshots.has(snapshotId)) {
      this.activeSnapshots.delete(snapshotId);
      
      await updateSnapshot(snapshotId, {
        status: 'cancelled',
        completedAt: new Date(),
      });

      await appendLog(snapshotId, 'Snapshot cancelled by user', 'warn');

      progressService.broadcast({
        type: 'snapshot:done',
        snapshotId,
        status: 'cancelled',
        totalSizeBytes: 0,
        durationSeconds: 0,
      });
    }
  }

  private async isCancelled(snapshotId: string): Promise<boolean> {
    if (!this.activeSnapshots.has(snapshotId)) {
      return true;
    }
    // Double check DB in case of multi-instance or race
    const [snap] = await db.select({ status: snapshots.status }).from(snapshots).where(eq(snapshots.id, snapshotId));
    return !snap || snap.status === 'cancelled';
  }

  private async runSnapshot(
    snapshotId: string,
    serverId: string,
    storageRemoteId: string,
  ): Promise<void> {
    const startTime = Date.now();

    const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
    if (!server) throw new Error(`Server not found: ${serverId}`);

    const [snapshotConfig] = await db
      .select()
      .from(snapshotConfigs)
      .where(eq(snapshotConfigs.serverId, serverId));

    const [remote] = await db.select().from(storageRemotes).where(eq(storageRemotes.id, storageRemoteId));
    if (!remote) throw new Error(`Storage remote not found: ${storageRemoteId}`);

    const stageResults: StageResult[] = [];
    const stagingDir = `/tmp/vps-snapshot-${snapshotId}`;
    const localTmpDir = join(config.tempDir, snapshotId);

    const emitProgress = (stage: string, percent: number, message: string) => {
      progressService.broadcast({
        type: 'snapshot:progress',
        snapshotId,
        serverId,
        status: 'running',
        stage,
        progressPercent: percent,
        message,
        timestamp: Date.now(),
      });
    };

    try {
      if (await this.isCancelled(snapshotId)) return;

      // ── PRE-FLIGHT: ensure rclone is available locally ────
      await updateSnapshot(snapshotId, { status: 'running', currentStage: 'prepare', progressPercent: 1 });
      emitProgress('prepare', 1, 'Checking local dependencies...');
      await rcloneService.ensureInstalled((msg) => {
        emitProgress('prepare', 1, msg);
        appendLog(snapshotId, msg, 'info', 'prepare').catch(() => {});
      });

      if (await this.isCancelled(snapshotId)) return;

      // ── PREPARE ──────────────────────────────────────────
      await updateSnapshot(snapshotId, { currentStage: 'prepare', progressPercent: 2 });
      emitProgress('prepare', 2, 'Connecting to server...');
      await appendLog(snapshotId, `Connecting to ${server.username}@${server.host}:${server.port} via SSH...`, 'info', 'prepare');

      try {
        await sshService.executeCommand(server, `mkdir -p ${stagingDir}`);
      } catch (err) {
        await appendLog(snapshotId, `SSH connection failed: ${(err as Error).message}`, 'error', 'prepare');
        throw err;
      }

      await appendLog(snapshotId, `Connected. Staging directory created: ${stagingDir}`, 'info', 'prepare');
      emitProgress('prepare', 5, 'Connected. Staging area ready.');

      // Save config snapshot
      if (snapshotConfig) {
        await updateSnapshot(snapshotId, { configSnapshot: JSON.stringify(snapshotConfig) });
      }

      // Validate that at least one backup stage is enabled
      const hasAnyStageEnabled = snapshotConfig?.includeFilesystem ||
        snapshotConfig?.includeMysql ||
        snapshotConfig?.includePostgres ||
        snapshotConfig?.includeMongo ||
        snapshotConfig?.includeDockerVolumes ||
        (JSON.parse(snapshotConfig?.customDirs ?? '[]').length > 0);

      if (!hasAnyStageEnabled) {
        throw new Error(
          'No backup stages enabled in snapshot configuration. Please enable at least one backup type (Filesystem, MySQL, PostgreSQL, MongoDB, Docker Volumes, or Custom Directories) in the server settings.'
        );
      }

      if (await this.isCancelled(snapshotId)) return;

      let totalProgress = 5;
      const stageWeight = this.calculateStageWeights(snapshotConfig);

      // ── FILESYSTEM ──────────────────────────────────────
      if (snapshotConfig?.includeFilesystem) {
        if (await this.isCancelled(snapshotId)) return;
        const stageStart = Date.now();
        await updateSnapshot(snapshotId, { currentStage: 'filesystem', progressPercent: totalProgress });
        emitProgress('filesystem', totalProgress, 'Starting filesystem backup...');
        await appendLog(snapshotId, 'Starting filesystem backup', 'info', 'filesystem');

        try {
          const paths = (JSON.parse(snapshotConfig.filesystemPaths ?? '[]') as string[]).join(' ') || '/etc /var/www /home /opt';
          const excludes = (JSON.parse(snapshotConfig.excludePaths ?? '[]') as string[])
            .map((p) => `--exclude=${p}`)
            .join(' ');
          const defaultExcludes = '--exclude=/proc --exclude=/sys --exclude=/dev --exclude=/run --exclude=/tmp --exclude=/snap';
          const cmd = `tar ${defaultExcludes} ${excludes} -czf ${stagingDir}/filesystem.tar.gz ${paths} 2>&1 | tail -5`;

          await sshService.executeCommand(server, cmd,
            (out) => appendLog(snapshotId, out, 'info', 'filesystem'),
            (err) => appendLog(snapshotId, err, 'warn', 'filesystem'),
          );

          const { stdout: sizeOut } = await sshService.executeCommand(server, `du -sb ${stagingDir}/filesystem.tar.gz`);
          const sizeBytes = parseInt(sizeOut.split('\t')[0], 10) || 0;
          const durationMs = Date.now() - stageStart;
          stageResults.push({ stage: 'filesystem', status: 'success', sizeBytes, durationMs });
          totalProgress += stageWeight.filesystem;
          progressService.broadcast({ type: 'snapshot:stage_complete', snapshotId, stage: 'filesystem', sizeBytes, durationMs });
          emitProgress('filesystem', totalProgress, `Filesystem backup complete (${(sizeBytes / 1e9).toFixed(2)} GB)`);
        } catch (err) {
          stageResults.push({ stage: 'filesystem', status: 'failed', sizeBytes: 0, durationMs: Date.now() - stageStart, error: (err as Error).message });
          await appendLog(snapshotId, `Filesystem backup failed: ${(err as Error).message}`, 'error', 'filesystem');
        }
      }

      // ── MYSQL ────────────────────────────────────────────
      if (snapshotConfig?.includeMysql) {
        if (await this.isCancelled(snapshotId)) return;
        const stageStart = Date.now();
        await updateSnapshot(snapshotId, { currentStage: 'mysql', progressPercent: totalProgress });
        emitProgress('mysql', totalProgress, 'Starting MySQL dumps...');
        await appendLog(snapshotId, 'Starting MySQL backup', 'info', 'mysql');

        try {
          const user = snapshotConfig.mysqlUser || 'root';
          const pass = snapshotConfig.encryptedMysqlPass ? `` : '';
          const dbs = JSON.parse(snapshotConfig.mysqlDatabases ?? '["*"]') as string[];

          let dbList: string[] = dbs;
          if (dbs.includes('*')) {
            const { stdout } = await sshService.executeCommand(
              server,
              `mysql -u${user}${pass} -N -e "SHOW DATABASES;" 2>/dev/null | grep -v -E "^(information_schema|performance_schema|sys)$"`,
            );
            dbList = stdout.trim().split('\n').filter(Boolean);
          }

          for (const dbName of dbList) {
            if (await this.isCancelled(snapshotId)) return;
            const cmd = `mysqldump -u${user}${pass} --single-transaction --routines --triggers ${dbName} | gzip > ${stagingDir}/mysql-${dbName}.sql.gz`;
            await sshService.executeCommand(server, cmd);
          }

          const { stdout: sizeOut } = await sshService.executeCommand(server, `du -sb ${stagingDir}/mysql-*.sql.gz 2>/dev/null | awk '{s+=$1}END{print s}'`);
          const sizeBytes = parseInt(sizeOut.trim(), 10) || 0;
          const durationMs = Date.now() - stageStart;
          stageResults.push({ stage: 'mysql', status: 'success', sizeBytes, durationMs });
          totalProgress += stageWeight.mysql;
          progressService.broadcast({ type: 'snapshot:stage_complete', snapshotId, stage: 'mysql', sizeBytes, durationMs });
          emitProgress('mysql', totalProgress, 'MySQL dumps complete');
        } catch (err) {
          stageResults.push({ stage: 'mysql', status: 'failed', sizeBytes: 0, durationMs: Date.now() - stageStart, error: (err as Error).message });
          await appendLog(snapshotId, `MySQL backup failed: ${(err as Error).message}`, 'error', 'mysql');
        }
      }

      // ── POSTGRESQL ───────────────────────────────────────
      if (snapshotConfig?.includePostgres) {
        if (await this.isCancelled(snapshotId)) return;
        const stageStart = Date.now();
        await updateSnapshot(snapshotId, { currentStage: 'postgres', progressPercent: totalProgress });
        emitProgress('postgres', totalProgress, 'Starting PostgreSQL dumps...');
        await appendLog(snapshotId, 'Starting PostgreSQL backup', 'info', 'postgres');

        try {
          const user = snapshotConfig.pgUser || 'postgres';
          const dbs = JSON.parse(snapshotConfig.pgDatabases ?? '["*"]') as string[];

          let dbList: string[] = dbs;
          if (dbs.includes('*')) {
            const { stdout } = await sshService.executeCommand(
              server,
              `psql -U ${user} -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;" 2>/dev/null`,
            );
            dbList = stdout.trim().split('\n').map((d) => d.trim()).filter(Boolean);
          }

          for (const dbName of dbList) {
            if (await this.isCancelled(snapshotId)) return;
            const cmd = `pg_dump -U ${user} -Fc ${dbName} > ${stagingDir}/postgres-${dbName}.dump`;
            await sshService.executeCommand(server, cmd);
          }

          const { stdout: sizeOut } = await sshService.executeCommand(server, `du -sb ${stagingDir}/postgres-*.dump 2>/dev/null | awk '{s+=$1}END{print s}'`);
          const sizeBytes = parseInt(sizeOut.trim(), 10) || 0;
          const durationMs = Date.now() - stageStart;
          stageResults.push({ stage: 'postgres', status: 'success', sizeBytes, durationMs });
          totalProgress += stageWeight.postgres;
          progressService.broadcast({ type: 'snapshot:stage_complete', snapshotId, stage: 'postgres', sizeBytes, durationMs });
          emitProgress('postgres', totalProgress, 'PostgreSQL dumps complete');
        } catch (err) {
          stageResults.push({ stage: 'postgres', status: 'failed', sizeBytes: 0, durationMs: Date.now() - stageStart, error: (err as Error).message });
          await appendLog(snapshotId, `PostgreSQL backup failed: ${(err as Error).message}`, 'error', 'postgres');
        }
      }

      // ── MONGODB ──────────────────────────────────────────
      if (snapshotConfig?.includeMongo) {
        if (await this.isCancelled(snapshotId)) return;
        const stageStart = Date.now();
        await updateSnapshot(snapshotId, { currentStage: 'mongo', progressPercent: totalProgress });
        emitProgress('mongo', totalProgress, 'Starting MongoDB dumps...');
        await appendLog(snapshotId, 'Starting MongoDB backup', 'info', 'mongo');

        try {
          const uri = snapshotConfig.mongoUri || 'mongodb://localhost:27017';
          const dbs = JSON.parse(snapshotConfig.mongoDatabases ?? '["*"]') as string[];

          if (dbs.includes('*')) {
            const cmd = `mongodump --uri="${uri}" --archive=${stagingDir}/mongo-all.archive --gzip`;
            await sshService.executeCommand(server, cmd);
          } else {
            for (const dbName of dbs) {
              if (await this.isCancelled(snapshotId)) return;
              const cmd = `mongodump --uri="${uri}" --db=${dbName} --archive=${stagingDir}/mongo-${dbName}.archive --gzip`;
              await sshService.executeCommand(server, cmd);
            }
          }

          const { stdout: sizeOut } = await sshService.executeCommand(server, `du -sb ${stagingDir}/mongo-*.archive 2>/dev/null | awk '{s+=$1}END{print s}'`);
          const sizeBytes = parseInt(sizeOut.trim(), 10) || 0;
          const durationMs = Date.now() - stageStart;
          stageResults.push({ stage: 'mongo', status: 'success', sizeBytes, durationMs });
          totalProgress += stageWeight.mongo;
          progressService.broadcast({ type: 'snapshot:stage_complete', snapshotId, stage: 'mongo', sizeBytes, durationMs });
          emitProgress('mongo', totalProgress, 'MongoDB dumps complete');
        } catch (err) {
          stageResults.push({ stage: 'mongo', status: 'failed', sizeBytes: 0, durationMs: Date.now() - stageStart, error: (err as Error).message });
          await appendLog(snapshotId, `MongoDB backup failed: ${(err as Error).message}`, 'error', 'mongo');
        }
      }

      // ── DOCKER VOLUMES ───────────────────────────────────
      if (snapshotConfig?.includeDockerVolumes) {
        if (await this.isCancelled(snapshotId)) return;
        const stageStart = Date.now();
        await updateSnapshot(snapshotId, { currentStage: 'docker', progressPercent: totalProgress });
        emitProgress('docker', totalProgress, 'Starting Docker volume backups...');
        await appendLog(snapshotId, 'Starting Docker volume backup', 'info', 'docker');

        try {
          const vols = JSON.parse(snapshotConfig.dockerVolumes ?? '["*"]') as string[];
          let volList: string[] = vols;

          if (vols.includes('*')) {
            const { stdout } = await sshService.executeCommand(server, "docker volume ls --format '{{.Name}}'");
            volList = stdout.trim().split('\n').filter(Boolean);
          }

          for (const volName of volList) {
            if (await this.isCancelled(snapshotId)) return;
            const safeName = volName.replace(/[^a-zA-Z0-9_-]/g, '_');
            const cmd = `docker run --rm -v ${volName}:/data:ro -v ${stagingDir}:/backup alpine tar -czf /backup/docker-${safeName}.tar.gz -C /data .`;
            await sshService.executeCommand(server, cmd);
          }

          const { stdout: sizeOut } = await sshService.executeCommand(server, `du -sb ${stagingDir}/docker-*.tar.gz 2>/dev/null | awk '{s+=$1}END{print s}'`);
          const sizeBytes = parseInt(sizeOut.trim(), 10) || 0;
          const durationMs = Date.now() - stageStart;
          stageResults.push({ stage: 'docker', status: 'success', sizeBytes, durationMs });
          totalProgress += stageWeight.docker;
          progressService.broadcast({ type: 'snapshot:stage_complete', snapshotId, stage: 'docker', sizeBytes, durationMs });
          emitProgress('docker', totalProgress, 'Docker volume backups complete');
        } catch (err) {
          stageResults.push({ stage: 'docker', status: 'failed', sizeBytes: 0, durationMs: Date.now() - stageStart, error: (err as Error).message });
          await appendLog(snapshotId, `Docker volume backup failed: ${(err as Error).message}`, 'error', 'docker');
        }
      }

      // ── CUSTOM DIRS ──────────────────────────────────────
      if (snapshotConfig?.customDirs) {
        const customDirs = JSON.parse(snapshotConfig.customDirs) as string[];
        if (customDirs.length > 0) {
          if (await this.isCancelled(snapshotId)) return;
          const stageStart = Date.now();
          await updateSnapshot(snapshotId, { currentStage: 'custom', progressPercent: totalProgress });
          emitProgress('custom', totalProgress, 'Starting custom directory backups...');
          await appendLog(snapshotId, 'Starting custom directory backup', 'info', 'custom');

          try {
            for (const dir of customDirs) {
              if (await this.isCancelled(snapshotId)) return;
              const safeName = dir.replace(/\//g, '_').replace(/^_/, '');
              const cmd = `tar -czf ${stagingDir}/custom-${safeName}.tar.gz -C / ${dir.replace(/^\//, '')}`;
              await sshService.executeCommand(server, cmd);
            }

            const { stdout: sizeOut } = await sshService.executeCommand(server, `du -sb ${stagingDir}/custom-*.tar.gz 2>/dev/null | awk '{s+=$1}END{print s}'`);
            const sizeBytes = parseInt(sizeOut.trim(), 10) || 0;
            const durationMs = Date.now() - stageStart;
            stageResults.push({ stage: 'custom', status: 'success', sizeBytes, durationMs });
            totalProgress += stageWeight.custom;
            progressService.broadcast({ type: 'snapshot:stage_complete', snapshotId, stage: 'custom', sizeBytes, durationMs });
            emitProgress('custom', totalProgress, 'Custom directory backups complete');
          } catch (err) {
            stageResults.push({ stage: 'custom', status: 'failed', sizeBytes: 0, durationMs: Date.now() - stageStart, error: (err as Error).message });
            await appendLog(snapshotId, `Custom directory backup failed: ${(err as Error).message}`, 'error', 'custom');
          }
        }
      }

      // ── ABORT IF ANY STAGE FAILED ────────────────────────
      const failedStages = stageResults.filter((s) => s.status === 'failed');
      if (failedStages.length > 0) {
        const summary = failedStages.map((s) => `${s.stage}: ${s.error ?? 'unknown error'}`).join('; ');
        throw new Error(`Snapshot aborted — the following stages failed: ${summary}`);
      }

      // ── BUNDLE ───────────────────────────────────────────
      if (await this.isCancelled(snapshotId)) return;
      await updateSnapshot(snapshotId, { currentStage: 'bundle', progressPercent: totalProgress });
      emitProgress('bundle', totalProgress, 'Creating final archive...');

      const metadata = {
        snapshotId,
        serverId,
        serverHost: server.host,
        serverName: server.name,
        stages: stageResults,
        createdAt: new Date().toISOString(),
      };
      await sshService.executeCommand(
        server,
        `echo '${JSON.stringify(metadata)}' > ${stagingDir}/metadata.json`,
      );

      if (await this.isCancelled(snapshotId)) return;
      const archiveName = `${server.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-${new Date().toISOString().slice(0, 10)}-${snapshotId.slice(0, 8)}.tar.gz`;
      await sshService.executeCommand(server, `tar -czf /tmp/${archiveName} -C /tmp vps-snapshot-${snapshotId}/`);
      await appendLog(snapshotId, `Bundle created: ${archiveName}`, 'info', 'bundle');

      // ── DOWNLOAD TO LOCAL ────────────────────────────────
      if (await this.isCancelled(snapshotId)) return;
      await updateSnapshot(snapshotId, { currentStage: 'upload', progressPercent: totalProgress, status: 'uploading' });
      emitProgress('upload', totalProgress, 'Downloading snapshot to local...');

      await mkdir(localTmpDir, { recursive: true });
      const localArchivePath = join(localTmpDir, archiveName);
      const ssh = await sshService.getConnection(server);
      await ssh.getFile(localArchivePath, `/tmp/${archiveName}`);

      // Get local file size
      const { size: localSizeBytes } = await stat(localArchivePath);

      // Cleanup server items after downloading
      await sshService.executeCommand(server, `rm -rf ${stagingDir} /tmp/${archiveName}`).catch(() => { });
      await appendLog(snapshotId, 'Cleaned up temporary files on server', 'info', 'upload');

      // ── UPLOAD TO CLOUD ──────────────────────────────────
      if (await this.isCancelled(snapshotId)) return;
      emitProgress('upload', totalProgress + 5, 'Uploading to cloud storage...');
      await appendLog(snapshotId, `Uploading to ${remote.name}:${remote.remotePath}`, 'info', 'upload');

      const remoteFilePath = `${remote.remotePath}${archiveName}`;

      await rcloneService.uploadFile(localArchivePath, storageRemoteId, remote.remotePath, (percent, speed, eta) => {
        const uploadProgress = totalProgress + Math.floor(percent * 0.15);
        progressService.broadcast({
          type: 'snapshot:progress',
          snapshotId,
          serverId,
          status: 'uploading',
          stage: 'upload',
          progressPercent: uploadProgress,
          message: `Uploading: ${percent}% at ${speed}, ETA ${eta}`,
          timestamp: Date.now(),
        });
      });

      // ── FINALIZE ─────────────────────────────────────────
      if (await this.isCancelled(snapshotId)) return;
      const totalSizeBytes = stageResults.reduce((sum, s) => sum + s.sizeBytes, 0) || localSizeBytes;
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      await updateSnapshot(snapshotId, {
        status: 'completed',
        currentStage: null,
        progressPercent: 100,
        sizeBytes: localSizeBytes,
        completedAt: new Date(),
        durationSeconds,
        remotePath: remoteFilePath,
        stagesLog: JSON.stringify(stageResults),
      });

      await appendLog(snapshotId, `Snapshot completed in ${durationSeconds}s (${(localSizeBytes / 1e9).toFixed(2)} GB)`, 'info');

      progressService.broadcast({
        type: 'snapshot:done',
        snapshotId,
        status: 'completed',
        totalSizeBytes,
        durationSeconds,
      });
    } finally {
      // Cleanup any remaining remote files (in case of early failure)
      await sshService.executeCommand(server, `rm -rf ${stagingDir} /tmp/${snapshotId}* 2>/dev/null || true`).catch(() => {});
      // Cleanup local tmp
      await rm(localTmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private calculateStageWeights(cfg: SnapshotConfig | undefined): Record<string, number> {
    // Rough distribution of progress percentage across active stages (upload gets 15%)
    const stages: string[] = [];
    if (cfg?.includeFilesystem) stages.push('filesystem');
    if (cfg?.includeMysql) stages.push('mysql');
    if (cfg?.includePostgres) stages.push('postgres');
    if (cfg?.includeMongo) stages.push('mongo');
    if (cfg?.includeDockerVolumes) stages.push('docker');
    if (JSON.parse(cfg?.customDirs ?? '[]').length > 0) stages.push('custom');

    const available = 80; // 5% prepare + 80% stages + 15% upload
    const perStage = stages.length > 0 ? Math.floor(available / stages.length) : 0;

    return Object.fromEntries(stages.map((s) => [s, perStage]));
  }
}

export const snapshotService = new SnapshotService();
