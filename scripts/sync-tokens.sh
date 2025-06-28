#!/bin/bash

# Script to transfer Claude Code credentials from macOS keychain to GitHub secrets
# Usage: ./scripts/keychain-to-github-secret.sh [-q|--quiet]

set -e

# Check for quiet mode
QUIET=false
if [[ "$1" == "-q" ]] || [[ "$1" == "--quiet" ]]; then
    QUIET=true
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to handle output
log() {
    if [ "$QUIET" = false ]; then
        echo -e "$@"
    fi
}

# Check dependencies silently
if [[ "$OSTYPE" != "darwin"* ]] || ! command -v jq &> /dev/null || ! command -v gh &> /dev/null || ! gh auth status &> /dev/null; then
    log "${RED}Error: Missing dependencies${NC}"
    exit 1
fi

# Get the current repository
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
if [ -z "$REPO" ]; then
    log "${RED}Error: Not in a GitHub repository${NC}"
    exit 1
fi

# Retrieve and parse credentials
CREDENTIALS_JSON=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null)
if [ $? -ne 0 ]; then
    log "${RED}Error: Could not find keychain item${NC}"
    exit 1
fi

ACCESS_TOKEN=$(echo "$CREDENTIALS_JSON" | jq -r '.claudeAiOauth.accessToken' 2>/dev/null)
REFRESH_TOKEN=$(echo "$CREDENTIALS_JSON" | jq -r '.claudeAiOauth.refreshToken' 2>/dev/null)
EXPIRES_AT=$(echo "$CREDENTIALS_JSON" | jq -r '.claudeAiOauth.expiresAt' 2>/dev/null)

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ] || \
   [ -z "$REFRESH_TOKEN" ] || [ "$REFRESH_TOKEN" = "null" ] || \
   [ -z "$EXPIRES_AT" ] || [ "$EXPIRES_AT" = "null" ]; then
    log "${RED}Error: Could not parse credentials${NC}"
    exit 1
fi

# Create a hash of the current credentials
CURRENT_HASH=$(echo "$ACCESS_TOKEN$REFRESH_TOKEN$EXPIRES_AT" | shasum -a 256 | cut -d' ' -f1)
# Make hash file repo-specific by including the repo name
REPO_SAFE=$(echo "$REPO" | tr '/' '-')
HASH_FILE="/tmp/.claude-credentials-hash-${REPO_SAFE}"

# Check if credentials have changed
if [ -f "$HASH_FILE" ]; then
    PREVIOUS_HASH=$(cat "$HASH_FILE")
    if [ "$CURRENT_HASH" = "$PREVIOUS_HASH" ]; then
        log "${GREEN}✓ No changes${NC}"
        exit 0
    fi
fi

# Set the three GitHub secrets
echo "$ACCESS_TOKEN" | gh secret set "CLAUDE_ACCESS_TOKEN" --repo="$REPO" &>/dev/null || exit 1
echo "$REFRESH_TOKEN" | gh secret set "CLAUDE_REFRESH_TOKEN" --repo="$REPO" &>/dev/null || exit 1
echo "$EXPIRES_AT" | gh secret set "CLAUDE_EXPIRES_AT" --repo="$REPO" &>/dev/null || exit 1

# Save the hash for next time
echo "$CURRENT_HASH" > "$HASH_FILE"

log "${GREEN}✓ Updated${NC}"
