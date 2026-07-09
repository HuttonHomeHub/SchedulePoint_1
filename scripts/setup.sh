#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-shot local development bootstrap for Blank App.
# Idempotent: safe to run repeatedly.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m warn:\033[0m %s\n' "$1"; }

# 1. Node version check ------------------------------------------------------
required_major=22
if command -v node >/dev/null 2>&1; then
  current_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$current_major" -lt "$required_major" ]; then
    warn "Node $current_major detected; Blank App requires >= $required_major (see .nvmrc)."
  fi
else
  warn "Node.js not found. Install Node >= $required_major (see .nvmrc)."
fi

# 2. pnpm via corepack -------------------------------------------------------
if ! command -v pnpm >/dev/null 2>&1; then
  info "Enabling pnpm via corepack"
  corepack enable
fi

# 3. Environment file --------------------------------------------------------
if [ ! -f .env ]; then
  info "Creating .env from .env.example"
  cp .env.example .env
  warn "Edit .env and set real secrets before running against real services."
fi

# 4. Dependencies ------------------------------------------------------------
info "Installing dependencies"
pnpm install --frozen-lockfile

# 5. Local infrastructure ----------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  info "Starting local PostgreSQL (docker compose)"
  docker compose up -d db
else
  warn "Docker not found; start PostgreSQL yourself or install Docker."
fi

info "Setup complete. Run 'pnpm dev' to start the apps."
