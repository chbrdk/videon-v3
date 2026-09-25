/**
 * Panel feature gates — knowledge/adobe-uxp-provider-first.md
 * Spec: adobe-uxp-library-panel.md § Provider-first
 */

/** Wave P4/P5 in-place Cut→Premiere sync. Unreliable; keep code gated off. */
export const ENABLE_INPLACE_PATCH = false

/**
 * Cuts tab (Open Cut / pushback / Cut neu laden).
 * Paused — focus on Szenen/Clips as clip provider. Modules remain for later.
 */
export const ENABLE_CUTS_TAB = false
