-- Durable S3 multipart state for browser chunked uploads (MinIO community has no bucket CORS).
-- Spec companion: knowledge/paths.md object storage notes.

create table if not exists media_multipart_uploads (
  media_asset_id uuid primary key references media_assets(id) on delete cascade,
  workspace_id uuid not null references videon_workspaces(id) on delete restrict,
  s3_upload_id text not null,
  parts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_multipart_uploads_workspace_idx
  on media_multipart_uploads (workspace_id, created_at desc);
