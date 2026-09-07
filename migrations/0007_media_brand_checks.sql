-- Brand compliance seam: evidence + status owned by VIDEON; Brandion owns guideline truth.

alter table analysis_stage_runs
  drop constraint if exists analysis_stage_runs_stage_key_check;

alter table analysis_stage_runs
  add constraint analysis_stage_runs_stage_key_check
  check (stage_key in (
    'ingest',
    'probe',
    'scene_detect',
    'frame_sample',
    'audio',
    'vision',
    'brand_compliance',
    'aggregate',
    'index'
  ));

create table if not exists media_brand_checks (
  id uuid primary key,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  scene_key text not null,
  status text not null check (status in (
    'queued_pending_brandion',
    'running',
    'pass',
    'warn',
    'fail',
    'skipped'
  )),
  brandion_request_id text null,
  brand_candidates jsonb not null default '[]'::jsonb,
  evidence_frame_refs jsonb not null default '[]'::jsonb,
  result jsonb null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id, scene_key)
);

create index if not exists media_brand_checks_media_idx
  on media_brand_checks (media_asset_id, updated_at desc);

create index if not exists media_brand_checks_status_idx
  on media_brand_checks (status, updated_at desc);
