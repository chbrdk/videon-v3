-- Remember optional Cut destination for post-promote scene insert.

alter table media_generation_jobs
  add column if not exists target_cut_id uuid null references cuts(id) on delete set null;

alter table media_generation_jobs
  add column if not exists target_cut_inserted_at timestamptz null;

create index if not exists media_generation_jobs_target_cut_idx
  on media_generation_jobs (target_cut_id, created_at desc)
  where target_cut_id is not null;
