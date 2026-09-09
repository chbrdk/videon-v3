-- Free-arrange Cut video clips: placement on the Cut timeline (gaps + overlaps allowed).

alter table cut_scenes
  add column if not exists timeline_start_ms integer not null default 0
  check (timeline_start_ms >= 0);

-- Backfill contiguous layout from position order so existing Cuts keep the same program length.
with ordered as (
  select
    id,
    coalesce(
      sum(greatest(end_ms - start_ms, 0)) over (
        partition by cut_id
        order by position
        rows between unbounded preceding and 1 preceding
      ),
      0
    )::integer as computed_start
  from cut_scenes
)
update cut_scenes s
   set timeline_start_ms = ordered.computed_start
  from ordered
 where s.id = ordered.id
   and s.timeline_start_ms = 0
   and ordered.computed_start > 0;

create index if not exists cut_scenes_cut_timeline_idx
  on cut_scenes (cut_id, timeline_start_ms, position);
