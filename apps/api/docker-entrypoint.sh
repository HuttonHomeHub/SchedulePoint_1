#!/bin/sh
# Runtime entrypoint for the API image: apply any pending database migrations,
# then start the server. `prisma migrate deploy` is idempotent (applies only
# unapplied migrations) and safe to run on every boot; it serialises via a
# Postgres advisory lock, so concurrent replicas won't double-apply.
set -e

# A copy of the database before it is changed (ADR-0192 D9, spec §4.12). The command does nothing
# unless the operator mounted a backups folder AND a migration is pending, and then it writes the
# copy first. A non-zero exit means "no safe copy": `set -e` above turns that into "stop here", so the
# container exits before `prisma migrate deploy` and the database is left as it was; Docker restarts
# the container, so fixing the cause (usually disk space) lets the update finish by itself. Removing
# `set -e` would silently remove the hold. Its start-up cost with nothing pending is one query. A
# copy of a large database lengthens the boot; the image's healthcheck start period (300 s) is sized
# for that, so `web`, which waits for this container to be healthy, is not left behind by a long copy.
echo "[entrypoint] checking whether a copy is needed before the database changes..."
sh /app/backup/schedulepoint-backup.sh pre-migrate

echo "[entrypoint] applying database migrations..."
node_modules/.bin/prisma migrate deploy

echo "[entrypoint] starting API..."
exec node dist/main.js
