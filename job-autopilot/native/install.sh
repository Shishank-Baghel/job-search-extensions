#!/usr/bin/env bash
# Registers the Claude Code helper with Google Chrome so Job Autopilot can use your Claude plan.
# Run once (and again if you move this folder):  bash native/install.sh
# Optional argument: the extension ID shown on chrome://extensions, if it differs.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd -P)"
EXT="$(dirname "$DIR")"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js is needed (the 'node' command wasn't found)."; exit 1; }
# An unpacked extension's ID is derived from its folder path.
ID="${1:-$(printf '%s' "$EXT" | sha256sum | cut -c1-32 | tr '0-9a-f' 'a-p')}"

cat > "$DIR/claude_host.sh" <<EOF
#!/bin/sh
exec "$NODE" "$DIR/claude_host.mjs" "\$@"
EOF
chmod +x "$DIR/claude_host.sh"

HOSTS="$HOME/.config/google-chrome/NativeMessagingHosts"
mkdir -p "$HOSTS"
cat > "$HOSTS/com.jobautopilot.claude.json" <<EOF
{
  "name": "com.jobautopilot.claude",
  "description": "Job Autopilot: answers through Claude Code on this computer",
  "path": "$DIR/claude_host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ID/"]
}
EOF
echo "Installed for extension $ID. Reload Job Autopilot at chrome://extensions."
