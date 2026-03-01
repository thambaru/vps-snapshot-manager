# VPS Snapshot Manager

A self-hosted web dashboard for creating and managing snapshots of remote servers. Connect servers via SSH, configure what to backup (filesystem, databases, Docker volumes), and upload snapshots automatically to any cloud storage via rclone (Google Drive, S3, OneDrive, 70+ providers).

## Features

- **Multi-server management** via SSH (password or private key auth)
- **Flexible snapshot scope**: full filesystem, MySQL, PostgreSQL, MongoDB, Docker volumes, custom directories
- **70+ cloud storage providers** via rclone: Google Drive, S3, OneDrive, Backblaze B2, SFTP, Dropbox, etc.
- **Scheduled snapshots** with cron expressions
- **Live progress** via WebSocket — stage-by-stage progress modal
- **Web dashboard** with server stats, snapshot history, and schedule management
- **AES-256-GCM encryption** for all stored credentials (SSH passwords, DB passwords, cloud tokens)

## Quick Start

### Option 1: One-line install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/thambaru/vps-snapshot-manager/main/scripts/deploy.sh | bash
```

The script installs Docker and Git if missing (Linux only — on macOS it will prompt you to install Docker Desktop if needed), clones the repo, generates a secret key, and starts the stack. Open [http://localhost](http://localhost) when it finishes.

To update an existing install, run the same command again — it pulls the latest changes and rebuilds.

### Option 2: Local development (not for production)

**Prerequisites**: Node.js 20+, pnpm, rclone

```bash
./scripts/setup.sh
pnpm dev
```

- API: http://localhost:3001
- Web: http://localhost:3000

## Configuration

Copy `.env.example` to `.env` and set:

| Variable | Description |
|---|---|
| `APP_SECRET` | 64-character hex string (run `openssl rand -hex 32`) |
| `PORT` | API server port (default: 3001) |
| `DATABASE_PATH` | SQLite database path (default: `./data/snapshots.db`) |
| `TEMP_DIR` | Temporary staging directory (default: `./tmp`) |

## Adding Servers

1. Go to **Servers** → **Add Server**
2. Enter SSH connection details (host, port, username)
3. Choose auth type: Password or Private Key
4. Click **Test SSH** to verify connectivity

## Configuring Storage

1. Go to **Settings** → **Add Remote**
2. Select provider (Google Drive, S3, OneDrive, etc.)
3. For OAuth providers (Google Drive, OneDrive), run locally first:
   ```bash
   rclone authorize "drive"   # for Google Drive
   rclone authorize "onedrive" # for OneDrive
   ```
   Then paste the token JSON into the Token field.
4. Click **Test Connection** to verify

## Taking Snapshots

1. Go to **Servers** → click a server → **Take Snapshot**
2. A progress modal shows live stage updates (filesystem → databases → Docker → upload)
3. Completed snapshots appear in the **Snapshots** page

## Architecture

```
packages/
├── api/          # Fastify v5 + TypeScript backend
│   ├── src/db/   # Drizzle ORM + SQLite schema
│   ├── routes/   # REST API endpoints
│   └── services/ # SSH, snapshot, rclone, scheduler, crypto
└── web/          # React 19 + Vite + Tailwind CSS frontend
    ├── pages/    # Dashboard, Servers, Snapshots, Schedules, Settings
    └── components/ # ServerCard, SnapshotTable, ProgressModal, etc.
```

## Tech Stack

- **Backend**: Fastify v5, TypeScript, Drizzle ORM, SQLite
- **Frontend**: React 19, Vite, TanStack Query, Tailwind CSS v4, Zustand
- **SSH**: node-ssh
- **Storage**: rclone binary (70+ providers)
- **Scheduler**: node-cron
- **Real-time**: WebSocket via @fastify/websocket
- **Security**: AES-256-GCM via node-forge

## License

[MIT](LICENSE) © 2026 Thambaru Wijesekara
