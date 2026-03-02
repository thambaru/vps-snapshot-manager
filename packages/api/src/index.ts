import { buildApp } from './app.js';
import { config } from './config.js';
import { schedulerService } from './services/scheduler.service.js';
import { sshService } from './services/ssh.service.js';
import { rcloneService } from './services/rclone.service.js';
import { db } from './db/index.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Ensure required directories exist
mkdirSync(config.tempDir, { recursive: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Run database migrations on startup
  migrate(db, { migrationsFolder: join(__dirname, 'db/migrations') });
  console.log('Database migrations applied');

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
