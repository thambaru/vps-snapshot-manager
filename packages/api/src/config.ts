import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// Load .env from repo root
loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appSecret: required('APP_SECRET'),
  databasePath: process.env.DATABASE_PATH ?? './data/snapshots.db',
  tempDir: process.env.TEMP_DIR ?? './tmp',
};
