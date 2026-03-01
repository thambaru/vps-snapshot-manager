import { NodeSSH } from 'node-ssh';
import { cryptoService } from './crypto.service.js';
import type { InferSelectModel } from 'drizzle-orm';
import type { servers } from '../db/schema.js';

type Server = InferSelectModel<typeof servers>;

interface PoolEntry {
  ssh: NodeSSH;
  serverId: string;
  connectedAt: Date;
  lastUsed: Date;
}

class SSHService {
  private pool: Map<string, PoolEntry> = new Map();
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  async getConnection(server: Server): Promise<NodeSSH> {
    const existing = this.pool.get(server.id);
    if (existing && this.isAlive(existing.ssh)) {
      existing.lastUsed = new Date();
      return existing.ssh;
    }
    return this.createConnection(server);
  }

  private isAlive(ssh: NodeSSH): boolean {
    try {
      return ssh.isConnected();
    } catch {
      return false;
    }
  }

  private async createConnection(server: Server): Promise<NodeSSH> {
    const ssh = new NodeSSH();

    const decryptedSecret = server.encryptedSecret
      ? cryptoService.decrypt(server.encryptedSecret)
      : undefined;

    const connectConfig: Parameters<NodeSSH['connect']>[0] = {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: 15000,
      ...(server.authType === 'password'
        ? { password: decryptedSecret }
        : {
            privateKey: decryptedSecret,
            passphrase: server.encryptedKeyPassphrase
              ? cryptoService.decrypt(server.encryptedKeyPassphrase)
              : undefined,
          }),
    };

    await ssh.connect(connectConfig);
    this.pool.set(server.id, {
      ssh,
      serverId: server.id,
      connectedAt: new Date(),
      lastUsed: new Date(),
    });
    return ssh;
  }

  async executeCommand(
    server: Server,
    command: string,
    onStdout?: (chunk: string) => void,
    onStderr?: (chunk: string) => void,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const ssh = await this.getConnection(server);
    const result = await ssh.execCommand(command, {
      onStdout: onStdout ? (chunk) => onStdout(chunk.toString()) : undefined,
      onStderr: onStderr ? (chunk) => onStderr(chunk.toString()) : undefined,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code ?? 0,
    };
  }

  async disconnect(serverId: string): Promise<void> {
    const entry = this.pool.get(serverId);
    if (entry) {
      entry.ssh.dispose();
      this.pool.delete(serverId);
    }
  }

  startIdleCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of this.pool) {
        if (now - entry.lastUsed.getTime() > this.IDLE_TIMEOUT_MS) {
          entry.ssh.dispose();
          this.pool.delete(id);
        }
      }
    }, 60_000);
  }

  async getServerInfo(server: Server): Promise<{
    hostname: string;
    os: string;
    uptime: string;
    cpuCores: number;
    loadAvg: string;
    memTotal: number;
    memUsed: number;
    memFree: number;
    diskSize: string;
    diskUsed: string;
    diskAvail: string;
    diskPercent: string;
    dockerVolumes: string[];
  }> {
    const exec = (cmd: string) => this.executeCommand(server, cmd);

    const [hostname, os, uptime, cpuCores, loadAvg, mem, disk, dockerVols] = await Promise.all([
      exec('hostname'),
      exec('cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\''),
      exec('uptime -p 2>/dev/null || uptime'),
      exec('nproc'),
      exec('cat /proc/loadavg'),
      exec("free -b 2>/dev/null | awk '/^Mem:/{print $2,$3,$4}'"),
      exec("df -h --output=size,used,avail,pcent / 2>/dev/null | tail -1 || df -h / | tail -1 | awk '{print $2,$3,$4,$5}'"),
      exec("docker volume ls --format '{{.Name}}' 2>/dev/null || echo ''"),
    ]);

    const [memTotal, memUsed, memFree] = mem.stdout.trim().split(' ').map(Number);
    const [diskSize, diskUsed, diskAvail, diskPercent] = disk.stdout.trim().split(/\s+/);
    const volumes = dockerVols.stdout.trim().split('\n').filter(Boolean);

    return {
      hostname: hostname.stdout.trim(),
      os: os.stdout.trim(),
      uptime: uptime.stdout.trim(),
      cpuCores: parseInt(cpuCores.stdout.trim(), 10),
      loadAvg: loadAvg.stdout.trim(),
      memTotal: memTotal ?? 0,
      memUsed: memUsed ?? 0,
      memFree: memFree ?? 0,
      diskSize,
      diskUsed,
      diskAvail,
      diskPercent,
      dockerVolumes: volumes,
    };
  }
}

export const sshService = new SSHService();
