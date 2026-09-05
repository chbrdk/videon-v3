-- Durable cut export jobs.

create table if not exists cut_exports (
  id uuid primary key,
  cut_id uuid not null references cuts(id) on delete cascade,
  workspace_id uuid not null references videon_workspaces(id) on delete restrict,
  requested_by_plexon_user_id uuid not null,
  format text not null check (format in ('mp4')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  storage_key text null,
  bytes bigint null check (bytes is null or bytes > 0),
  error_message text null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists cut_exports_cut_idx
  on cut_exports (cut_id, created_at desc);

create index if not exists cut_exports_workspace_idx
  on cut_exports (workspace_id, status, created_at desc);
