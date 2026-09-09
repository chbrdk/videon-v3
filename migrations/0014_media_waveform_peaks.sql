-- Mix (original) waveform peaks for editor timelines — independent of Demucs stems.

create table if not exists media_waveform_peaks (
  id uuid primary key,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  peaks jsonb not null default '[]'::jsonb,
  buckets integer not null default 240 check (buckets > 0 and buckets <= 512),
  method text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_asset_id, analysis_run_id)
);

create index if not exists media_waveform_peaks_media_idx
  on media_waveform_peaks (media_asset_id, created_at desc);
