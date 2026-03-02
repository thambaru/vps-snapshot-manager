import { buildApp } from './app.js';
import { config } from './config.js';
import { schedulerService } from './services/scheduler.service.js';
import { sshService } from './services/ssh.service.js';
import { rcloneService } from './services/rclone.service.js';
import { db } from './db/index.js';
import { storageRemotes } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { cryptoService } from './services/crypto.service.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

// Ensure required directories exist
mkdirSync(config.tempDir, { recursive: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Run database migrations on startup
  migrate(db, { migrationsFolder: join(__dirname, 'db/migrations') });
  console.log('Database migrations applied');

  // Ensure the built-in local storage remote exists
  const [existingLocal] = await db
    .select({ id: storageRemotes.id })
    .from(storageRemotes)
    .where(eq(storageRemotes.name, 'local-storage'));
  if (!existingLocal) {
    // If there are no remotes at all, make local the default
    const [anyRemote] = await db.select({ id: storageRemotes.id }).from(storageRemotes);
    await db.insert(storageRemotes).values({
      id: uuidv4(),
      name: 'local-storage',
      type: 'local',
      encryptedConfig: cryptoService.encrypt(JSON.stringify({})),
      remotePath: '/var/snapshots',
      isDefault: !anyRemote,
    });
    console.log('Created built-in local-storage remote');
  }

  // Verify rclone is installed
  try {
    const version = await rcloneService.checkInstalled();
    console.log(`rclone: ${version}`);
  } catch {
    console.warn('Warning: rclone is not installed. Upload functionality will be unavailable.');
    console.warn('Install with: curl https://rclone.org/install.sh | sudo bash');
  }

  const app = await buildApp();

  // Initialize scheduler (restores all active cron jobs from DB)
  await schedulerService.initializeFromDatabase();

  // Start SSH idle connection cleanup
  sshService.startIdleCleanup();

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`API server running on http://0.0.0.0:${config.port}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
