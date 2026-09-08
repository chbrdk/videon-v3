-- Durable media reframe jobs (aspect-crop derivatives).

create table if not exists media_reframes (
  id uuid primary key,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  workspace_id uuid not null references videon_workspaces(id) on delete restrict,
  requested_by_plexon_user_id uuid not null,
  aspect_ratio text not null check (aspect_ratio in ('9:16', '16:9', '1:1', 'custom')),
  custom_width integer null check (custom_width is null or (custom_width > 0 and custom_width <= 3840)),
  custom_height integer null check (custom_height is null or (custom_height > 0 and custom_height <= 3840)),
  smoothing_factor double precision not null default 0.3
    check (smoothing_factor >= 0 and smoothing_factor <= 1),
  saliency_model text not null default 'robust_v1' check (saliency_model in ('robust_v1')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  progress_percent integer null check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)),
  storage_key text null,
  bytes bigint null check (bytes is null or bytes > 0),
  error_message text null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  check (
    (aspect_ratio <> 'custom' and custom_width is null and custom_height is null)
    or (aspect_ratio = 'custom' and custom_width is not null and custom_height is not null)
  )
);

create index if not exists media_reframes_media_idx
  on media_reframes (media_asset_id, created_at desc);

create index if not exists media_reframes_workspace_idx
  on media_reframes (workspace_id, status, created_at desc);
