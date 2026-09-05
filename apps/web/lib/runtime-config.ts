import { paths } from './paths'

export type FederationMode = 'dummy' | 'live'

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function asBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function federationMode(): FederationMode {
  const mode = env(paths.envFederationMode).toLowerCase()
  return mode === 'live' ? 'live' : 'dummy'
}

export function plexonServiceSecret(): string {
  return env(paths.envPlexonServiceSecret)
}

export function plexonBaseUrl(): string {
  return env(paths.envPlexonBaseUrl).replace(/\/$/, '')
}

export function plexonAuthUrl(): string {
  return env(paths.envPlexonAuthUrl).replace(/\/$/, '')
}

export function databaseUrl(): string {
  return env(paths.envDatabaseUrl)
}

export type ObjectStorageConfig = {
  region: string
  bucket: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

/** S3-compatible storage has no implicit public-provider fallback. */
export function objectStorageConfig(): ObjectStorageConfig | null {
  const region = env(paths.envObjectStorageRegion)
  const bucket = env(paths.envObjectStorageBucket)
  const accessKeyId = env(paths.envObjectStorageAccessKeyId)
  const secretAccessKey = env(paths.envObjectStorageSecretAccessKey)
  if (!region && !bucket && !accessKeyId && !secretAccessKey) return null
  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('VIDEON object storage configuration is incomplete')
  }
  const endpoint = env(paths.envObjectStorageEndpoint)
  return {
    region,
    bucket,
    ...(endpoint ? { endpoint } : {}),
    accessKeyId,
    secretAccessKey,
    forcePathStyle: asBoolean(env(paths.envObjectStorageForcePathStyle)),
  }
}

export function openRouterApiKey(): string {
  return env(paths.envOpenRouterApiKey)
}

export function openRouterApiBaseUrl(): string {
  return env(paths.envOpenRouterApiBaseUrl).replace(/\/$/, '')
}

export function visionDefaultModel(): string {
  const model = env(paths.envVisionDefaultModel)
  if (!model) throw new Error(`${paths.envVisionDefaultModel} is required`)
  return model
}

export function visionSchemaFallbackModel(): string {
  const model = env(paths.envVisionSchemaFallbackModel)
  if (!model) throw new Error(`${paths.envVisionSchemaFallbackModel} is required`)
  return model
}

export function directVideoEnabled(): boolean {
  return asBoolean(env(paths.envVisionDirectVideoEnabled))
}

export function requiresZdr(): boolean {
  return asBoolean(env(paths.envOpenRouterRequireZdr))
}

export function openRouterDataCollection(): 'deny' {
  const configured = env(paths.envOpenRouterDataCollection).toLowerCase()
  if (configured && configured !== 'deny') {
    throw new Error(`${paths.envOpenRouterDataCollection} must be deny`)
  }
  return 'deny'
}

export function isLiveFederationConfigured(): boolean {
  return federationMode() === 'live' && Boolean(plexonServiceSecret() && plexonBaseUrl())
}

export function isPlexonAuthConfigured(): boolean {
  return Boolean(plexonAuthUrl() && plexonServiceSecret())
}

export function transcriptionConfig(): {
  enabled: boolean
  whisperModel: string
  language: string
} {
  const enabled = env(paths.envTranscriptionEnabled)
    ? asBoolean(env(paths.envTranscriptionEnabled))
    : true
  return {
    enabled,
    whisperModel: env(paths.envWhisperModel) || 'tiny',
    language: env(paths.envWhisperLanguage) || 'de',
  }
}
