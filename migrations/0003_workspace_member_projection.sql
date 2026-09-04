-- PLEXON Access Model B projection. Apply with the reviewed deployment migration job.
create table if not exists videon_workspace_members (
  workspace_id uuid not null references videon_workspaces(id) on delete cascade,
  plexon_user_id uuid not null,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, plexon_user_id)
);

create index if not exists videon_workspace_members_user_idx
  on videon_workspace_members (plexon_user_id, workspace_id);
