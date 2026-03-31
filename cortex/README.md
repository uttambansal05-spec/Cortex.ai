# Cortex — Product Brain Platform

> AI-native product development lifecycle orchestration. One Brain. Every tool.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14, Tailwind, Supabase SSR |
| Backend API | FastAPI, Python 3.12 |
| Brain workers | Celery + Redis |
| Database | Supabase (Postgres + pgvector) |
| AI — extract | Gemini 2.0 Flash |
| AI — synthesise/query | Claude Haiku / Sonnet |
| Hosting — frontend | Vercel |
| Hosting — backend | Railway |

## Monorepo Structure

```
cortex/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # FastAPI backend + workers
├── packages/
│   └── shared/       # Shared TypeScript types
└── supabase/
    └── migrations/   # SQL migrations
```

## Local Development

### Prerequisites
- Node.js 20+, pnpm 9+
- Python 3.12+
- Docker (for Redis)

### 1. Clone and install

```bash
git clone https://github.com/your-org/cortex
cd cortex
pnpm install
```

### 2. Set up environment variables

```bash
# Frontend
cp apps/web/.env.template apps/web/.env.local

# Backend
cp apps/api/.env.template apps/api/.env
```

Fill in:
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` → Supabase project settings
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` → same project
- `ANTHROPIC_API_KEY` → Anthropic console
- `GEMINI_API_KEY` → Google AI Studio

### 3. Set up Supabase

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push
```

### 4. Start Redis

```bash
docker-compose up redis -d
```

### 5. Start backend

```bash
cd apps/api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# In another terminal: start Celery worker
celery -A workers.build_brain.celery_app worker --loglevel=info
```

### 6. Start frontend

```bash
cd apps/web
pnpm dev
```

Open http://localhost:3000

---

## Deployment

### Frontend → Vercel
```bash
# Connect GitHub repo in Vercel dashboard
# Set environment variables in Vercel project settings
# Auto-deploys on push to main
```

### Backend → Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

railway login
railway link
railway up
```

Set environment variables in Railway dashboard. Deploy both `api` and `worker` services.

### Database → Supabase
```bash
supabase db push  # runs migrations against your project
```

---

## Brain Pipeline

```
GitHub repo
    ↓ ingest (github.py)
File list
    ↓ chunk (chunker.py)
Chunks
    ↓ extract parallel (gemini.py)
JSON extractions
    ↓ synthesise (claude.py)
Knowledge graph
    ↓ store (brain_writer.py)
Supabase (brain_nodes + brain_snapshots)
```

Triggered via:
1. Manual: POST `/api/v1/brain/{project_id}/build`
2. PR merge: GitHub webhook → POST `/api/v1/webhooks/github`

---

## Key Files

| File | Purpose |
|---|---|
| `apps/api/pipeline/` | Core Brain pipeline — your IP |
| `apps/api/agents/` | Query, PRD, Intake agents |
| `apps/api/workers/build_brain.py` | Celery task orchestrator |
| `apps/web/components/brain/` | Brain UI components |
| `supabase/migrations/001_initial.sql` | Complete DB schema |
