-- Durable Settings API tokens (Bearer videon_…).
-- Spec: specs/domain/settings-api-tokens.md
-- Owner is stored with the token hash so clients can resolve identity via POST /api/tokens/verify.

create table if not exists api_tokens (
  id text primary key,
  owner_id text not null check (length(trim(owner_id)) >= 8),
  label text not null default 'API token',
  prefix text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz null,
  constraint api_tokens_token_hash_unique unique (token_hash)
);

create index if not exists api_tokens_owner_id_idx on api_tokens (owner_id);
