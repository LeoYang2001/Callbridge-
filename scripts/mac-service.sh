#!/bin/sh
# Runs the CallBridge server (and its Cloudflare tunnel) as a macOS background service, so it
# starts at login and comes back if it stops, independent of any terminal or app.
#
#   scripts/mac-service.sh install     install and start it
#   scripts/mac-service.sh uninstall   stop and remove it
#   scripts/mac-service.sh restart     restart it (e.g. after pulling new code)
#   scripts/mac-service.sh status      is it running, and does the public URL answer
#   scripts/mac-service.sh logs        follow the server log
#
# The Mac still has to be on, awake and online (the launcher keeps it awake while plugged in).
set -e

LABEL=tech.byte2bite.callbridge.server
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGDIR="$HOME/Library/Logs/CallBridge"
DOMAIN="gui/$(id -u)"

case "${1:-}" in
  install)
    NODE="$(command -v node)" || { echo "node not found on PATH"; exit 1; }
    CLOUDFLARED_DIR="$(dirname "$(command -v cloudflared)")" || { echo "cloudflared not found on PATH"; exit 1; }
    [ -f "$ROOT/.env" ] || { echo "No .env yet: run 'npm run laptop' once first."; exit 1; }
    mkdir -p "$HOME/Library/LaunchAgents" "$LOGDIR"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$ROOT/scripts/laptop.mjs</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$NODE"):$CLOUDFLARED_DIR:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>LOG_LEVEL</key><string>info</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$LOGDIR/server.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/server.log</string>
</dict>
</plist>
PLIST
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "Installed. Starting… (log: $LOGDIR/server.log)"
    ;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed."
    ;;
  restart)
    launchctl kickstart -k "$DOMAIN/$LABEL"
    echo "Restarted."
    ;;
  status)
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E "state =|pid =|last exit code" || echo "Not installed."
    URL="$(grep -E '^PUBLIC_BASE_URL=' "$ROOT/.env" | cut -d= -f2-)"
    [ -n "$URL" ] && printf "%s/api/health → " "$URL" && (curl -s -m 8 "$URL/api/health" || echo "no answer") && echo
    ;;
  logs)
    tail -f "$LOGDIR/server.log"
    ;;
  *)
    sed -n '2,12p' "$0"
    exit 1
    ;;
esac
