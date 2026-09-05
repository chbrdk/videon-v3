export const paths = {
  appName: 'VIDEON v3',
  brandLabel: 'VIDEON',
  productId: 'videon' as const,
  federationContract: '2026-05-plexon-federation-v3',
  devPort: 3010,
  defaultTheme: 'msqdx-dark',
  defaultLocale: 'de',
  railInsetRem: 1,
  railGapRem: 4,
  railWidthRem: 4.25,
  mainGutterRem: 2.5,
  railDockEdge: 'left' as const,
  railDockStorageKey: 'videon.v3.railDock',
  brandCornerRadiusPx: 24,
  ecosystemStagingPlexon: 'https://plexon-v3.projects-a.plygrnd.tech',
  ecosystemStagingAudion: 'https://audion-v3.projects-a.plygrnd.tech',
  ecosystemStagingCheckion: 'https://checkion-v3.projects-a.plygrnd.tech',
  ecosystemStagingBrandion: 'https://brandion-v3.projects-a.plygrnd.tech',
  ecosystemStagingCreation: 'https://creation-v3.projects-a.plygrnd.tech',
  ecosystemStagingEchon: 'https://echon-v3.projects-a.plygrnd.tech',
  ecosystemStagingVideon: 'https://videon.projects-a.plygrnd.tech',
  ecosystemStagingSpirion: 'https://spirion.projects-a.plygrnd.tech',
  plexonProductsPath: '/products',
  envAudionPublicUrl: 'NEXT_PUBLIC_AUDION_URL',
  envBrandionPublicUrl: 'NEXT_PUBLIC_BRANDION_URL',
  envCreationPublicUrl: 'NEXT_PUBLIC_CREATION_URL',
  envEchonPublicUrl: 'NEXT_PUBLIC_ECHON_URL',
  envCheckionPublicUrl: 'NEXT_PUBLIC_CHECKION_URL',
  envVideonPublicUrl: 'NEXT_PUBLIC_VIDEON_URL',
  envSpirionPublicUrl: 'NEXT_PUBLIC_SPIRION_URL',
  plexonAccessibleCollectionsPath: '/api/platform/provisioning/accessible-collections',
  plexonProjectSyncPath: (platformProjectId: string) =>
    `/api/platform/provisioning/projects/${encodeURIComponent(platformProjectId)}/sync`,
  /** Browser upload cap for signed PUT (bytes). */
  maxUploadBytes: 2 * 1024 * 1024 * 1024,
  envFederationMode: 'PLEXON_FEDERATION_MODE',
  envPlexonServiceSecret: 'PLEXON_SERVICE_SECRET',
  envPlexonBaseUrl: 'NEXT_PLEXON_BASE_URL',
  envPlexonAuthUrl: 'PLEXON_AUTH_URL',
  envAuthSecret: 'AUTH_SECRET',
  envDatabaseUrl: 'DATABASE_URL',
  envObjectStorageRegion: 'VIDEON_OBJECT_STORAGE_REGION',
  envObjectStorageBucket: 'VIDEON_OBJECT_STORAGE_BUCKET',
  envObjectStorageEndpoint: 'VIDEON_OBJECT_STORAGE_ENDPOINT',
  envObjectStorageAccessKeyId: 'VIDEON_OBJECT_STORAGE_ACCESS_KEY_ID',
  envObjectStorageSecretAccessKey: 'VIDEON_OBJECT_STORAGE_SECRET_ACCESS_KEY',
  envObjectStorageForcePathStyle: 'VIDEON_OBJECT_STORAGE_FORCE_PATH_STYLE',
  envOpenRouterApiKey: 'OPENROUTER_API_KEY',
  envOpenRouterApiBaseUrl: 'OPENROUTER_API_BASE_URL',
  envVisionDefaultModel: 'VIDEON_VISION_DEFAULT_MODEL',
  envVisionSchemaFallbackModel: 'VIDEON_VISION_SCHEMA_FALLBACK_MODEL',
  envVisionDirectVideoEnabled: 'VIDEON_VISION_DIRECT_VIDEO_ENABLED',
  envOpenRouterDataCollection: 'VIDEON_OPENROUTER_DATA_COLLECTION',
  envOpenRouterRequireZdr: 'VIDEON_OPENROUTER_REQUIRE_ZDR',
  routes: {
    home: '/',
    library: '/library',
    upload: '/upload',
    analyses: '/analyses',
    cuts: '/cuts',
    settings: '/settings',
    login: '/login',
    collections: '/collections',
    apiCollections: '/api/collections',
    apiMedia: '/api/media',
    apiAnalyses: '/api/analyses',
    apiMediaUploadIntent: '/api/media/upload-intent',
    apiMediaUpload: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/upload?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaComplete: (mediaAssetId: string) => `/api/media/${encodeURIComponent(mediaAssetId)}/complete`,
    apiMediaDetail: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaPlayback: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/playback?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaAnalysis: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/analysis?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaSearch: (platformProjectId: string, query: string) =>
      `/api/media/search?platformProjectId=${encodeURIComponent(platformProjectId)}&q=${encodeURIComponent(query)}`,
    apiCuts: (platformProjectId: string) =>
      `/api/cuts?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiCutDetail: (cutId: string, platformProjectId: string) =>
      `/api/cuts/${encodeURIComponent(cutId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    cutFor: (cutId: string, platformProjectId: string) =>
      `/cuts/${encodeURIComponent(cutId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    mediaFor: (mediaAssetId: string, platformProjectId: string) =>
      `/media/${encodeURIComponent(mediaAssetId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    libraryFor: (platformProjectId: string) =>
      `/library?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    uploadFor: (platformProjectId: string) =>
      `/upload?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    analysesFor: (platformProjectId: string) =>
      `/analyses?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    cutsFor: (platformProjectId: string) =>
      `/cuts?platformProjectId=${encodeURIComponent(platformProjectId)}`,
  },
} as const

export const pathLibrary = paths.routes.library
export const pathLogin = paths.routes.login
export const platformProjectQueryParam = 'platformProjectId'
