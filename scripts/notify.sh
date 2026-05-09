#!/bin/bash
# Telegram notification script
# Usage: ./scripts/notify.sh "your message"
# Or with env vars: TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx ./scripts/notify.sh "msg"

set -e

# Config - set these or export as environment variables
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Allow override via .env.local
ENV_FILE="$(dirname "$0")/../.env.local"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  BOT_TOKEN="${BOT_TOKEN:-$TELEGRAM_BOT_TOKEN}"
  CHAT_ID="${CHAT_ID:-$TELEGRAM_CHAT_ID}"
fi

if [[ -z "$BOT_TOKEN" ]]; then
  echo "Error: TELEGRAM_BOT_TOKEN is not set" >&2
  exit 1
fi

if [[ -z "$CHAT_ID" ]]; then
  echo "Error: TELEGRAM_CHAT_ID is not set" >&2
  exit 1
fi

MESSAGE="${1:-}"
if [[ -z "$MESSAGE" ]]; then
  echo "Usage: $0 <message>" >&2
  exit 1
fi

# Send message via Telegram Bot API
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{
    \"chat_id\": \"${CHAT_ID}\",
    \"text\": \"${MESSAGE}\",
    \"parse_mode\": \"HTML\"
  }")

# Check response
OK=$(echo "$RESPONSE" | grep -o '"ok":true' || true)
if [[ -n "$OK" ]]; then
  echo "Message sent successfully"
else
  echo "Failed to send message: $RESPONSE" >&2
  exit 1
fi
