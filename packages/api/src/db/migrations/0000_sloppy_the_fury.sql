CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`storage_remote_id` text NOT NULL,
	`cron_expression` text NOT NULL,
	`label` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`next_run_at` integer,
	`last_run_at` integer,
	`last_run_status` text,
	`last_snapshot_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storage_remote_id`) REFERENCES `storage_remotes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`auth_type` text NOT NULL,
	`encrypted_secret` text,
	`encrypted_key_passphrase` text,
	`host_fingerprint` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_ping_at` integer,
	`tags` text DEFAULT '[]',
	`notes` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshot_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`include_filesystem` integer DEFAULT false,
	`filesystem_paths` text DEFAULT '[]',
	`exclude_paths` text DEFAULT '[]',
	`include_mysql` integer DEFAULT false,
	`mysql_databases` text DEFAULT '[]',
	`mysql_user` text,
	`encrypted_mysql_pass` text,
	`include_postgres` integer DEFAULT false,
	`pg_databases` text DEFAULT '[]',
	`pg_user` text DEFAULT 'postgres',
	`encrypted_pg_pass` text,
	`include_mongo` integer DEFAULT false,
	`mongo_uri` text,
	`mongo_databases` text DEFAULT '[]',
	`include_docker_volumes` integer DEFAULT false,
	`docker_volumes` text DEFAULT '[]',
	`custom_dirs` text DEFAULT '[]',
	`compression_level` integer DEFAULT 6,
	`retention_days` integer DEFAULT 30,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `snapshot_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`stage` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`storage_remote_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`trigger_type` text NOT NULL,
	`schedule_id` text,
	`remote_path` text,
	`size_bytes` integer,
	`started_at` integer,
	`completed_at` integer,
	`duration_seconds` integer,
	`current_stage` text,
	`progress_percent` integer DEFAULT 0,
	`error_message` text,
	`stages_log` text DEFAULT '[]',
	`config_snapshot` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storage_remote_id`) REFERENCES `storage_remotes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `storage_remotes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`encrypted_config` text NOT NULL,
	`remote_path` text DEFAULT 'VPS-Snapshots/' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_remotes_name_unique` ON `storage_remotes` (`name`);