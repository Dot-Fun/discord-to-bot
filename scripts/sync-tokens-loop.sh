#!/bin/bash

# Run the keychain sync script every 5 minutes in the background
# Usage: ./scripts/sync-claude-tokens.sh

echo "Starting Claude token sync (every 5 minutes)..."
echo "Run 'pkill -f sync-claude-tokens.sh' to stop"

while true; do
    "$(dirname "$0")/sync-tokens.sh" -q
    sleep 300  # 5 minutes
done &

echo "Background sync started (PID: $!)"
