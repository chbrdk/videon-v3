#!/usr/bin/env node
/**
 * Bundle panel for Adobe UXP (CommonJS runtime — no ES modules).
 * Source stays ESM for Vitest + browser preview.
 */
const esbuild = require('esbuild')
const path = require('path')

const root = __dirname

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
