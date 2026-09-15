-- Durable AI generative edit/create jobs + promoted asset lineage.

create table if not exists media_generation_jobs (
  id uuid primary key,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  workspace_id uuid not null references videon_workspaces(id) on delete restrict,
  requested_by_plexon_user_id uuid not null,
  intent text not null check (intent in ('edit', 'create')),
  lane text not null check (lane in ('draft', 'final')),
  model_id text not null,
  prompt text not null,
  start_ms integer null check (start_ms is null or start_ms >= 0),
  end_ms integer null check (end_ms is null or end_ms >= 0),
  skip_draft boolean not null default false,
  keep_source_audio boolean not null default true,
  reference_image_urls jsonb not null default '[]'::jsonb,
  seed integer null,
  lock_pack jsonb not null default '{}'::jsonb,
  lock_pack_hash text null,
  status text not null check (status in (
    'queued', 'running', 'draft_ready', 'succeeded', 'failed', 'cancelled'
  )),
  progress_percent integer null check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)),
  slice_storage_key text null,
  draft_storage_key text null,
  draft_bytes bigint null check (draft_bytes is null or draft_bytes > 0),
  final_storage_key text null,
  final_bytes bigint null check (final_bytes is null or final_bytes > 0),
  promoted_media_asset_id uuid null references media_assets(id) on delete set null,
  provider_request_id text null,
  error_message text null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  check (
    (intent = 'edit' and start_ms is not null and end_ms is not null and end_ms > start_ms)
    or (intent = 'create' and start_ms is null and end_ms is null)
  )
);

create index if not exists media_generation_jobs_media_idx
  on media_generation_jobs (media_asset_id, created_at desc);

create index if not exists media_generation_jobs_workspace_idx
  on media_generation_jobs (workspace_id, status, created_at desc);

create table if not exists media_asset_lineage (
  id uuid primary key,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  workspace_id uuid not null references videon_workspaces(id) on delete restrict,
  source_media_asset_id uuid null references media_assets(id) on delete set null,
  source_start_ms integer null check (source_start_ms is null or source_start_ms >= 0),
  source_end_ms integer null check (source_end_ms is null or source_end_ms >= 0),
  generation_job_id uuid null references media_generation_jobs(id) on delete set null,
  model_id text null,
  prompt text null,
  lock_pack_hash text null,
  created_at timestamptz not null default now(),
  unique (media_asset_id)
);

create index if not exists media_asset_lineage_source_idx
  on media_asset_lineage (source_media_asset_id, created_at desc);
