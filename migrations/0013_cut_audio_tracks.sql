-- Extra audio bus tracks for Cuts (Voice-Over ready).
-- Spec: specs/domain/cut-multi-track.md

create table if not exists cut_tracks (
  id uuid primary key,
  cut_id uuid not null references cuts(id) on delete cascade,
  kind text not null check (kind in ('audio_bus')),
  track_index integer not null check (track_index >= 0),
  name text not null,
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (cut_id, kind, track_index)
);

create index if not exists cut_tracks_cut_id_idx on cut_tracks (cut_id);

create table if not exists cut_audio_clips (
  id uuid primary key,
  track_id uuid not null references cut_tracks(id) on delete cascade,
  cut_id uuid not null references cuts(id) on delete cascade,
  position integer not null check (position >= 0),
  media_asset_id uuid not null references media_assets(id),
  timeline_start_ms integer not null check (timeline_start_ms >= 0),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms > start_ms),
  created_at timestamptz not null default now(),
  unique (track_id, position)
);

create index if not exists cut_audio_clips_cut_id_idx on cut_audio_clips (cut_id);
create index if not exists cut_audio_clips_track_id_idx on cut_audio_clips (track_id);
