/**
 * Premiere Pro XMEML v4 (XML-only, no media ZIP).
 * Spec: specs/domain/cut-export-extras.md
 */

export type PremiereXmlScene = {
  id: string
  mediaAssetId: string
  startMs: number
  endMs: number
  originalFilename: string
  /** Full source media duration in ms (file duration); falls back to endMs. */
  mediaDurationMs?: number | null
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
  let cumulative = 0
  for (let i = 0; i < index; i += 1) {
    cumulative += Math.max(0, scenes[i].endMs - scenes[i].startMs)
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

/** Build XMEML v4 sequence from Cut scenes; media paths are placeholders for relink. */
export function buildPremiereXmeml(input: {
  cut: PremiereXmlCut
  scenes: PremiereXmlScene[]
}): string {
  const fps = input.cut.frameRate && input.cut.frameRate > 0 ? input.cut.frameRate : 25
  const width = input.cut.width && input.cut.width > 0 ? input.cut.width : 1920
  const height = input.cut.height && input.cut.height > 0 ? input.cut.height : 1080
  const scenes = input.scenes
  const totalMs = scenes.reduce((sum, scene) => sum + Math.max(0, scene.endMs - scene.startMs), 0)
  const totalFrames = framesFromMs(totalMs, fps)
  const sequenceName = escapeXml(input.cut.name || 'Cut')
  const rate = rateXml(fps)

  const videoClips = scenes
    .map((scene, index) => {
      const clipDurMs = Math.max(0, scene.endMs - scene.startMs)
      const tlStart = timelineStartMs(scenes, index)
      const fileDurMs =
        scene.mediaDurationMs != null && scene.mediaDurationMs > 0
          ? scene.mediaDurationMs
          : Math.max(scene.endMs, clipDurMs)
      const name = escapeXml(scene.originalFilename || `clip-${index + 1}`)
      const fileId = `file-${scene.mediaAssetId}`
      const pathUrl = `file://media/${escapeXml(scene.originalFilename || `${scene.mediaAssetId}.mp4`)}`
      return `
					<clipitem id="clipitem-${index + 1}" premiereChannelType="video">
						<masterclipid>masterclip-${scene.mediaAssetId}</masterclipid>
						<name>${name}</name>
						<enabled>TRUE</enabled>
						<duration>${framesFromMs(clipDurMs, fps)}</duration>
						${rate}
						<start>${framesFromMs(tlStart, fps)}</start>
						<end>${framesFromMs(tlStart + clipDurMs, fps)}</end>
						<in>${framesFromMs(scene.startMs, fps)}</in>
						<out>${framesFromMs(scene.endMs, fps)}</out>
						<pproTicksIn>${framesFromMs(scene.startMs, fps) * 1000000}</pproTicksIn>
						<pproTicksOut>${framesFromMs(scene.endMs, fps) * 1000000}</pproTicksOut>
						<file id="${fileId}">
							<name>${name}</name>
							<pathurl>${pathUrl}</pathurl>
							${rate}
							<duration>${framesFromMs(fileDurMs, fps)}</duration>
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
									<samplecharacteristics>
										<depth>16</depth>
										<samplerate>48000</samplerate>
									</samplecharacteristics>
									<channelcount>2</channelcount>
								</audio>
							</media>
						</file>
						<sourcetrack>
							<mediatype>video</mediatype>
							<trackindex>1</trackindex>
						</sourcetrack>
					</clipitem>`
    })
    .join('')

  const audioClips = scenes
    .map((scene, index) => {
      const clipDurMs = Math.max(0, scene.endMs - scene.startMs)
      const tlStart = timelineStartMs(scenes, index)
      const name = escapeXml(scene.originalFilename || `clip-${index + 1}`)
      const fileId = `file-${scene.mediaAssetId}`
      return `
					<clipitem id="clipitem-a-${index + 1}" premiereChannelType="stereo">
						<masterclipid>masterclip-${scene.mediaAssetId}</masterclipid>
						<name>${name}</name>
						<enabled>TRUE</enabled>
						<duration>${framesFromMs(clipDurMs, fps)}</duration>
						${rate}
						<start>${framesFromMs(tlStart, fps)}</start>
						<end>${framesFromMs(tlStart + clipDurMs, fps)}</end>
						<in>${framesFromMs(scene.startMs, fps)}</in>
						<out>${framesFromMs(scene.endMs, fps)}</out>
						<pproTicksIn>${framesFromMs(scene.startMs, fps) * 1000000}</pproTicksIn>
						<pproTicksOut>${framesFromMs(scene.endMs, fps) * 1000000}</pproTicksOut>
						<file id="${fileId}"/>
						<sourcetrack>
							<mediatype>audio</mediatype>
							<trackindex>1</trackindex>
						</sourcetrack>
						<link>
							<linkclipref>clipitem-${index + 1}</linkclipref>
							<mediatype>video</mediatype>
							<trackindex>1</trackindex>
							<clipindex>${index + 1}</clipindex>
						</link>
						<gain>
							<parameter>
								<parameterid>gain</parameterid>
								<name>Level</name>
								<value>1</value>
							</parameter>
						</gain>
					</clipitem>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
	<sequence id="sequence-${escapeXml(input.cut.id)}" MZ.Sequence.PreviewFrameSizeHeight="${height}" MZ.Sequence.PreviewFrameSizeWidth="${width}" explodedTracks="true">
		<uuid>${escapeXml(input.cut.id)}</uuid>
		<duration>${totalFrames}</duration>
		${rate}
		<name>${sequenceName}</name>
		<media>
			<video>
				<format>
					<samplecharacteristics>
						${rate}
						<width>${width}</width>
						<height>${height}</height>
						<pixelaspectratio>square</pixelaspectratio>
						<fielddominance>none</fielddominance>
					</samplecharacteristics>
				</format>
				<track>
					${videoClips}
					<enabled>TRUE</enabled>
					<locked>FALSE</locked>
				</track>
			</video>
			<audio>
				<track>
					${audioClips}
					<enabled>TRUE</enabled>
					<locked>FALSE</locked>
					<outputchannelindex>1</outputchannelindex>
				</track>
			</audio>
		</media>
	</sequence>
</xmeml>
`
}
