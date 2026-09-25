#!/usr/bin/env node
/**
 * Bundle panel for Adobe UXP (CommonJS runtime — no ES modules).
 * Source stays ESM for Vitest + browser preview.
 *
 * CSS: UXP does **not** support `@import` in stylesheets. Concatenate
 * tokens + components + layout into styles.bundle.css (single <link>).
 */
const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const root = __dirname
const src = path.join(root, 'src')

function buildCssBundle() {
  const parts = [
    '/* AUTO-GENERATED — do not edit. Sources: msqdx-tokens.css + msqdx-components.css + styles.css */',
    '/* UXP: no CSS @import — see knowledge/adobe-uxp-panel-msqdx-ui.md */',
    fs.readFileSync(path.join(src, 'msqdx-tokens.css'), 'utf8'),
    fs.readFileSync(path.join(src, 'msqdx-components.css'), 'utf8'),
    fs.readFileSync(path.join(src, 'styles.css'), 'utf8').replace(/@import\s+['"][^'"]+['"]\s*;\s*/g, ''),
  ]
  const out = path.join(src, 'styles.bundle.css')
  fs.writeFileSync(out, `${parts.join('\n\n')}\n`)
  console.log('built src/styles.bundle.css (UXP CSS bundle)')
}

buildCssBundle()

esbuild
  .build({
    entryPoints: [path.join(root, 'src/index.js')],
    bundle: true,
    outfile: path.join(root, 'src/panel.bundle.js'),
    format: 'iife',
    // UXP is browser-like. `platform: 'node'` pulled fflate's Node entry
    // (`createRequire` / `worker_threads`) and crashed the panel at load.
    platform: 'browser',
    target: ['es2020'],
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser', 'import', 'default'],
    alias: {
      fflate: path.join(root, 'node_modules/fflate/esm/browser.js'),
    },
    external: ['uxp', 'premierepro', 'aeft', 'aftereffects'],
    logLevel: 'info',
  })
  .then(() => {
    console.log('built src/panel.bundle.js (UXP IIFE)')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
