/**
 * Load Adobe host modules. UXP is CommonJS-only (no ES `import()`).
 * Browser preview falls back to dynamic import + import maps.
 */

/**
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function loadNativeModule(id) {
  if (typeof require === 'function') {
    try {
      // String must stay a literal call-site for UXP / esbuild externals.
      if (id === 'uxp') return require('uxp')
      if (id === 'premierepro') return require('premierepro')
      if (id === 'aeft') return require('aeft')
      if (id === 'aftereffects') return require('aftereffects')
      return require(id)
    } catch {
      /* not available via require — try ESM (browser preview) */
    }
  }
  if (id === 'uxp') return import('uxp')
  if (id === 'premierepro') return import('premierepro')
  if (id === 'aeft') return import('aeft')
  if (id === 'aftereffects') return import('aftereffects')
  return import(id)
}
