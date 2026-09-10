-- Broaden Premiere NLE sidecars: clip residual XML + V1 track + sequence extras.
-- Column premiere_filters_xml now holds full clipitem sidecar (filters + other extras).

alter table cut_scenes
  add column if not exists premiere_filters_xml text;

comment on column cut_scenes.premiere_filters_xml is
  'Opaque XMEML clipitem residual (filters, labels, markers, …). Re-injected on premiere_xml export. No Videon UI.';

alter table cuts
  add column if not exists premiere_v1_track_sidecar_xml text,
  add column if not exists premiere_sequence_extras_xml text;

comment on column cuts.premiere_v1_track_sidecar_xml is
  'Opaque V1 track XML after clipitems removed (transitions, generators, titles). Re-injected on export.';

comment on column cuts.premiere_sequence_extras_xml is
  'Opaque sequence-level XMEML extras (markers, …) outside media. Re-injected on export.';
