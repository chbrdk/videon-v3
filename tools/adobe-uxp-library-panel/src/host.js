/**
 * Host detection for dual-host UXP panel (Premiere / After Effects).
 * Spec: adobe-uxp-library-panel.md
 */

/**
 * @returns {Promise<{ id: 'PPRO' | 'AEFT', source: 'uxp' | 'preview' | 'default' }>}
 */
export async function detectHostApp() {
  try {
    const uxp = await import('uxp')
    const name = String(uxp?.host?.name || uxp?.host?.app || '').toLowerCase()
    if (name.includes('after') || name === 'aeft' || name === 'ae') {
      return { id: 'AEFT', source: uxp?.host?.__videonPreview ? 'preview' : 'uxp' }
    }
    if (name.includes('premiere') || name === 'ppro' || name === 'premierepro') {
      return { id: 'PPRO', source: 'uxp' }
    }
    // Browser shim reports AEFT via ?host=AEFT
    if (name === 'aeft') return { id: 'AEFT', source: 'preview' }
  } catch {
    /* browser without shim */
  }

  try {
    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search).get('host')
      if (q && /aeft|aftereffects|^ae$/i.test(q)) {
        return { id: 'AEFT', source: 'preview' }
      }
    }
  } catch {
    /* ignore */
  }

  return { id: 'PPRO', source: 'default' }
}

export function isAfterEffectsHost(host) {
  return host === 'AEFT' || host?.id === 'AEFT'
}
