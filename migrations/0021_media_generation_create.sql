-- Allow create-intent generation jobs without a parent media asset.

alter table media_generation_jobs
  alter column media_asset_id drop not null;

alter table media_generation_jobs
  drop constraint if exists media_generation_jobs_check;

alter table media_generation_jobs
  add constraint media_generation_jobs_intent_range_check check (
    (intent = 'edit' and media_asset_id is not null and start_ms is not null and end_ms is not null and end_ms > start_ms)
    or (intent = 'create' and start_ms is null and end_ms is null)
  );

alter table media_generation_jobs
  add column if not exists duration_seconds integer null
    check (duration_seconds is null or (duration_seconds >= 4 and duration_seconds <= 30));

alter table media_generation_jobs
  add column if not exists aspect_ratio text null
    check (aspect_ratio is null or aspect_ratio in ('16:9', '9:16', '1:1', 'auto'));
