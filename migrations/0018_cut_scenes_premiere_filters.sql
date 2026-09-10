-- Opaque Premiere clipitem <filter>…</filter> XML sidecar for Cut ↔ Premiere FX round-trip.
-- Not shown in Videon UI; re-emitted into premiere_xml export. Spec Wave P3.

alter table cut_scenes
  add column if not exists premiere_filters_xml text;

comment on column cut_scenes.premiere_filters_xml is
  'Opaque XMEML <filter> blocks from Premiere pushback; re-injected on premiere_xml export. No Videon UI.';
