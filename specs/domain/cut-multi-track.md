# Cut multi-track (audio bus + V2 video overlay)

**Status:** Accepted — 2026-09-09 (V2 overlay wave)  
**Companions:** `cut-multi-source-compose.md` · `cut-export-extras.md` · `videon-ui-surfaces.md` · `specs/api/cuts.md`  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Independent Cut tracks beyond the flat V1 `cut_scenes` video model:

1. **Audio bus** — Voice-Over / music overlays (`cut_audio_clips`).
2. **V2 video overlay** — free-place full-frame overlay lane (`cut_video_clips`) that covers V1 when unmuted.

## Keep / drop

| Concern | Decision |
|---------|----------|
| V1 video sequence | **Keep** — `cut_scenes` remains authoritative for main video |
| Stem lanes A1/A2 | **Keep as visuals** — derived from media stems, not bus clips |
| Extra audio bus | **Keep** — `cut_tracks` + `cut_audio_clips` |
| V2 video overlay | **Keep** — `cut_tracks.kind = video_overlay` + `cut_video_clips` (full-frame cover, no PiP) |
| PiP / transforms / opacity / soft transitions | **Drop** this wave |
| Multiple overlay lanes | **Drop** — one V2 track only |
| V2 clip audio in program mix | **Drop** — video-only overlay; A1/A2 stay on V1; bus unchanged |
| Mic capture / TTS voice-replace | **Drop** — spur ready only |

## Model

### `cut_tracks`

| Field | Rules |
|-------|-------|
| `kind` | `audio_bus` \| `video_overlay` (reserved later: `video_main`, `audio_linked`) |
| `index` | Order among same-kind tracks; default bus/overlay at `0` |
| `name` | Display (`Voice-Over` / `V2`) |
| `muted` | Boolean; mute bus audio or hide V2 video in playback/export |

On Cut create (or first access), the system MUST ensure:

- one default `audio_bus` track named `Voice-Over`;
- one default `video_overlay` track named `V2`.

### `cut_audio_clips`

| Field | Rules |
|-------|-------|
| `track_id` | FK `cut_tracks` (`audio_bus`) |
| `media_asset_id` | Ready media in workspace (audio or video-with-audio) |
| `timeline_start_ms` | Placement on Cut timeline (≥ 0) |
| `start_ms` / `end_ms` | Source in/out; `end > start`; min 500 ms |
| `position` | Order on track for stable listing |

Clips MAY overlap on the bus (export MUST mix all unmuted clips).

### `cut_video_clips`

| Field | Rules |
|-------|-------|
| `track_id` | FK `cut_tracks` (`video_overlay`) |
| `media_asset_id` | Ready media in workspace |
| `timeline_start_ms` | Placement on Cut timeline (≥ 0); gaps/overlaps allowed |
| `start_ms` / `end_ms` | Source in/out; `end > start`; min 500 ms |
| `position` | Order on track; at overlap on V2, higher `position` wins |

## Surfaces / API

| Action | Behavior |
|--------|----------|
| GET cut detail | Include `tracks` + `audioClips` + `videoClips` |
| `addAudioClip` / `trimAudioClip` / `moveAudioClip` / `deleteAudioClip` | Audio bus edits |
| `addVideoClip` / `trimVideoClip` / `moveVideoClip` / `deleteVideoClip` | V2 overlay edits |
| `setTrackMuted` | Toggle mute for audio bus or V2 by `trackId` |

## Playback / export

### Program video

At Cut time `t`:

1. If the V2 track is unmuted and a V2 clip covers `t` → show that clip (higher `position` wins on V2 overlaps).
2. Else use V1 winner (`cut_scenes` / higher `position`).
3. Else black / gap.

V2 is **video-only** in the program mix (no V2 clip audio).

### Audio bus

- Program monitor MUST mix unmuted bus clips with V1.
- MP4 export MUST mix bus audio onto the program mix when unmuted clips exist.
- Premiere ZIP MUST include bus source files under `media/` and map them to additional XMEML audio tracks.

### V2 export

- MP4 program slices MUST prefer unmuted V2 over V1 for covered intervals.
- Premiere ZIP MUST place V2 clips on a second XMEML video track at `timeline_start_ms`.

## Requirements (EARS)

1. WHEN a Cut is loaded THEN at least one `audio_bus` and one `video_overlay` track MUST exist (create-on-read allowed).
2. WHEN `addAudioClip` / `addVideoClip` succeeds THEN GET cut detail MUST return the clip on that track.
3. WHEN the bus track is muted THEN playback and MP4 export MUST omit bus audio.
4. WHEN the V2 track is muted THEN playback and MP4 export MUST ignore V2 and show V1 only.
5. WHERE stem lanes render THEN they MUST remain read-only Source Audio visuals.
6. WHEN unmuted V2 and V1 both cover `t` THEN program video MUST show V2.

## Acceptance

- [ ] Default Voice-Over and V2 tracks visible
- [ ] Drop/add/move/trim/delete on bus and V2
- [ ] Program shows V2 over V1 when unmuted; mute V2 restores V1
- [ ] MP4 export respects V2 overlay + bus audio
- [ ] Premiere ZIP imports with V2 video track + bus audio
