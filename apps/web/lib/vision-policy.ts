import {
  directVideoEnabled,
  openRouterDataCollection,
  requiresZdr,
  visionDefaultModel,
  visionSchemaFallbackModel,
} from './runtime-config'

export type VisionLane = {
  model: string
  inputMode: 'frames' | 'video'
  responseMode: 'json_object' | 'json_schema'
  localSchemaValidation: boolean
  providerRequireParameters: boolean
}

export function defaultVisionLane(): VisionLane {
  return {
    model: visionDefaultModel(),
    inputMode: 'frames',
    responseMode: 'json_object',
    localSchemaValidation: true,
    providerRequireParameters: false,
  }
}

export function schemaFallbackVisionLane(): VisionLane {
  return {
    model: visionSchemaFallbackModel(),
    inputMode: 'frames',
    responseMode: 'json_schema',
    localSchemaValidation: true,
    providerRequireParameters: true,
  }
}

export function directVideoVisionLane(): VisionLane | null {
  if (!directVideoEnabled()) return null
  return {
    ...defaultVisionLane(),
    inputMode: 'video',
  }
}

export function openRouterProviderPolicy() {
  return {
    dataCollection: openRouterDataCollection(),
    zdr: requiresZdr(),
  } as const
}
