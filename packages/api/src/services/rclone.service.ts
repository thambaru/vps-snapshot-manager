import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { cryptoService } from './crypto.service.js';
import { db } from '../db/index.js';
import { storageRemotes } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const execFileAsync = promisify(execFile);

interface RcloneConfig {
  [key: string]: string;
}

async function writeEphemeralConfig(remoteName: string, config: RcloneConfig): Promise<string> {
  const configPath = join(tmpdir(), `rclone-${uuidv4()}.conf`);
  const lines = [`[${remoteName}]`];
  for (const [k, v] of Object.entries(config)) {
    lines.push(`${k} = ${v}`);
  }
  await writeFile(configPath, lines.join('\n') + '\n', { mode: 0o600 });
  return configPath;
}

async function getRemoteConfig(remoteId: string): Promise<{ name: string; config: RcloneConfig }> {
  const [remote] = await db
    .select()
    .from(storageRemotes)
    .where(eq(storageRemotes.id, remoteId));
  if (!remote) throw new Error(`Storage remote not found: ${remoteId}`);
  const config = JSON.parse(cryptoService.decrypt(remote.encryptedConfig)) as RcloneConfig;
  return { name: remote.name, config };
}

class RcloneService {
  async checkInstalled(): Promise<string> {
    const { stdout } = await execFileAsync('rclone', ['version']);
    const match = stdout.match(/rclone v[\d.]+/);
    if (!match) throw new Error('rclone not found or invalid version output');
    return match[0];
  }

  async testRemote(remoteId: string): Promise<{ success: boolean; error?: string }> {
    let configPath: string | undefined;
    try {
      const { name, config } = await getRemoteConfig(remoteId);
      configPath = await writeEphemeralConfig(name, config);
      await execFileAsync('rclone', ['lsd', '--config', configPath, `${name}:`], {
        timeout: 30_000,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    } finally {
      if (configPath) await unlink(configPath).catch(() => {});
    }
  }

  async listFiles(remoteId: string, path: string = ''): Promise<unknown[]> {
    let configPath: string | undefined;
    try {
      const { name, config } = await getRemoteConfig(remoteId);
      configPath = await writeEphemeralConfig(name, config);
      const { stdout } = await execFileAsync(
        'rclone',
        ['lsjson', '--config', configPath, `${name}:${path}`],
        { timeout: 30_000 },
      );
      return JSON.parse(stdout) as unknown[];
    } finally {
      if (configPath) await unlink(configPath).catch(() => {});
    }
  }

  async uploadFile(
    localPath: string,
    remoteId: string,
    remotePath: string,
    onProgress?: (percent: number, speed: string, eta: string) => void,
  ): Promise<void> {
    let configPath: string | undefined;
    try {
      const { name, config } = await getRemoteConfig(remoteId);
      configPath = await writeEphemeralConfig(name, config);
      const destination = `${name}:${remotePath}`;

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          'rclone',
          [
            'copy',
            localPath,
            destination,
            '--config', configPath!,
            '--progress',
            '--stats', '2s',
            '--stats-one-line',
            '-v',
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );

        proc.stderr.on('data', (data: Buffer) => {
          const line = data.toString();
          // Parse: "Transferred: 100%, 1.23 GiB, 45 MiB/s, ETA 0s"
          const match = line.match(/(\d+)%.*?([0-9.]+ [KMGT]?i?B\/s).*?ETA\s+(\S+)/);
          if (match && onProgress) {
            onProgress(parseInt(match[1], 10), match[2], match[3]);
          }
        });

        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`rclone exited with code ${code}`));
        });

        proc.on('error', reject);
      });
    } finally {
      if (configPath) await unlink(configPath).catch(() => {});
    }
  }

  async deleteFile(remoteId: string, filePath: string): Promise<void> {
    let configPath: string | undefined;
    try {
      const { name, config } = await getRemoteConfig(remoteId);
      configPath = await writeEphemeralConfig(name, config);
      await execFileAsync('rclone', [
        'deletefile',
        '--config', configPath,
        `${name}:${filePath}`,
      ]);
    } finally {
      if (configPath) await unlink(configPath).catch(() => {});
    }
  }

  async getSupportedProviders(): Promise<string[]> {
    const { stdout } = await execFileAsync('rclone', ['help', 'backends']);
    // Parse lines that list backend names
    return stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\w/.test(l) && !l.startsWith('Use') && l.length > 0);
  }
}

export const rcloneService = new RcloneService();
