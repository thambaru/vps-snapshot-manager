import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────
// SERVERS
// ─────────────────────────────────────────────
export const servers = sqliteTable('servers', {
  id:                     text('id').primaryKey(),
  name:                   text('name').notNull(),
  host:                   text('host').notNull(),
  port:                   integer('port').notNull().default(22),
  username:               text('username').notNull(),
  authType:               text('auth_type').notNull(),        // 'password' | 'key'
  encryptedSecret:        text('encrypted_secret'),           // encrypted password or private key PEM
  encryptedKeyPassphrase: text('encrypted_key_passphrase'),   // encrypted key passphrase (if any)
  hostFingerprint:        text('host_fingerprint'),           // stored after first connect
  status:                 text('status').notNull().default('unknown'), // 'online' | 'offline' | 'unknown'
  lastPingAt:             integer('last_ping_at', { mode: 'timestamp' }),
  tags:                   text('tags').default('[]'),          // JSON: ["prod","web"]
  notes:                  text('notes'),
  createdAt:              integer('created_at', { mode: 'timestamp' })
                            .notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt:              integer('updated_at', { mode: 'timestamp' })
                            .notNull().default(sql`(strftime('%s', 'now'))`),
});

// ─────────────────────────────────────────────
// STORAGE REMOTES
// ─────────────────────────────────────────────
export const storageRemotes = sqliteTable('storage_remotes', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull().unique(),
  type:            text('type').notNull(),                     // 'drive' | 's3' | 'onedrive' | 'local' | etc.
  encryptedConfig: text('encrypted_config').notNull(),         // JSON of rclone remote params, encrypted
  remotePath:      text('remote_path').notNull().default('VPS-Snapshots/'),
  isDefault:       integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt:       integer('created_at', { mode: 'timestamp' })
                     .notNull().default(sql`(strftime('%s', 'now'))`),
});

// ─────────────────────────────────────────────
// SNAPSHOT CONFIGS
// ─────────────────────────────────────────────
export const snapshotConfigs = sqliteTable('snapshot_configs', {
  id:                   text('id').primaryKey(),
  serverId:             text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  includeFilesystem:    integer('include_filesystem', { mode: 'boolean' }).default(false),
  filesystemPaths:      text('filesystem_paths').default('[]'),   // JSON: ["/etc","/var/www"]
  excludePaths:         text('exclude_paths').default('[]'),       // JSON: ["/proc","/sys","/tmp"]
  includeMysql:         integer('include_mysql', { mode: 'boolean' }).default(false),
  mysqlDatabases:       text('mysql_databases').default('[]'),     // JSON: ["*"] or ["db1"]
  mysqlUser:            text('mysql_user'),
  encryptedMysqlPass:   text('encrypted_mysql_pass'),
  includePostgres:      integer('include_postgres', { mode: 'boolean' }).default(false),
  pgDatabases:          text('pg_databases').default('[]'),
  pgUser:               text('pg_user').default('postgres'),
  encryptedPgPass:      text('encrypted_pg_pass'),
  includeMongo:         integer('include_mongo', { mode: 'boolean' }).default(false),
  mongoUri:             text('mongo_uri'),
  mongoDatabases:       text('mongo_databases').default('[]'),
  includeDockerVolumes: integer('include_docker_volumes', { mode: 'boolean' }).default(false),
  dockerVolumes:        text('docker_volumes').default('[]'),      // JSON: ["*"] or ["vol1"]
  customDirs:           text('custom_dirs').default('[]'),
  compressionLevel:     integer('compression_level').default(6),
  retentionDays:        integer('retention_days').default(30),
  updatedAt:            integer('updated_at', { mode: 'timestamp' })
                          .notNull().default(sql`(strftime('%s', 'now'))`),
});

// ─────────────────────────────────────────────
// SNAPSHOTS
// ─────────────────────────────────────────────
export const snapshots = sqliteTable('snapshots', {
  id:              text('id').primaryKey(),
  serverId:        text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  storageRemoteId: text('storage_remote_id').references(() => storageRemotes.id, { onDelete: 'set null' }),
  status:          text('status').notNull().default('pending'),
  // 'pending' | 'running' | 'uploading' | 'completed' | 'failed' | 'cancelled'
  triggerType:     text('trigger_type').notNull(),               // 'manual' | 'scheduled'
  scheduleId:      text('schedule_id'),
  remotePath:      text('remote_path'),
  sizeBytes:       integer('size_bytes'),
  startedAt:       integer('started_at', { mode: 'timestamp' }),
  completedAt:     integer('completed_at', { mode: 'timestamp' }),
  durationSeconds: integer('duration_seconds'),
  currentStage:    text('current_stage'),
  // 'prepare' | 'filesystem' | 'mysql' | 'postgres' | 'mongo' | 'docker' | 'custom' | 'bundle' | 'upload'
  progressPercent: integer('progress_percent').default(0),
  errorMessage:    text('error_message'),
  stagesLog:       text('stages_log').default('[]'),              // JSON: [{stage, status, sizeBytes, durationMs}]
  configSnapshot:  text('config_snapshot'),                       // JSON copy of config at time of run
  createdAt:       integer('created_at', { mode: 'timestamp' })
                     .notNull().default(sql`(strftime('%s', 'now'))`),
});

// ─────────────────────────────────────────────
// SCHEDULES
// ─────────────────────────────────────────────
export const schedules = sqliteTable('schedules', {
  id:              text('id').primaryKey(),
  serverId:        text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  storageRemoteId: text('storage_remote_id').notNull().references(() => storageRemotes.id),
  cronExpression:  text('cron_expression').notNull(),
  label:           text('label'),
  isEnabled:       integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  nextRunAt:       integer('next_run_at', { mode: 'timestamp' }),
  lastRunAt:       integer('last_run_at', { mode: 'timestamp' }),
  lastRunStatus:   text('last_run_status'),
  lastSnapshotId:  text('last_snapshot_id'),
  createdAt:       integer('created_at', { mode: 'timestamp' })
                     .notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt:       integer('updated_at', { mode: 'timestamp' })
                     .notNull().default(sql`(strftime('%s', 'now'))`),
});

// ─────────────────────────────────────────────
// SNAPSHOT LOGS
// ─────────────────────────────────────────────
export const snapshotLogs = sqliteTable('snapshot_logs', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  snapshotId: text('snapshot_id').notNull().references(() => snapshots.id, { onDelete: 'cascade' }),
  level:      text('level').notNull().default('info'),   // 'info' | 'warn' | 'error'
  message:    text('message').notNull(),
  stage:      text('stage'),
  createdAt:  integer('created_at', { mode: 'timestamp' })
                .notNull().default(sql`(strftime('%s', 'now'))`),
});
