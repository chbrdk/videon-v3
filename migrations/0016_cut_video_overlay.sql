-- V2 video overlay track + clips (full-frame cover over V1).
-- Spec: specs/domain/cut-multi-track.md

alter table cut_tracks drop constraint if exists cut_tracks_kind_check;
alter table cut_tracks
  add constraint cut_tracks_kind_check check (kind in ('audio_bus', 'video_overlay'));

create table if not exists cut_video_clips (
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

create index if not exists cut_video_clips_cut_id_idx on cut_video_clips (cut_id);
create index if not exists cut_video_clips_track_id_idx on cut_video_clips (track_id);
create index if not exists cut_video_clips_timeline_idx
  on cut_video_clips (cut_id, timeline_start_ms, position);
