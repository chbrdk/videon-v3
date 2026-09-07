-- Allow pipeline stages to be recorded as skipped when not in requested_capabilities.

alter table analysis_stage_runs
  drop constraint if exists analysis_stage_runs_status_check;

alter table analysis_stage_runs
  add constraint analysis_stage_runs_status_check
  check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped'));
