-- Voice / music stem artifacts produced during the audio analysis stage.

create table if not exists media_audio_stems (
  id uuid primary key,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  stem_kind text not null check (stem_kind in ('voice', 'music')),
  storage_key text not null,
  mime_type text not null default 'audio/wav',
  bytes bigint not null check (bytes > 0),
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  peaks jsonb not null default '[]'::jsonb,
  method text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_asset_id, analysis_run_id, stem_kind)
);

create index if not exists media_audio_stems_media_idx
  on media_audio_stems (media_asset_id, created_at desc);
