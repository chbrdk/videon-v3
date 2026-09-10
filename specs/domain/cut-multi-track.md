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
| Stem lanes A1/A2 (V1) | **Keep as visuals** — derived from V1 media stems, not bus clips |
| Stem lanes V2-A1/V2-A2 + V2-TX | **Keep as visuals** — derived from V2 `cut_video_clips` media (stems + transcript) |
| Extra audio bus | **Keep** — one shared VO bus (`cut_tracks` + `cut_audio_clips`) after V2 companions |
| V2 video overlay | **Keep** — `cut_tracks.kind = video_overlay` + `cut_video_clips` (full-frame cover, no PiP) |
| Lane-aware program stems | **Keep** — when unmuted V2 covers playhead, monitor uses that clip’s stems + V2-A1/A2 mute |
| PiP / transforms / opacity / soft transitions | **Drop** this wave |
| Multiple overlay lanes | **Drop** — one V2 track only |
| Second VO bus per video lane | **Drop** — one shared A3 bus only |
| V2 original (non-stem) in program mix | **Drop** — stems or silent when no stems (same as V1 split-out) |
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
| `moveClipLane` | Move clip between V1 (`cut_scenes`) and V2 (`cut_video_clips`); keep media + in/out |
| `setTrackMuted` | Toggle mute for audio bus or V2 by `trackId` |

## Playback / export

### Program video

At Cut time `t`:

1. If the V2 track is unmuted and a V2 clip covers `t` → show that clip (higher `position` wins on V2 overlaps).
2. Else use V1 winner (`cut_scenes` / higher `position`).
3. Else black / gap.

### Companion Source Audio + TX (UI)

Cut timeline lane order MUST be:

`V1 → A1/A2/TX → V2 → V2-A1/V2-A2/V2-TX → A3 (VO)`

- V1 A1/A2/TX are read-only visuals bound to `cut_scenes` media.
- V2-A1/V2-A2/V2-TX are read-only visuals bound to `cut_video_clips` media (same stem/transcript maps keyed by `mediaAssetId`).
- Companion lanes are **not** `cut_tracks` rows and are **not** editable bus clips.

### Program monitor audio (lane-aware)

At Cut time `t`:

1. Resolve program video winner (`findProgramVideoAtCutMs`).
2. If winner is V2 → play that clip’s voice/music stems; mute keys are V2-A1 / V2-A2.
3. Else if winner is V1 → play that scene’s stems; mute keys are A1 / A2.
4. Always mix unmuted VO bus clips on top.

MP4 export / Premiere MAY continue to treat V2 as video-only for mux (stems stay monitor UX); VO bus export rules unchanged.

### Audio bus

- Program monitor MUST mix unmuted bus clips with the active video lane’s stems.
- MP4 export MUST mix bus audio onto the program mix when unmuted clips exist.
- WHEN VO extends past picture THEN MP4 MUST pad program length through the bus end (`cut-export-extras.md`).
- Premiere ZIP MUST include bus source files under `media/` and map them to additional XMEML audio tracks.

### V2 export

- MP4 program slices MUST prefer unmuted V2 over V1 for covered intervals.
- Premiere ZIP MUST place V2 clips on a second XMEML video track at `timeline_start_ms`.
- Premiere multilayer polish (track names, sequence duration including VO, disable V1 linked audio under **full** V2 cover) MUST follow `cut-export-extras.md` § Multilayer XMEML.

## Requirements (EARS)

1. WHEN a Cut is loaded THEN at least one `audio_bus` and one `video_overlay` track MUST exist (create-on-read allowed).
2. WHEN `addAudioClip` / `addVideoClip` succeeds THEN GET cut detail MUST return the clip on that track.
3. WHEN the bus track is muted THEN playback and MP4 export MUST omit bus audio.
4. WHEN the V2 track is muted THEN playback and MP4 export MUST ignore V2 and show V1 only.
5. WHERE stem / TX companion lanes render THEN they MUST remain read-only Source Audio / transcript visuals (V1 and V2 groups).
6. WHEN unmuted V2 and V1 both cover `t` THEN program video MUST show V2.
7. WHEN the operator drops a V1 clip onto the V2 lane THEN the editor MUST call `moveClipLane` (move, not copy). V1 MUST keep at least one scene.
8. WHEN the operator drops a V2 clip onto the V1 lane THEN the editor MUST call `moveClipLane` onto `cut_scenes`.
9. WHEN the Cut timeline renders THEN lane order MUST be V1 → A1/A2/TX → V2 → V2-A1/V2-A2/V2-TX → VO.
10. WHEN unmuted V2 covers the playhead AND stems exist for that media THEN the monitor MUST play those stems gated by V2-A1/V2-A2 mute (not V1 A1/A2).
11. WHEN the operator free-moves a clip vertically THEN the drop lane MUST use the group split between V1 and V2 (midpoint between V1 track bottom and V2 track top): releasing in the V1 companion band stays V1; releasing at/below the split (V2 or V2 companions) MUST target V2 — and the reverse for V2→V1.
12. WHEN V1 has only one scene THEN V1→V2 MUST be rejected with operator-visible feedback (no silent no-op).
13. WHEN a lane move succeeds THEN selection MUST follow the relocated clip (new id) when media + in/out + timeline start still match.

## Acceptance

- [ ] Default Voice-Over and V2 tracks visible
- [ ] V2 companion A1/A2/TX lanes visible under V2
- [ ] Drop/add/move/trim/delete on bus and V2
- [ ] Drag clips between V1 and V2 (lane move)
- [ ] Program shows V2 over V1 when unmuted; mute V2 restores V1
- [ ] Lane-aware stems: V2 cover → V2 stems; else V1 stems
- [ ] MP4 export respects V2 overlay + bus audio
- [ ] Premiere ZIP imports with V2 video track + bus audio (see `cut-export-extras.md` multilayer polish)
