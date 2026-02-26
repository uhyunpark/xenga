#!/usr/bin/env bash
# PostToolUse hook: auto-deploy to Fly.io after pushing server-related changes
# Reads hook JSON from stdin, checks if git push touched server files, runs fly deploy

set -euo pipefail

# Read the hook input from stdin
INPUT=$(cat)

# Check if this is a git push command
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
if [[ ! "$COMMAND" =~ ^git\ push ]]; then
  echo '{}'
  exit 0
fi

# Extract commit range from push output (e.g. "abc123..def456  main -> main")
STDOUT=$(echo "$INPUT" | jq -r '.tool_response.stdout // ""')
RANGE=$(echo "$STDOUT" | grep -oE '[0-9a-f]+\.\.[0-9a-f]+' | head -1 || true)

if [[ -z "$RANGE" ]]; then
  # No range found — might be "Everything up-to-date" or forced push
  echo '{}'
  exit 0
fi

# Get files changed in the pushed range
CHANGED_FILES=$(git diff --name-only "$RANGE" 2>/dev/null || true)

if [[ -z "$CHANGED_FILES" ]]; then
  echo '{}'
  exit 0
fi

# Filter for server-related files
SERVER_FILES=$(echo "$CHANGED_FILES" | grep -E '^(src/|Dockerfile|fly\.toml)' || true)

if [[ -z "$SERVER_FILES" ]]; then
  echo '{}'
  exit 0
fi

# Build the file list for the message
FILE_LIST=""
while IFS= read -r f; do
  FILE_LIST="${FILE_LIST}  - ${f}\n"
done <<< "$SERVER_FILES"

# Run fly deploy and capture output
DEPLOY_OUTPUT=$(fly deploy 2>&1) && DEPLOY_STATUS="SUCCESS" || DEPLOY_STATUS="FAILED"

MSG="AUTO-DEPLOY (${DEPLOY_STATUS}): Pushed server-related changes:\n${FILE_LIST}\nfly deploy output:\n${DEPLOY_OUTPUT}"

jq -n --arg msg "$MSG" '{"systemMessage": $msg}'
exit 0
