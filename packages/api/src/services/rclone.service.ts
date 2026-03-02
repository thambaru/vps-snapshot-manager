import { spawn, execFile, exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir, platform } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { cryptoService } from './crypto.service.js';
import { db } from '../db/index.js';
import { storageRemotes } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

interface RcloneConfig {
  [key: string]: string;
}

async function writeEphemeralConfig(remoteName: string, remoteType: string, config: RcloneConfig): Promise<string> {
  const configPath = join(tmpdir(), `rclone-${uuidv4()}.conf`);
  const lines = [`[${remoteName}]`];
  
  // Always include the type first
  lines.push(`type = ${remoteType}`);
  
  // Then add other config options
  for (const [k, v] of Object.entries(config)) {
    // Skip if 'type' is already in config to avoid duplication
    if (k !== 'type') {
      lines.push(`${k} = ${v}`);
    }
  }
  await writeFile(configPath, lines.join('\n') + '\n', { mode: 0o600 });
  return configPath;
}

async function getRemoteConfig(remoteId: string): Promise<{ name: string; type: string; config: RcloneConfig }> {
  const [remote] = await db
    .select()
    .from(storageRemotes)
    .where(eq(storageRemotes.id, remoteId));
  if (!remote) throw new Error(`Storage remote not found: ${remoteId}`);
  const config = JSON.parse(cryptoService.decrypt(remote.encryptedConfig)) as RcloneConfig;
  return { name: remote.name, type: remote.type, config };
}

class RcloneService {
  async checkInstalled(): Promise<string> {
    const { stdout } = await execFileAsync('rclone', ['version']);
    const match = stdout.match(/rclone v[\d.]+/);
    if (!match) throw new Error('rclone not found or invalid version output');
    return match[0];
  }

  /**
   * Returns true if rclone is already present, false if it was just installed.
   * Throws if installation fails or the platform is unsupported.
   */
  async ensureInstalled(onStatus?: (msg: string) => void): Promise<boolean> {
    try {
      await this.checkInstalled();
      return true; // already present
    } catch {
      // Not found — attempt install
    }

    const os = platform();
    onStatus?.('rclone not found — installing...');

    if (os === 'linux') {
      // Use rclone's official install script (works on apt/apk/rpm distros)
      onStatus?.('Downloading and running rclone install script (Linux)...');
      await execAsync('curl -fsSL https://rclone.org/install.sh | sudo bash', {
        timeout: 120_000,
      });
    } else if (os === 'darwin') {
      onStatus?.('Installing rclone via Homebrew (macOS)...');
      await execAsync('brew install rclone', { timeout: 120_000 });
    } else {
      throw new Error(
        `rclone is not installed and automatic installation is not supported on platform "${os}". ` +
        'Please install rclone manually: https://rclone.org/install/',
      );
    }

    // Verify the install succeeded
    await this.checkInstalled();
    onStatus?.('rclone installed successfully.');
    return false; // was just installed
  }

  async testRemote(remoteId: string): Promise<{ success: boolean; error?: string }> {
    let configPath: string | undefined;
    try {
      const { name, type, config } = await getRemoteConfig(remoteId);
      configPath = await writeEphemeralConfig(name, type, config);
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
      const { name, type, config } = await getRemoteConfig(remoteId);
      configPath = await writeEphemeralConfig(name, type, config);
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
      const { name, type, config } = await getRemoteConfig(remoteId);
      configPath = await writeEphemeralConfig(name, type, config);
      const destination = `${name}:${remotePath}`;

      // Ensure the destination directory exists
      try {
        await execFileAsync('rclone', ['mkdir', '--config', configPath, destination], {
          timeout: 30_000,
        });
      } catch (err) {
        // Directory might already exist, or we don't have permissions
        // Let the copy command report the actual error
      }

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

        let stderrBuffer = '';

        proc.stderr.on('data', (data: Buffer) => {
          const line = data.toString();
          stderrBuffer += line;
          
          // Parse: "Transferred: 100%, 1.23 GiB, 45 MiB/s, ETA 0s"
          const match = line.match(/(\d+)%.*?([0-9.]+ [KMGT]?i?B\/s).*?ETA\s+(\S+)/);
          if (match && onProgress) {
            onProgress(parseInt(match[1], 10), match[2], match[3]);
          }
        });

        proc.on('close', (code) => {
          if (code === 0) resolve();
          else {
            const errorMsg = stderrBuffer.trim() || `rclone exited with code ${code}`;
            reject(new Error(`rclone failed: ${errorMsg}`));
          }
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
      const { name, type, config } = await getRemoteConfig(remoteId);
      configPath = await writeEphemeralConfig(name, type, config);
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
