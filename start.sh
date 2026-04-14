#!/bin/bash
# Start Wiki.js server

# Load .env if present (does NOT override already-set env vars)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    # Only set if not already defined
    if [ -z "${!key+x}" ]; then
      export "$key=$value"
    fi
  done < "$SCRIPT_DIR/.env"
fi

cd "$SCRIPT_DIR/wiki" && node server
