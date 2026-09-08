-- Allow Premiere XMEML export alongside MP4.
-- Spec: specs/domain/cut-export-extras.md

alter table cut_exports
  drop constraint if exists cut_exports_format_check;

alter table cut_exports
  add constraint cut_exports_format_check
  check (format in ('mp4', 'premiere_xml'));
