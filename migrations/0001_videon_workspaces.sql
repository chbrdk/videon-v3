-- Reviewed migration; never run schema push from an application startup command.
create table if not exists videon_workspaces (
  id uuid primary key,
  platform_project_id uuid not null unique,
  platform_company_id uuid not null,
  owner_plexon_user_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  domain text null,
  status text not null check (status in ('active', 'archived')),
  federation_contract_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists videon_workspaces_company_idx
  on videon_workspaces (platform_company_id, status);

create index if not exists videon_workspaces_owner_idx
  on videon_workspaces (owner_plexon_user_id, status);
