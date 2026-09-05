-- Transcripts, cuts foundation, and searchable scene index.

create table if not exists media_transcripts (
  id uuid primary key,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  language text not null default 'de',
  status text not null check (status in ('pending', 'ready', 'skipped', 'failed')),
  transcript_text text null,
  segments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id)
);

create index if not exists media_transcripts_media_idx
  on media_transcripts (media_asset_id, created_at desc);

create table if not exists cuts (
  id uuid primary key,
  workspace_id uuid not null references videon_workspaces(id) on delete restrict,
  created_by_plexon_user_id uuid not null,
  name text not null,
  width integer null check (width is null or width > 0),
  height integer null check (height is null or height > 0),
  frame_rate numeric(8,3) null check (frame_rate is null or frame_rate > 0),
  status text not null check (status in ('draft', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cuts_workspace_status_idx
  on cuts (workspace_id, status, updated_at desc);

create table if not exists cut_scenes (
  id uuid primary key,
  cut_id uuid not null references cuts(id) on delete cascade,
  position integer not null check (position >= 0),
  media_asset_id uuid not null references media_assets(id) on delete restrict,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms > start_ms),
  created_at timestamptz not null default now(),
  unique (cut_id, position)
);

create index if not exists cut_scenes_media_idx
  on cut_scenes (media_asset_id);

create table if not exists media_search_entries (
  id uuid primary key,
  workspace_id uuid not null references videon_workspaces(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  scene_key text null,
  search_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists media_search_entries_workspace_idx
  on media_search_entries (workspace_id, created_at desc);

create index if not exists media_search_entries_text_idx
  on media_search_entries using gin (to_tsvector('simple', search_text));
