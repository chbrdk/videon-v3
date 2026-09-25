-- Cut ClientRoom export freigabe (Suite Enterprise E2).
-- Stores guidelineId / version / analysis run ids at approve time.

create table if not exists cut_client_room_approvals (
  id uuid primary key,
  cut_id text not null references cuts (id) on delete cascade,
  workspace_id text not null,
  export_id text references cut_exports (id) on delete set null,
  approved_by_plexon_user_id text not null,
  guideline_id text,
  guideline_version text,
  analysis_run_ids jsonb not null default '[]'::jsonb,
  brand_status text not null,
  created_at timestamptz not null default now()
);

create index if not exists cut_client_room_approvals_cut_idx
  on cut_client_room_approvals (cut_id, created_at desc);
