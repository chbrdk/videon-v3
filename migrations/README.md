# Database migrations

Apply migrations through the deployment migration job, before the application starts. The web and worker images must never issue schema push, drop, or data-loss commands on startup.

`0001_videon_workspaces.sql` establishes the Collection mirror. `0002_media_pipeline_foundation.sql` adds Collection-scoped media, durable analysis stages, and versioned insight/provenance records. `0003_workspace_member_projection.sql` adds the fail-closed Access Model B membership projection. `0020_media_generation_jobs.sql` adds AI generative edit jobs (`media_generation_jobs`) and promoted-asset lineage (`media_asset_lineage`). `0021_media_generation_create.sql` allows create-intent jobs without parent media. `0022_media_generation_target_cut.sql` stores optional `target_cut_id` for post-promote Cut insert. Storage and queue implementations remain adapters; they do not own the domain state.
