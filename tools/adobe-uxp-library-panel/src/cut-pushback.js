/**
 * Premiere → Cut pushback orchestrator (manual parity).
 * Spec: adobe-uxp-cut-pushback-premiere.md
 */

import {
  getCutDetail,
  listWorkspaceMedia,
  restoreCutFromPushback,
} from './cuts-api.js'
import { captureActiveSequenceXml } from './premiere-capture.js'
import {
  buildMediaCatalogFromCutDetail,
  buildMediaCatalogFromMediaList,
  diffV1Timelines,
  formatPushbackDiffMessage,
  formatUnmappedHint,
  mapClipsToMedia,
  mappedClipsToRestoreScenes,
  mergePushbackMediaCatalog,
  normalizeCutDetailScenes,
  parsePremiereTimelineXml,
} from './xmeml-pushback.js'
import { isAfterEffectsHost } from './host.js'

/**
 * Capture + parse + map + diff (no write).
 */
export async function previewCutPushback(input) {
  const { settings, cut, platformProjectId, hostInfo, signal } = input

  if (isAfterEffectsHost(hostInfo) || hostInfo?.id === 'AEFT') {
    return {
      ok: false,
      mode: 'unsupported',
      message: 'Cut aktualisieren nur in Premiere Pro.',
    }
  }
  if (!platformProjectId || !cut?.id) {
    return { ok: false, mode: 'unsupported', message: 'Collection/Cut fehlt.' }
  }

  const captured = await captureActiveSequenceXml()
  if (!captured.ok || !captured.xml) {
    return {
      ok: false,
      mode: captured.mode || 'unsupported',
      message: captured.message || 'Sequenz-Capture fehlgeschlagen.',
    }
  }

  const detail = await getCutDetail(settings, cut.id, platformProjectId, signal)
  const mediaItems = await listWorkspaceMedia(settings, platformProjectId, signal).catch(() => [])
  const catalog = mergePushbackMediaCatalog(
    buildMediaCatalogFromCutDetail(detail),
    buildMediaCatalogFromMediaList(mediaItems),
  )

  const parsed = parsePremiereTimelineXml(captured.xml)
  if (!parsed.v1.length) {
    return {
      ok: false,
      mode: 'apply_rejected',
      message:
        'Keine V1-Clips in der Sequenz-XML gefunden' +
        (parsed.ignored?.length ? ` (${parsed.ignored.join(', ')})` : '') +
        '.',
      ignored: parsed.ignored,
      unmapped: [],
      captureMode: captured.mode,
    }
  }

  const { mapped, unmapped } = mapClipsToMedia(parsed.v1, catalog)
  if (!mapped.length) {
    return {
      ok: false,
      mode: 'apply_rejected',
      message:
        `Keine V1-Clips auf Collection-Medien mappbar${formatUnmappedHint(unmapped)}.` +
        ' Premiere schreibt oft file-1 statt file-{uuid} — Filename muss zur Mediathek passen.',
      ignored: parsed.ignored,
      unmapped,
      captureMode: captured.mode,
    }
  }
  if (unmapped.length) {
    return {
      ok: false,
      mode: 'apply_rejected',
      message: `${unmapped.length} Clip(s) ohne mediaAssetId — Apply blockiert${formatUnmappedHint(unmapped)}.`,
      ignored: parsed.ignored,
      unmapped,
      mapped,
      captureMode: captured.mode,
    }
  }

  const scenes = normalizeCutDetailScenes(detail)
  const diff = diffV1Timelines(scenes, mapped)
  const { scenes: restoreScenes, clampedCount } = mappedClipsToRestoreScenes(mapped)
  const message = formatPushbackDiffMessage(diff, parsed.ignored, 0, clampedCount)

  return {
    ok: true,
    mode: 'preview_diff',
    message,
    diff,
    ignored: parsed.ignored,
    mapped,
    restoreScenes,
    clampedCount,
    captureMode: captured.mode,
    sequenceName: captured.sequenceName || null,
    needsParityRefresh: (parsed.ignored || []).length > 0 || clampedCount > 0,
    cutId: cut.id,
    platformProjectId,
  }
}

export async function applyCutPushback(input) {
  const { settings, cutId, platformProjectId, restoreScenes, signal } = input
  if (!restoreScenes?.length) {
    return { ok: false, mode: 'apply_rejected', message: 'Keine Scenes zum Restore.' }
  }
  const result = await restoreCutFromPushback(
    settings,
    cutId,
    platformProjectId,
    restoreScenes,
    signal,
  )
  return {
    ok: true,
    mode: 'apply_replace',
    message: 'Cut aktualisiert.',
    result,
  }
}
