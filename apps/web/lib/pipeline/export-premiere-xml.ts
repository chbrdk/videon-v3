/**
 * Premiere Pro XMEML + ZIP media package helpers.
 * Spec: specs/domain/cut-export-extras.md
 *
 * Audio sync: match auto-editor / Premiere conventions — exploded stereo tracks,
 * frame in/out only (no bogus pproTicks), empty file duration, links on video only.
 */

export type PremiereXmlScene = {
  id: string
  mediaAssetId: string
  startMs: number
  endMs: number
  /** Free-arrange placement; when omitted, falls back to contiguous packing by index. */
  timelineStartMs?: number
  originalFilename: string
  /** Basename under `media/` in the ZIP; defaults to sanitized originalFilename. */
  zipMediaName?: string
  /** Full source media duration in ms (file duration); falls back to endMs. */
  mediaDurationMs?: number | null
  /** Opaque Premiere clipitem residual (filters, labels, markers, …). */
  premiereFiltersXml?: string | null
}

/** Independent Cut audio-bus clips (Voice-Over) — specs/domain/cut-multi-track.md */
export type PremiereXmlBusClip = {
  id: string
  mediaAssetId: string
  timelineStartMs: number
  startMs: number
  endMs: number
  originalFilename: string
  zipMediaName?: string
}

/** V2 full-frame overlay clips on a second video track. */
export type PremiereXmlOverlayClip = {
  id: string
  mediaAssetId: string
  timelineStartMs: number
  startMs: number
  endMs: number
  originalFilename: string
  zipMediaName?: string
}

export type PremiereXmlCut = {
  id: string
  name: string
  width: number | null
  height: number | null
  frameRate: number | null
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function framesFromMs(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps))
}

function timelineStartMs(scenes: PremiereXmlScene[], index: number): number {
  const scene = scenes[index]
  if (scene && typeof scene.timelineStartMs === 'number' && Number.isFinite(scene.timelineStartMs)) {
    return Math.max(0, Math.floor(scene.timelineStartMs))
  }
  let cumulative = 0
  for (let i = 0; i < index; i += 1) {
    cumulative += Math.max(0, scenes[i]!.endMs - scenes[i]!.startMs)
  }
  return cumulative
}

function rateXml(fps: number): string {
  const timebase = Math.round(fps > 0 ? fps : 25)
  return `<rate>
			<timebase>${timebase}</timebase>
			<ntsc>FALSE</ntsc>
		</rate>`
}

/** Safe single-path basename for ZIP `media/` entries. */
export function sanitizePremiereMediaBasename(filename: string, fallbackId: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop()?.trim() || ''
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, '_').replace(/^\.+/, '')
  if (cleaned && cleaned !== '.' && cleaned !== '..') return cleaned
  return `${fallbackId.replace(/[^\w.-]+/g, '_') || 'media'}.mp4`
}

/** Unique basename per media asset (disambiguate colliding originals). */
export function assignPremiereZipMediaNames(
  items: Array<{ mediaAssetId: string; originalFilename: string }>,
): Map<string, string> {
  const used = new Set<string>()
  const map = new Map<string, string>()
  for (const item of items) {
    if (map.has(item.mediaAssetId)) continue
    let name = sanitizePremiereMediaBasename(item.originalFilename, item.mediaAssetId)
    if (used.has(name.toLowerCase())) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : '.mp4'
      let n = 2
      while (used.has(`${stem}-${n}${ext}`.toLowerCase())) n += 1
      name = `${stem}-${n}${ext}`
    }
    used.add(name.toLowerCase())
    map.set(item.mediaAssetId, name)
  }
  return map
}

export function sanitizePremiereXmlFilename(cutName: string): string {
  const cleaned = cutName
    .trim()
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120)
  return `${cleaned || 'cut'}.xml`
}

export function premierePackageReadme(cutName: string, xmlFilename: string): string {
  return `VIDEON Premiere Pro export

Cut: ${cutName}

Contents:
- ${xmlFilename} — Adobe Premiere Pro XMEML sequence
- media/ — source media referenced by the sequence

How to use:
1. Extract this ZIP into one folder (keep media/ next to the XML).
2. In Premiere Pro: File → Import → select ${xmlFilename}.
3. Clips should link to media/ automatically via file://media/… paths.
`
}

/**
 * Premiere ticks: 254_016_000_000 per second (Adobe). Prefer omitting pproTicks
 * and relying on frame in/out — wrong ticks make Premiere ignore audio offsets.
 */
export const PREMIERE_TICKS_PER_SECOND = 254_016_000_000

export function premiereTicksFromMs(ms: number): number {
  return Math.max(0, Math.round((ms / 1000) * PREMIERE_TICKS_PER_SECOND))
}

/** True when [spanStart, spanEnd) is covered by the union of overlay intervals (no mid-clip split). */
export function timelineSpanFullyCoveredByOverlays(
  spanStartMs: number,
  spanEndMs: number,
  overlays: Array<{ timelineStartMs: number; startMs: number; endMs: number }>,
): boolean {
  const spanStart = Math.max(0, Math.floor(spanStartMs))
  const spanEnd = Math.max(spanStart, Math.floor(spanEndMs))
  if (spanEnd <= spanStart) return false
  const intervals = overlays
    .map((clip) => {
      const start = Math.max(0, Math.floor(clip.timelineStartMs))
      const end = start + Math.max(0, Math.floor(clip.endMs - clip.startMs))
      return { start, end }
    })
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start)
  if (intervals.length === 0) return false

  let coveredThrough = spanStart
  for (const interval of intervals) {
    if (interval.start > coveredThrough) return false
    coveredThrough = Math.max(coveredThrough, interval.end)
    if (coveredThrough >= spanEnd) return true
  }
  return coveredThrough >= spanEnd
}

export function premiereSequenceTotalMs(input: {
  scenes: PremiereXmlScene[]
  overlayClips?: PremiereXmlOverlayClip[]
  busClips?: PremiereXmlBusClip[]
}): number {
  const sceneEnds = input.scenes.map(
    (scene, index) => timelineStartMs(input.scenes, index) + Math.max(0, scene.endMs - scene.startMs),
  )
  const overlayEnds = (input.overlayClips ?? []).map(
    (clip) => clip.timelineStartMs + Math.max(0, clip.endMs - clip.startMs),
  )
  const busEnds = (input.busClips ?? []).map(
    (clip) => clip.timelineStartMs + Math.max(0, clip.endMs - clip.startMs),
  )
  return Math.max(0, ...sceneEnds, ...overlayEnds, ...busEnds, 0)
}

/** Build XMEML for Premiere; pathurl values point at ZIP-relative media/. */
export function buildPremiereXmeml(input: {
  cut: PremiereXmlCut
  scenes: PremiereXmlScene[]
  busClips?: PremiereXmlBusClip[]
  overlayClips?: PremiereXmlOverlayClip[]
  premiereV1TrackSidecarXml?: string | null
  premiereSequenceExtrasXml?: string | null
}): string {
  const fps = input.cut.frameRate && input.cut.frameRate > 0 ? input.cut.frameRate : 25
  const width = input.cut.width && input.cut.width > 0 ? input.cut.width : 1920
  const height = input.cut.height && input.cut.height > 0 ? input.cut.height : 1080
  const scenes = input.scenes
  const busClips = input.busClips ?? []
  const overlayClips = input.overlayClips ?? []
  const n = scenes.length
  const o = overlayClips.length
  const totalMs = premiereSequenceTotalMs({ scenes, overlayClips, busClips })
  const totalFrames = framesFromMs(totalMs, fps)
  const sequenceName = escapeXml(input.cut.name || 'Cut')
  const timebase = Math.round(fps)
  const rate = rateXml(fps)
  const definedFiles = new Set<string>()

  // Audio clip ids continue after all video ids (auto-editor / Premiere convention).
  const videoCount = n + o
  const audioLFirstId = videoCount + 1
  const audioRFirstId = videoCount * 2 + 1
  const busLFirstId = videoCount * 3 + 1
  const busRFirstId = videoCount * 3 + 1 + Math.max(busClips.length, 1)

  const v1AudioEnabled = scenes.map((scene, index) => {
    const tlStart = timelineStartMs(scenes, index)
    const tlEnd = tlStart + Math.max(0, scene.endMs - scene.startMs)
    return !timelineSpanFullyCoveredByOverlays(tlStart, tlEnd, overlayClips)
  })

  const videoLinkBlock = (index: number) => {
    const clipindex = index + 1
    return `
						<link>
							<linkclipref>clipitem-${index + 1}</linkclipref>
							<mediatype>video</mediatype>
							<trackindex>1</trackindex>
							<clipindex>${clipindex}</clipindex>
						</link>
						<link>
							<linkclipref>clipitem-${audioLFirstId + index}</linkclipref>
							<mediatype>audio</mediatype>
							<trackindex>1</trackindex>
							<clipindex>${clipindex}</clipindex>
						</link>
						<link>
							<linkclipref>clipitem-${audioRFirstId + index}</linkclipref>
							<mediatype>audio</mediatype>
							<trackindex>2</trackindex>
							<clipindex>${clipindex}</clipindex>
						</link>`
  }

  const fileBlock = (scene: PremiereXmlScene, index: number) => {
    const fileId = `file-${scene.mediaAssetId}`
    if (definedFiles.has(fileId)) {
      return `<file id="${fileId}"/>`
    }
    definedFiles.add(fileId)
    const displayName = escapeXml(scene.originalFilename || `clip-${index + 1}`)
    const zipName =
      scene.zipMediaName ||
      sanitizePremiereMediaBasename(scene.originalFilename || '', scene.mediaAssetId)
    const pathUrl = `file://media/${escapeXml(zipName)}`
    // Empty <duration>: Premiere reads length from the media file (auto-editor pattern).
    return `<file id="${fileId}">
							<name>${displayName}</name>
							<pathurl>${pathUrl}</pathurl>
							${rate}
							<duration></duration>
							<timecode>
								${rate}
								<string>00:00:00:00</string>
								<frame>0</frame>
								<displayformat>NDF</displayformat>
							</timecode>
							<media>
								<video>
									<samplecharacteristics>
										${rate}
										<width>${width}</width>
										<height>${height}</height>
										<pixelaspectratio>square</pixelaspectratio>
										<fielddominance>none</fielddominance>
									</samplecharacteristics>
								</video>
								<audio>
									<channelcount>2</channelcount>
									<samplecharacteristics>
										<depth>16</depth>
										<samplerate>48000</samplerate>
									</samplecharacteristics>
								</audio>
							</media>
						</file>`
  }

  const videoClips = scenes
    .map((scene, index) => {
      const clipDurMs = Math.max(0, scene.endMs - scene.startMs)
      const tlStart = timelineStartMs(scenes, index)
      const displayName = escapeXml(scene.originalFilename || `clip-${index + 1}`)
      const inFrames = framesFromMs(scene.startMs, fps)
      const outFrames = framesFromMs(scene.endMs, fps)
      return `
					<clipitem id="clipitem-${index + 1}" premiereChannelType="video">
						<name>${displayName}</name>
						<enabled>TRUE</enabled>
						<start>${framesFromMs(tlStart, fps)}</start>
						<end>${framesFromMs(tlStart + clipDurMs, fps)}</end>
						<in>${inFrames}</in>
						<out>${outFrames}</out>
						${fileBlock(scene, index)}
						<sourcetrack>
							<mediatype>video</mediatype>
							<trackindex>1</trackindex>
						</sourcetrack>
						${scene.premiereFiltersXml?.trim() ? `\n\t\t\t\t\t\t${scene.premiereFiltersXml.trim()}` : ''}
						${videoLinkBlock(index)}
					</clipitem>`
    })
    .join('')

  const overlayVideoClips = overlayClips
    .map((clip, index) => {
      const clipDurMs = Math.max(0, clip.endMs - clip.startMs)
      const displayName = escapeXml(clip.originalFilename || `overlay-${index + 1}`)
      const clipIndex = n + index + 1
      const fileId = `file-${clip.mediaAssetId}`
      const zipName =
        clip.zipMediaName || sanitizePremiereMediaBasename(clip.originalFilename || '', clip.mediaAssetId)
      const fileXml = definedFiles.has(fileId)
        ? `<file id="${fileId}"/>`
        : (() => {
            definedFiles.add(fileId)
            return `<file id="${fileId}">
							<name>${displayName}</name>
							<pathurl>file://media/${escapeXml(zipName)}</pathurl>
							${rate}
							<duration></duration>
							<timecode>
								${rate}
								<string>00:00:00:00</string>
								<frame>0</frame>
								<displayformat>NDF</displayformat>
							</timecode>
							<media>
								<video>
									<samplecharacteristics>
										${rate}
										<width>${width}</width>
										<height>${height}</height>
										<pixelaspectratio>square</pixelaspectratio>
										<fielddominance>none</fielddominance>
									</samplecharacteristics>
								</video>
							</media>
						</file>`
          })()
      return `
					<clipitem id="clipitem-${clipIndex}" premiereChannelType="video">
						<name>${displayName}</name>
						<enabled>TRUE</enabled>
						<start>${framesFromMs(clip.timelineStartMs, fps)}</start>
						<end>${framesFromMs(clip.timelineStartMs + clipDurMs, fps)}</end>
						<in>${framesFromMs(clip.startMs, fps)}</in>
						<out>${framesFromMs(clip.endMs, fps)}</out>
						${fileXml}
						<sourcetrack>
							<mediatype>video</mediatype>
							<trackindex>1</trackindex>
						</sourcetrack>
					</clipitem>`
    })
    .join('')

  const audioTrackClips = (explodedIndex: 0 | 1) =>
    scenes
      .map((scene, index) => {
        const clipDurMs = Math.max(0, scene.endMs - scene.startMs)
        const tlStart = timelineStartMs(scenes, index)
        const displayName = escapeXml(scene.originalFilename || `clip-${index + 1}`)
        const fileId = `file-${scene.mediaAssetId}`
        const firstId = explodedIndex === 0 ? audioLFirstId : audioRFirstId
        const clipId = `clipitem-${firstId + index}`
        const sourceTrackIndex = explodedIndex + 1
        const inFrames = framesFromMs(scene.startMs, fps)
        const outFrames = framesFromMs(scene.endMs, fps)
        const enabled = v1AudioEnabled[index] ? 'TRUE' : 'FALSE'
        return `
					<clipitem id="${clipId}" premiereChannelType="stereo">
						<name>${displayName}</name>
						<enabled>${enabled}</enabled>
						<start>${framesFromMs(tlStart, fps)}</start>
						<end>${framesFromMs(tlStart + clipDurMs, fps)}</end>
						<in>${inFrames}</in>
						<out>${outFrames}</out>
						<file id="${fileId}"/>
						<sourcetrack>
							<mediatype>audio</mediatype>
							<trackindex>${sourceTrackIndex}</trackindex>
						</sourcetrack>
					</clipitem>`
      })
      .join('')

  const busFileBlock = (clip: PremiereXmlBusClip) => {
    const fileId = `file-${clip.mediaAssetId}`
    if (definedFiles.has(fileId)) {
      return `<file id="${fileId}"/>`
    }
    definedFiles.add(fileId)
    const displayName = escapeXml(clip.originalFilename || `bus-${clip.id}`)
    const zipName =
      clip.zipMediaName || sanitizePremiereMediaBasename(clip.originalFilename || '', clip.mediaAssetId)
    const pathUrl = `file://media/${escapeXml(zipName)}`
    return `<file id="${fileId}">
							<name>${displayName}</name>
							<pathurl>${pathUrl}</pathurl>
							${rate}
							<duration></duration>
							<timecode>
								${rate}
								<string>00:00:00:00</string>
								<frame>0</frame>
								<displayformat>NDF</displayformat>
							</timecode>
							<media>
								<audio>
									<channelcount>2</channelcount>
									<samplecharacteristics>
										<depth>16</depth>
										<samplerate>48000</samplerate>
									</samplecharacteristics>
								</audio>
							</media>
						</file>`
  }

  const busTrackClips = (explodedIndex: 0 | 1) =>
    busClips
      .map((clip, index) => {
        const clipDurMs = Math.max(0, clip.endMs - clip.startMs)
        const displayName = escapeXml(clip.originalFilename || `bus-${index + 1}`)
        const firstId = explodedIndex === 0 ? busLFirstId : busRFirstId
        const clipId = `clipitem-${firstId + index}`
        const sourceTrackIndex = explodedIndex + 1
        return `
					<clipitem id="${clipId}" premiereChannelType="stereo">
						<name>${displayName}</name>
						<enabled>TRUE</enabled>
						<start>${framesFromMs(clip.timelineStartMs, fps)}</start>
						<end>${framesFromMs(clip.timelineStartMs + clipDurMs, fps)}</end>
						<in>${framesFromMs(clip.startMs, fps)}</in>
						<out>${framesFromMs(clip.endMs, fps)}</out>
						${busFileBlock(clip)}
						<sourcetrack>
							<mediatype>audio</mediatype>
							<trackindex>${sourceTrackIndex}</trackindex>
						</sourcetrack>
					</clipitem>`
      })
      .join('')

  const busTracksXml =
    busClips.length > 0
      ? `
				<track currentExplodedTrackIndex="0" totalExplodedTrackCount="2" premiereTrackType="Stereo">
					<name>VO</name>
					${busTrackClips(0)}
					<outputchannelindex>1</outputchannelindex>
				</track>
				<track currentExplodedTrackIndex="1" totalExplodedTrackCount="2" premiereTrackType="Stereo">
					<name>VO</name>
					${busTrackClips(1)}
					<outputchannelindex>2</outputchannelindex>
				</track>`
      : ''

  const trackSidecar = input.premiereV1TrackSidecarXml?.trim() || ''
  const sequenceExtras = input.premiereSequenceExtrasXml?.trim() || ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
	<sequence explodedTracks="true">
		<name>${sequenceName}</name>
		<duration>${totalFrames}</duration>
		<rate>
			<timebase>${timebase}</timebase>
			<ntsc>FALSE</ntsc>
		</rate>
		${sequenceExtras ? `${sequenceExtras}\n\t\t` : ''}<media>
			<video>
				<format>
					<samplecharacteristics>
						<rate>
							<timebase>${timebase}</timebase>
							<ntsc>FALSE</ntsc>
						</rate>
						<width>${width}</width>
						<height>${height}</height>
						<pixelaspectratio>square</pixelaspectratio>
						<fielddominance>none</fielddominance>
					</samplecharacteristics>
				</format>
				<track>
					<name>V1</name>
					${videoClips}
					${trackSidecar}
				</track>
				${
          overlayClips.length > 0
            ? `<track>
					<name>V2</name>
					${overlayVideoClips}
				</track>`
            : ''
        }
			</video>
			<audio>
				<numOutputChannels>2</numOutputChannels>
				<format>
					<samplecharacteristics>
						<depth>16</depth>
						<samplerate>48000</samplerate>
					</samplecharacteristics>
				</format>
				<track currentExplodedTrackIndex="0" totalExplodedTrackCount="2" premiereTrackType="Stereo">
					<name>V1</name>
					${audioTrackClips(0)}
					<outputchannelindex>1</outputchannelindex>
				</track>
				<track currentExplodedTrackIndex="1" totalExplodedTrackCount="2" premiereTrackType="Stereo">
					<name>V1</name>
					${audioTrackClips(1)}
					<outputchannelindex>2</outputchannelindex>
				</track>
				${busTracksXml}
			</audio>
		</media>
	</sequence>
</xmeml>
`
}


