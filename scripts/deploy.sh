#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/thambaru/vps-snapshot-manager"
INSTALL_DIR="${INSTALL_DIR:-vps-snapshot-manager}"

echo "=== VPS Snapshot Manager ==="

# ── Helpers ────────────────────────────────────────────────────────────────────

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    *)       echo "unknown" ;;
  esac
}

install_git() {
  local os
  os=$(detect_os)
  echo "Installing git..."
  case "$os" in
    linux)
      if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq git
      elif command -v yum &>/dev/null; then
        sudo yum install -y -q git
      elif command -v dnf &>/dev/null; then
        sudo dnf install -y -q git
      elif command -v apk &>/dev/null; then
        sudo apk add --quiet git
      else
        echo "Error: Could not install git — unsupported package manager. Install git manually and re-run." >&2
        exit 1
      fi
      ;;
    macos)
      # git ships with Xcode CLT; triggering the install prompt is the standard approach
      if ! xcode-select -p &>/dev/null; then
        echo "Installing Xcode Command Line Tools (includes git)..."
        xcode-select --install
        echo "Re-run this script once the installation finishes."
        exit 0
      fi
      ;;
    *)
      echo "Error: Unsupported OS. Install git manually and re-run." >&2
      exit 1
      ;;
  esac
}

install_docker() {
  local os
  os=$(detect_os)
  case "$os" in
    linux)
      echo "Installing Docker..."
      curl -fsSL https://get.docker.com | sh
      # Add current user to the docker group so we don't need sudo for every command
      if ! groups | grep -q docker; then
        sudo usermod -aG docker "$USER"
        echo "Added $USER to the docker group. You may need to log out and back in for this to take effect."
        echo "For now, continuing with sudo..."
        DOCKER_CMD="sudo docker"
      fi
      # Enable and start the Docker daemon
      if command -v systemctl &>/dev/null; then
        sudo systemctl enable --now docker
      fi
      ;;
    macos)
      echo ""
      echo "Docker Desktop is required on macOS but cannot be installed automatically."
      echo "Download and install it from: https://docs.docker.com/desktop/install/mac-install/"
      echo "Then re-run this script."
      exit 1
      ;;
    *)
      echo "Error: Unsupported OS. Install Docker manually and re-run." >&2
      exit 1
      ;;
  esac
}

# ── Dependency checks ──────────────────────────────────────────────────────────

DOCKER_CMD="docker"

if ! command -v git &>/dev/null; then
  install_git
fi

if ! command -v docker &>/dev/null; then
  install_docker
fi

# Verify Docker is actually running
if ! $DOCKER_CMD info &>/dev/null 2>&1; then
  echo "Error: Docker is installed but not running. Start Docker and re-run this script." >&2
  exit 1
fi

# Check for Docker Compose (v2 plugin or legacy standalone)
if ! $DOCKER_CMD compose version &>/dev/null 2>&1; then
  if command -v docker-compose &>/dev/null; then
    # Legacy standalone — alias it
    COMPOSE_CMD="docker-compose"
  else
    echo "Installing Docker Compose plugin..."
    if command -v apt-get &>/dev/null; then
      sudo apt-get install -y -qq docker-compose-plugin
    else
      echo "Error: Docker Compose not found. Install it from https://docs.docker.com/compose/install/" >&2
      exit 1
    fi
    COMPOSE_CMD="$DOCKER_CMD compose"
  fi
else
  COMPOSE_CMD="$DOCKER_CMD compose"
fi

# ── Clone / update ─────────────────────────────────────────────────────────────

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing installation in ./$INSTALL_DIR ..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "Cloning into ./$INSTALL_DIR ..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── Environment ────────────────────────────────────────────────────────────────

if [ ! -f .env ]; then
  echo "Generating .env with a random APP_SECRET..."
  SECRET=$(openssl rand -hex 32)
  cp .env.example .env
  sed -i.bak "s/your-64-hex-character-secret-here/${SECRET}/" .env && rm -f .env.bak
  echo ".env created."
fi

mkdir -p data tmp

# ── Launch ─────────────────────────────────────────────────────────────────────

echo "Starting services..."
$COMPOSE_CMD up -d --build

echo ""
echo "=== Done! Open http://localhost in your browser. ==="
