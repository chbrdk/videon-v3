/**
 * Destillat call-site inventory contract.
 * Spec: knowledge/distillate-call-sites.md · suite-enterprise-program.md § E1/E4
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.join(__dirname, '../../..')
const inventoryPath = path.join(root, 'knowledge/distillate-call-sites.md')

const REQUIRED_HOOKS = [
  {
    file: 'apps/web/lib/pipeline/run-analysis.ts',
    needles: ['scheduleCollectionActivityDistillate', 'scheduleSuiteAuditEvent'],
  },
  {
    file: 'apps/web/app/api/cuts/[cutId]/client-room-approve/route.ts',
    needles: ['scheduleSuiteAuditEvent'],
  },
] as const

describe('distillate call-site inventory (videon)', () => {
  it('ships inventory markdown', () => {
    expect(existsSync(inventoryPath)).toBe(true)
    const md = readFileSync(inventoryPath, 'utf8')
    expect(md).toContain('run-analysis.ts')
  })

  it('listed call sites still reference distillate clients', () => {
    for (const hook of REQUIRED_HOOKS) {
      const abs = path.join(root, hook.file)
      expect(existsSync(abs), `missing ${hook.file}`).toBe(true)
      const src = readFileSync(abs, 'utf8')
      for (const needle of hook.needles) {
        expect(src, `${hook.file} missing ${needle}`).toContain(needle)
      }
    }
  })
})
