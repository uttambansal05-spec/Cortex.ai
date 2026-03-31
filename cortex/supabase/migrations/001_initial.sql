-- ============================================================
-- Cortex Database Schema
-- Migration: 001_initial
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Workspaces ──────────────────────────────────────────────
CREATE TABLE workspaces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug         TEXT UNIQUE,
  invite_code  TEXT UNIQUE DEFAULT substring(md5(random()::text), 1, 8),
  plan         TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Projects ────────────────────────────────────────────────
CREATE TABLE projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  github_repo_url      TEXT,
  github_repo_id       BIGINT,
  github_install_id    BIGINT,          -- GitHub App installation ID
  notion_workspace_id  TEXT,
  config               JSONB NOT NULL DEFAULT '{
    "ingest_scope": ["code", "prs"],
    "ignore_patterns": [],
    "default_branch": "main",
    "notion_database_id": null
  }',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Brain Snapshots ─────────────────────────────────────────
CREATE TABLE brain_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'building', 'complete', 'failed')),
  trigger          TEXT NOT NULL DEFAULT 'manual'
                     CHECK (trigger IN ('manual', 'pr_merge', 'scheduled')),
  trigger_ref      TEXT,               -- PR number, commit SHA, etc.
  staleness_score  FLOAT NOT NULL DEFAULT 0 CHECK (staleness_score >= 0 AND staleness_score <= 1),
  built_at         TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Brain Nodes ─────────────────────────────────────────────
CREATE TABLE brain_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id   UUID NOT NULL REFERENCES brain_snapshots(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_type     TEXT NOT NULL
                  CHECK (node_type IN (
                    'entity', 'decision', 'risk', 'gap',
                    'dependency', 'flow', 'api', 'model'
                  )),
  label         TEXT NOT NULL,
  summary       TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  source_file   TEXT,
  source_pr     TEXT,
  source_prd_id UUID,                  -- FK to prds added after
  embedding     vector(1536),          -- pgvector for semantic search
  fingerprint   TEXT NOT NULL,         -- for dedup across rebuilds
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── PRDs ────────────────────────────────────────────────────
CREATE TABLE prds (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_id    UUID REFERENCES brain_snapshots(id),
  feature_name   TEXT NOT NULL,
  content        TEXT NOT NULL,        -- Full Markdown PRD
  notion_url     TEXT,
  status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'review', 'approved', 'archived')),
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from brain_nodes to prds
ALTER TABLE brain_nodes
  ADD CONSTRAINT fk_brain_nodes_prd
  FOREIGN KEY (source_prd_id) REFERENCES prds(id);

-- ─── Intake Requests ─────────────────────────────────────────
CREATE TABLE intake_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  cortex_analysis   JSONB NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending', 'analysed', 'accepted',
                        'rejected', 'duplicate'
                      )),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────

-- Projects
CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_projects_github_repo ON projects(github_repo_id);

-- Brain Snapshots
CREATE INDEX idx_snapshots_project_created ON brain_snapshots(project_id, created_at DESC);
CREATE INDEX idx_snapshots_project_status ON brain_snapshots(project_id, status);

-- Brain Nodes
CREATE INDEX idx_nodes_snapshot ON brain_nodes(snapshot_id);
CREATE INDEX idx_nodes_project_type ON brain_nodes(project_id, node_type);
CREATE INDEX idx_nodes_fingerprint ON brain_nodes(fingerprint);
CREATE INDEX idx_nodes_label_search ON brain_nodes USING gin(to_tsvector('english', label || ' ' || coalesce(summary, '')));

-- pgvector ANN index (used when embeddings are populated)
CREATE INDEX idx_nodes_embedding ON brain_nodes
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- PRDs
CREATE INDEX idx_prds_project ON prds(project_id);

-- Intake
CREATE INDEX idx_intake_project ON intake_requests(project_id);
CREATE INDEX idx_intake_status ON intake_requests(project_id, status);

-- ─── Row Level Security ──────────────────────────────────────

ALTER TABLE workspaces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_nodes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_requests  ENABLE ROW LEVEL SECURITY;

-- Workspaces: owner only
CREATE POLICY "workspace_owner" ON workspaces
  FOR ALL USING (owner_id = auth.uid());

-- Projects: workspace owner
CREATE POLICY "project_workspace_owner" ON projects
  FOR ALL USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Brain snapshots: project owner
CREATE POLICY "snapshot_project_owner" ON brain_snapshots
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Brain nodes: same
CREATE POLICY "nodes_project_owner" ON brain_nodes
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.owner_id = auth.uid()
    )
  );

-- PRDs: same
CREATE POLICY "prds_project_owner" ON prds
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Intake: same
CREATE POLICY "intake_project_owner" ON intake_requests
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.owner_id = auth.uid()
    )
  );

-- ─── Staleness Updater ───────────────────────────────────────
-- Updates staleness_score when new PRs merge
-- Called from webhook handler via RPC

CREATE OR REPLACE FUNCTION update_staleness(p_project_id UUID, pr_count INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE brain_snapshots
  SET staleness_score = LEAST(1.0, staleness_score + (pr_count * 0.08))
  WHERE project_id = p_project_id
    AND status = 'complete'
    AND id = (
      SELECT id FROM brain_snapshots
      WHERE project_id = p_project_id AND status = 'complete'
      ORDER BY created_at DESC
      LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Updated_at triggers ─────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_prds_updated_at
  BEFORE UPDATE ON prds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_intake_updated_at
  BEFORE UPDATE ON intake_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Auto-create workspace on user signup ────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspaces (owner_id, name, slug)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.id::text   -- use user UUID as slug initially
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
