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

## Contributing

We welcome contributions! Here's how to get started:

### Development Setup

1. **Fork and clone** the repository
2. **Install dependencies**:
   ```bash
   pnpm install
   ```
3. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env and set APP_SECRET (run: openssl rand -hex 32)
   ```
4. **Run database migrations**:
   ```bash
   pnpm db:migrate
   ```
5. **Start development servers**:
   ```bash
   pnpm dev
   ```
   - API: http://localhost:3001
   - Web: http://localhost:3000

### Code Structure

#### API Package (`packages/api/`)

**Routes** (`src/routes/`)
- One file per resource (servers, snapshots, schedules, storage, system)
- Use Fastify route schemas for validation
- Keep route handlers thin—delegate to services

**Services** (`src/services/`)
- Business logic lives here
- Each service handles a specific domain (SSH, snapshots, rclone, scheduler, crypto)
- Services should be stateless and testable

**Database** (`src/db/`)
- Schema definitions in `schema.ts` using Drizzle ORM
- Migrations in `migrations/` directory
- Generate migrations: `pnpm db:generate`
- Apply migrations: `pnpm db:migrate`

#### Web Package (`packages/web/`)

**Pages** (`src/pages/`)
- One component per route (Dashboard, Servers, Snapshots, etc.)
- Use TanStack Query for data fetching
- Keep pages focused on layout and composition

**Components** (`src/components/`)
- Reusable UI components
- Props should be strongly typed with TypeScript interfaces
- Follow atomic design principles where appropriate

**API Client** (`src/api/`)
- Centralized API calls using TanStack Query
- One file per resource matching backend routes
- Type-safe request/response interfaces

**State Management** (`src/store/`)
- Use Zustand for global state (e.g., snapshot progress)
- Keep state minimal—prefer server state via TanStack Query

### Style Guidelines

**TypeScript**
- Strict mode enabled in all packages
- No `any` types—use `unknown` or proper types
- Prefer interfaces over types for object shapes
- Use type inference where safe

**React**
- Functional components with hooks
- Use `React.FC` sparingly—explicit return types preferred
- Destructure props for clarity
- Keep components under 200 lines—split if larger

**Naming Conventions**
- Files: kebab-case for utilities, PascalCase for components
- Components: PascalCase (e.g., `ServerCard.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useWebSocket.ts`)
- Services: camelCase with `.service.ts` suffix
- Routes: kebab-case with `.ts` suffix

**Code Formatting**
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters
- Use `eslint` and `prettier` (configs in repo)

**API Design**
- RESTful conventions: GET, POST, PUT, DELETE
- Versioned endpoints: `/api/v1/...`
- Consistent error responses with status codes
- Return JSON with camelCase keys

**Database**
- Use Drizzle ORM query builder—avoid raw SQL
- Create migrations for all schema changes
- Test migrations rollback before committing
- Use transactions for multi-step operations

### Git Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make focused commits**:
   ```bash
   git commit -m "feat: add server connection test endpoint"
   git commit -m "fix: resolve SSH key authentication issue"
   ```
   
   Use conventional commit prefixes:
   - `feat:` - new feature
   - `fix:` - bug fix
   - `docs:` - documentation changes
   - `refactor:` - code refactoring
   - `test:` - adding or updating tests
   - `chore:` - maintenance tasks

3. **Keep your branch updated**:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

4. **Push and create a pull request**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Testing Checklist

Before submitting a PR, ensure:

- [ ] Code builds without errors (`pnpm build`)
- [ ] No TypeScript errors (`pnpm lint`)
- [ ] Database migrations apply cleanly
- [ ] API endpoints return expected responses
- [ ] UI components render correctly in light/dark mode
- [ ] Responsive design works on mobile/tablet/desktop
- [ ] WebSocket connections work for live progress
- [ ] Error handling is implemented for edge cases
- [ ] Security: No credentials logged or exposed
- [ ] Documentation updated if adding new features

### Pull Request Guidelines

- **Title**: Clear, descriptive summary (e.g., "Add support for MongoDB backups")
- **Description**: 
  - What changes were made and why
  - Link to related issues
  - Screenshots for UI changes
  - Migration instructions if schema changed
- **Size**: Keep PRs focused—one feature/fix per PR
- **Reviews**: Address feedback promptly and professionally

### Adding New Features

**New Backend Endpoint**:
1. Add route handler in `packages/api/src/routes/`
2. Create/update service in `packages/api/src/services/`
3. Add database schema changes if needed (generate migration)
4. Update API client in `packages/web/src/api/`

**New UI Page**:
1. Create page component in `packages/web/src/pages/`
2. Add route in router configuration
3. Create necessary API client functions
4. Add navigation link in Sidebar component
5. Implement responsive design with Tailwind CSS

**Database Schema Change**:
1. Update `packages/api/src/db/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Review generated SQL in `migrations/`
4. Test migration: `pnpm db:migrate`
5. Update TypeScript types if needed

### Questions or Issues?

- **Bugs**: Open an issue with reproduction steps
- **Features**: Discuss in an issue before starting work
- **Questions**: Start a discussion on GitHub

## License

[MIT](LICENSE) © 2026 Thambaru Wijesekara
