#!/usr/bin/env bash
set -euo pipefail

echo "Installing rclone..."
curl https://rclone.org/install.sh | sudo bash
echo "rclone version: $(rclone version | head -1)"
