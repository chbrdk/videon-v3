import type { NextConfig } from 'next'
import path from 'node:path'

const workspaceRoot = path.resolve(__dirname, '../..')
const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules')
const webNodeModules = path.resolve(__dirname, 'node_modules')

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'pg-boss'],
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@videon-v3/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
      // `$` = exact only — otherwise `@msqdx/ui` steals `@msqdx/ui/styles.css`.
      '@msqdx/ui$': path.resolve(__dirname, './lib/msqdx-ui.ts'),
      '@msqdx/ui-shell$': path.resolve(__dirname, './lib/msqdx-ui-shell.ts'),
      '@msqdx/ui/styles.css': path.resolve(__dirname, '../../../msqdx-ui/packages/ui/src/styles.css'),
      '@msqdx/ui-tokens$': path.resolve(
        __dirname,
        '../../../msqdx-ui/packages/ui-tokens/dist/index.js',
      ),
    }
    config.resolve.modules = [
      workspaceNodeModules,
      webNodeModules,
      ...((config.resolve.modules as string[] | undefined) ?? ['node_modules']),
    ]
    return config
  },
}

export default nextConfig
