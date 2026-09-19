#!/bin/sh
set -e

echo "Running database migrations..."
node dist/db/migrate.js

# Seed solo se ejecuta si RUN_SEED=true (nunca en producción por defecto)
if [ "$RUN_SEED" = "true" ]; then
  echo "Running seed (RUN_SEED=true)..."
  node dist/db/seed.js
else
  echo "Seed skipped (set RUN_SEED=true to enable)"
fi

echo "Starting server..."
exec node dist/index.js
