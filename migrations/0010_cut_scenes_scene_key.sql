-- Optional provenance key from analysis / search (times remain export truth).

alter table cut_scenes
  add column if not exists scene_key text null;
