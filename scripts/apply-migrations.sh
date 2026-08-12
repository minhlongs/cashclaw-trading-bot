#!/usr/bin/env bash
# Apply D1 migrations to local or remote database
# Usage: bash scripts/apply-migrations.sh [local|remote]
# Default: local

set -euo pipefail

ENV="${1:-local}"
DB_NAME="cashclaw-db"
MIGRATIONS_DIR="migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "No migrations directory found at $MIGRATIONS_DIR"
  exit 1
fi

echo "Applying migrations to $ENV database: $DB_NAME"

if [ "$ENV" = "remote" ]; then
  for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    echo "  → $f"
    npx wrangler d1 execute "$DB_NAME" --remote --file="$f"
  done
else
  for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    echo "  → $f"
    npx wrangler d1 execute "$DB_NAME" --local --file="$f"
  done
fi

echo "Done. All migrations applied to $ENV."
