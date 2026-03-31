#!/bin/bash
set -e

echo "───────────────────────────────────────"
echo "  Cortex — Dev Environment Setup"
echo "───────────────────────────────────────"

# ── pnpm ──────────────────────────────────
echo "→ Installing pnpm..."
npm install -g pnpm@9
pnpm install

# ── Python deps ───────────────────────────
echo "→ Installing Python dependencies..."
cd apps/api
pip install -r requirements.txt --quiet
cd ../..

# ── Redis via Docker ──────────────────────
echo "→ Starting Redis..."
docker run -d --name cortex-redis -p 6379:6379 redis:7-alpine

# ── Env file templates ────────────────────
echo "→ Creating .env files from templates..."

if [ ! -f apps/web/.env.local ]; then
  cp apps/web/.env.template apps/web/.env.local
  echo "  ✓ apps/web/.env.local created — fill in Supabase keys"
fi

if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.template apps/api/.env
  echo "  ✓ apps/api/.env created — fill in API keys"
fi

# ── Supabase CLI ──────────────────────────
echo "→ Installing Supabase CLI..."
npm install -g supabase --quiet

echo ""
echo "───────────────────────────────────────"
echo "  Setup complete. Next steps:"
echo ""
echo "  1. Fill in .env files with your keys"
echo "     (Supabase, Anthropic, Gemini)"
echo ""
echo "  2. Run the DB migration:"
echo "     supabase link --project-ref YOUR_REF"
echo "     supabase db push"
echo ""
echo "  3. Start everything:"
echo "     pnpm dev:all"
echo "───────────────────────────────────────"
