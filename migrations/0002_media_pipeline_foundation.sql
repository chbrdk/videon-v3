-- Durable media / analysis foundation. Apply via the deployment migration job.

create table if not exists media_assets (
  id uuid primary key,
  workspace_id uuid not null references videon_workspaces(id) on delete restrict,
  created_by_plexon_user_id uuid not null,
  storage_key text not null,
  original_filename text not null,
  mime_type text not null,
  bytes bigint not null check (bytes > 0),
  checksum_sha256 text not null,
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  width integer null check (width is null or width > 0),
  height integer null check (height is null or height > 0),
  frame_rate numeric(8,3) null check (frame_rate is null or frame_rate > 0),
  lifecycle_state text not null check (lifecycle_state in ('uploading', 'uploaded', 'processing', 'ready', 'failed', 'archived')),
  retention_policy_version text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, checksum_sha256)
);

create index if not exists media_assets_workspace_state_idx
  on media_assets (workspace_id, lifecycle_state, created_at desc);

create table if not exists analysis_runs (
  id uuid primary key,
  media_asset_id uuid not null references media_assets(id) on delete restrict,
  requested_by_plexon_user_id uuid not null,
  pipeline_version text not null,
  scene_schema_version text not null,
  requested_capabilities jsonb not null default '[]'::jsonb,
  input_fingerprint text not null,
  idempotency_key text not null,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  cancel_requested_at timestamptz null,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_asset_id, pipeline_version, input_fingerprint, idempotency_key)
);

create index if not exists analysis_runs_media_status_idx
  on analysis_runs (media_asset_id, status, created_at desc);

create table if not exists analysis_stage_runs (
  id uuid primary key,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  stage_key text not null check (stage_key in ('ingest', 'probe', 'scene_detect', 'frame_sample', 'audio', 'vision', 'aggregate', 'index')),
  input_fingerprint text not null,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempt integer not null default 0 check (attempt >= 0),
  worker_lease_id text null,
  progress_completed integer not null default 0 check (progress_completed >= 0),
  progress_total integer not null default 0 check (progress_total >= 0),
  error_code text null,
  error_message text null,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id, stage_key, input_fingerprint)
);

create index if not exists analysis_stage_runs_status_idx
  on analysis_stage_runs (status, created_at);

create table if not exists scene_insights (
  id uuid primary key,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  scene_key text not null,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms >= start_ms),
  frame_refs jsonb not null,
  insight jsonb not null,
  schema_version text not null,
  requested_model text not null,
  actual_model text not null,
  provider text null,
  openrouter_request_id text null,
  prompt_version text not null,
  prompt_tokens integer null check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens integer null check (completion_tokens is null or completion_tokens >= 0),
  reasoning_tokens integer null check (reasoning_tokens is null or reasoning_tokens >= 0),
  cached_tokens integer null check (cached_tokens is null or cached_tokens >= 0),
  provider_cost_usd numeric(14, 8) null check (provider_cost_usd is null or provider_cost_usd >= 0),
  created_at timestamptz not null default now(),
  unique (analysis_run_id, scene_key, schema_version)
);

create index if not exists scene_insights_analysis_range_idx
  on scene_insights (analysis_run_id, start_ms, end_ms);
