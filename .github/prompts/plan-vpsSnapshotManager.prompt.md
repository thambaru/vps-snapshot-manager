# GitHub Pages Website Plan — VPS Snapshot Manager

## Goal

A single-page marketing/docs site at `https://thambaru.github.io/vps-snapshot-manager/` that introduces the project, showcases features, and guides users to install it.

---

## 1. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Astro** (static output) | Zero JS by default, Markdown support, perfect for GitHub Pages |
| Styling | **Tailwind CSS v4** | Consistent with the main project's frontend |
| Deployment | **GitHub Actions → GitHub Pages** | Free, automatic on push to `main` |
| Location | `docs/` folder or dedicated `gh-pages` branch | Keeps it separate from the app code |

**Alternative (lighter):** Plain HTML + Tailwind CDN — no build step, just a single `index.html` in `docs/`. Good if you want zero tooling.

---

## 2. Recommended File Structure

```
docs/                         # or a separate branch
├── astro.config.mjs
├── package.json
├── tailwind.config.ts
├── public/
│   ├── favicon.svg
│   ├── og-image.png          # Open Graph preview image
│   └── screenshots/
│       ├── dashboard.png
│       ├── snapshot-progress.png
│       └── server-detail.png
├── src/
│   ├── layouts/
│   │   └── Base.astro        # <html>, <head>, meta tags, footer
│   ├── pages/
│   │   └── index.astro       # single page, all sections
│   ├── components/
│   │   ├── Hero.astro
│   │   ├── Features.astro
│   │   ├── Architecture.astro
│   │   ├── QuickStart.astro
│   │   ├── TechStack.astro
│   │   ├── FAQ.astro
│   │   └── Footer.astro
│   └── styles/
│       └── global.css
└── .github/
    └── workflows/
        └── deploy-pages.yml
```

---

## 3. Page Sections & Features

### Hero
- Project name, tagline: *"Self-hosted VPS snapshot manager with 70+ cloud storage providers"*
- One-line install command with a **copy** button
- CTA buttons: **Get Started** (scrolls to QuickStart) · **GitHub →**
- Animated terminal mockup showing the `curl | bash` install

### Features Grid
- 6 cards with icons:
  1. **Multi-Server SSH** — password or private key auth
  2. **Flexible Scope** — filesystem, MySQL, PostgreSQL, MongoDB, Docker volumes
  3. **70+ Cloud Providers** — Google Drive, S3, OneDrive, Backblaze, etc. via rclone
  4. **Scheduled Backups** — cron-based scheduling
  5. **Live Progress** — WebSocket stage-by-stage modal
  6. **Encrypted Credentials** — AES-256-GCM for all stored secrets

### Screenshots / Demo
- Carousel or stacked screenshots of Dashboard, Server Detail, Snapshot Progress modal
- Optional: embedded short GIF/video walkthrough

### Architecture Diagram
- Visual representation of the monorepo layout (API ↔ Web ↔ Proxy)
- Tech logos: Fastify, React, SQLite, rclone, Docker

### Quick Start
- Tabbed code blocks: **One-line install** / **Local development** / **Docker Compose**
- Environment variable table
- Link to full README for details

### Tech Stack
- Logo grid with labels: Fastify v5, React 19, Vite, Tailwind CSS, Drizzle ORM, SQLite, rclone, node-cron, WebSocket

### FAQ (collapsible)
- "Is this production-ready?"
- "Which cloud providers are supported?"
- "How are credentials stored?"
- "Can I back up databases?"

### Footer
- MIT License © 2026 Thambaru Wijesekara
- Links: GitHub · Issues · Releases

---

## 4. Setup Instructions

### Step 1 — Scaffold the site

```bash
cd /Users/thambaru/Development/vps-snapshots-to-google-drive
pnpm create astro@latest docs -- --template minimal
cd docs
pnpm add -D @astrojs/tailwind tailwindcss
```

### Step 2 — Configure Astro

```js
// docs/astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://thambaru.github.io',
  base: '/vps-snapshot-manager',
  output: 'static',
  integrations: [tailwind()],
});
```

### Step 3 — Add GitHub Actions workflow

```yaml
# .github/workflows/deploy-pages.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
    paths: ['docs/**']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: docs/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
        working-directory: docs
      - run: pnpm build
        working-directory: docs
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Step 4 — Enable GitHub Pages

1. Go to **repo Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` — the workflow will build and deploy automatically

### Step 5 — Add SEO metadata

In `Base.astro`:
- `<title>`, `<meta name="description">`, Open Graph tags (`og:title`, `og:image`, `og:url`), Twitter card meta
- Canonical URL pointing to the GitHub Pages domain
- Favicon

---

## 5. Nice-to-Haves (Phase 2)

| Feature | Notes |
|---|---|
| **Dark/light mode toggle** | Respect `prefers-color-scheme`, persist in `localStorage` |
| **Stargazer counter** | Fetch from GitHub API, cache client-side |
| **Changelog section** | Auto-generated from GitHub Releases via API |
| **Search (Cmd+K)** | If docs grow beyond a single page |
| **Analytics** | Plausible or GoatCounter (privacy-friendly, no cookies) |
| **Custom domain** | `CNAME` file in `docs/public/` |

---

## 6. Checklist

- [x] Scaffold Astro project in `docs/`
- [x] Build Hero, Features, QuickStart, Architecture, TechStack, Footer components
- [ ] Capture screenshots from the running app
- [ ] Add `deploy-pages.yml` workflow
- [ ] Enable GitHub Pages (Actions source) in repo settings
- [ ] Add Open Graph image and SEO meta tags
- [ ] Test locally with `pnpm dev` and `pnpm build && pnpm preview`
- [ ] Push to `main` and verify deployment
