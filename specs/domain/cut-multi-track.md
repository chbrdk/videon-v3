# Cut multi-track (extra audio bus)

**Status:** Accepted — 2026-09-09  
**Companions:** `cut-multi-source-compose.md` · `cut-export-extras.md` · `videon-ui-surfaces.md` · `specs/api/cuts.md`  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Add at least one **independent audio bus track** on a Cut for overlays (music, future voice-over assets) without replacing the flat V1 `cut_scenes` video model.

## Keep / drop

| Concern | Decision |
|---------|----------|
| V1 video sequence | **Keep** — `cut_scenes` remains authoritative for video |
| Stem lanes A1/A2 | **Keep as visuals** — derived from media stems, not bus clips |
| Extra audio bus | **Keep** — `cut_tracks` + `cut_audio_clips` |
| Multi-video tracks / transitions | **Drop** this wave |
| Mic capture / TTS voice-replace | **Drop** — spur ready only |

## Model

### `cut_tracks`

| Field | Rules |
|-------|-------|
| `kind` | `audio_bus` (this wave); reserved: `video_main`, `audio_linked` |
| `index` | Order among same-kind tracks; default bus at `0` |
| `name` | Display (default `Voice-Over`) |
| `muted` | Boolean; mute bus in playback/export |

On Cut create (or first access), the system MUST ensure one default `audio_bus` track named `Voice-Over`.

### `cut_audio_clips`

| Field | Rules |
|-------|-------|
| `track_id` | FK `cut_tracks` |
| `media_asset_id` | Ready media in workspace (audio or video-with-audio) |
| `timeline_start_ms` | Placement on Cut timeline (≥ 0) |
| `start_ms` / `end_ms` | Source in/out; `end > start`; min 500 ms |
| `position` | Order on track for stable listing |

Clips MAY overlap on the bus (later clip wins in simple mix, or both mixed — export MUST mix all unmuted clips).

## Surfaces / API

| Action | Behavior |
|--------|----------|
| `listAudio` (GET cut detail) | Include `tracks` + `audioClips` |
| `addAudioClip` | Insert on default or named `trackId` |
| `trimAudioClip` / `moveAudioClip` / `deleteAudioClip` | Edit placement / source range |
| `setTrackMuted` | Toggle bus mute |

## Playback / export

- Program monitor MUST mix unmuted bus clips with V1 (HTML audio elements synced to Cut playhead, or export-time ffmpeg mix).
- MP4 export MUST mix bus audio onto the program mix when unmuted clips exist.
- Premiere ZIP MUST include bus source files under `media/` and map them to additional XMEML audio tracks with correct `<in>`/`<out>` and timeline `start`/`end` (no bogus `pproTicks*`).

## Requirements (EARS)

1. WHEN a Cut is loaded THEN at least one `audio_bus` track MUST exist (create-on-read allowed).
2. WHEN `addAudioClip` succeeds THEN GET cut detail MUST return the clip on that track.
3. WHEN the bus track is muted THEN playback and MP4 export MUST omit bus audio.
4. WHERE stem lanes render THEN they MUST remain read-only Source Audio visuals.

## Acceptance

- [ ] Default Voice-Over track visible under stem lanes
- [ ] Drop/add audio (or video) asset as bus clip; trim/move/delete
- [ ] MP4 export contains bus audio when unmuted
- [ ] Premiere ZIP imports with linked bus audio
