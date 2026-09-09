export const paths = {
  appName: 'VIDEON v3',
  brandLabel: 'VIDEON',
  productId: 'videon' as const,
  federationContract: '2026-05-plexon-federation-v3',
  devPort: 3010,
  defaultDisplayName: 'VIDEON',
  displayNameStorageKey: 'videon.v3.displayName',
  themeStorageKey: 'videon.v3.themePreference',
  accentStorageKey: 'videon.v3.accentPreference',
  localeStorageKey: 'videon.v3.locale',
  /** First paint + unset prefs — light to match operator-facing Collection products. */
  defaultTheme: 'light' as const,
  defaultLocale: 'de' as const,
  themeChoices: ['light', 'dark', 'auto'] as const,
  localeChoices: ['en', 'de'] as const,
  i18nLibPath: 'apps/web/lib/i18n.ts',
  localesDir: 'apps/web/locales',
  i18nKnowledgePath: 'knowledge/i18n.md',
  /** Legacy NavRail metrics — product chrome is horizontal top nav (CREATION P67); zeroed for shellFrameStyle. */
  railInsetRem: 0,
  railGapRem: 0,
  railWidthRem: 0,
  mainGutterRem: 2.5,
  /** AppFrame data-rail-edge; padding overridden by `.videon-app-frame--top-chrome`. */
  railDockEdge: 'left' as const,
  railDockStorageKey: 'videon.v3.railDock',
  hubIndexLayoutKey: 'videon.v3.hubIndexLayout',
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
  /** Server-side Brandion origin (prefer over public URL). */
  envBrandionApiUrl: 'BRANDION_API_URL',
  brandionActivePackPath: '/api/guidelines/active-pack',
  brandionAnalysisRunsPath: (guidelineId: string) =>
    `/api/guidelines/${encodeURIComponent(guidelineId)}/analysis-runs`,
  activePackQueryKey: 'platformProjectId' as const,
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
  /** Browser iframe origin for central assistant (falls back to base/auth). */
  envPlexonPublicUrl: 'NEXT_PUBLIC_PLEXON_URL',
  pathAssistantEmbed: '/assistant/embed',
  pathAssistantExpand: '/assistant',
  envPlexonBaseUrl: 'NEXT_PLEXON_BASE_URL',
  envPlexonAuthUrl: 'PLEXON_AUTH_URL',
  envAuthSecret: 'AUTH_SECRET',
  envDatabaseUrl: 'DATABASE_URL',
  envObjectStorageRegion: 'VIDEON_OBJECT_STORAGE_REGION',
  envObjectStorageBucket: 'VIDEON_OBJECT_STORAGE_BUCKET',
  envObjectStorageEndpoint: 'VIDEON_OBJECT_STORAGE_ENDPOINT',
  /** Browser-facing S3 endpoint for signed PUT/GET when the private endpoint is internal-only. */
  envObjectStoragePublicEndpoint: 'VIDEON_OBJECT_STORAGE_PUBLIC_ENDPOINT',
  envObjectStorageAccessKeyId: 'VIDEON_OBJECT_STORAGE_ACCESS_KEY_ID',
  envObjectStorageSecretAccessKey: 'VIDEON_OBJECT_STORAGE_SECRET_ACCESS_KEY',
  envObjectStorageForcePathStyle: 'VIDEON_OBJECT_STORAGE_FORCE_PATH_STYLE',
  /** Extra CORS AllowedOrigins (comma-separated) for browser uploads. */
  envObjectStorageCorsOrigins: 'VIDEON_OBJECT_STORAGE_CORS_ORIGINS',
  envOpenRouterApiKey: 'OPENROUTER_API_KEY',
  envOpenRouterApiBaseUrl: 'OPENROUTER_API_BASE_URL',
  envVisionDefaultModel: 'VIDEON_VISION_DEFAULT_MODEL',
  envVisionSchemaFallbackModel: 'VIDEON_VISION_SCHEMA_FALLBACK_MODEL',
  envVisionDirectVideoEnabled: 'VIDEON_VISION_DIRECT_VIDEO_ENABLED',
  envOpenRouterDataCollection: 'VIDEON_OPENROUTER_DATA_COLLECTION',
  envOpenRouterRequireZdr: 'VIDEON_OPENROUTER_REQUIRE_ZDR',
  envTranscriptionEnabled: 'VIDEON_TRANSCRIPTION_ENABLED',
  envTranscriptionProvider: 'VIDEON_TRANSCRIPTION_PROVIDER',
  envTranscriptionOpenRouterModel: 'VIDEON_TRANSCRIPTION_OPENROUTER_MODEL',
  envWhisperModel: 'VIDEON_WHISPER_MODEL',
  envWhisperLanguage: 'VIDEON_WHISPER_LANGUAGE',
  /** Always-on stem worker base URL (no trailing slash), e.g. http://videon-stem-worker:8091 */
  envStemServiceUrl: 'VIDEON_STEM_SERVICE_URL',
  /** Always-on reframe worker base URL (no trailing slash), e.g. http://videon-reframe-worker:8092 */
  envReframeServiceUrl: 'VIDEON_REFRAME_SERVICE_URL',
  /** Settings API tokens for MCP / machine clients (`videon_` + 64 hex). */
  apiTokenPrefix: 'videon_' as const,
  apiTokenBytes: 32,
  apiTokenFixtureOwnerId: 'videon-fixture-owner',
  routes: {
    home: '/',
    chat: '/chat',
    library: '/library',
    upload: '/upload',
    analyses: '/analyses',
    cuts: '/cuts',
    settings: '/settings',
    login: '/login',
    /** Projekte hub (Access Model B) — UI copy says Projekt. */
    projects: '/projects',
    /** @deprecated Alias — redirects to `/projects`. */
    collections: '/collections',
    apiCollections: '/api/collections',
    apiTokens: '/api/tokens',
    apiTokenDetail: (tokenId: string) => `/api/tokens/${encodeURIComponent(tokenId)}`,
    apiTokenVerify: '/api/tokens/verify',
    apiMedia: '/api/media',
    apiMediaList: (platformProjectId: string) =>
      `/api/media?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaListAccessible: '/api/media',
    apiMediaSearchAccessible: (query: string) =>
      `/api/media/search?q=${encodeURIComponent(query)}`,
    apiAnalyses: '/api/analyses',
    apiMediaUploadIntent: '/api/media/upload-intent',
    apiMediaUpload: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/upload?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaUploadPart: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/upload-part?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaComplete: (mediaAssetId: string) => `/api/media/${encodeURIComponent(mediaAssetId)}/complete`,
    apiMediaDetail: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaPlayback: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/playback?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaStream: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/stream?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaFrame: (
      mediaAssetId: string,
      platformProjectId: string,
      tMs?: number,
      maxWidth?: number,
    ) => {
      const params = new URLSearchParams({ platformProjectId })
      if (tMs != null && Number.isFinite(tMs) && tMs >= 0) params.set('t', String(Math.floor(tMs)))
      if (maxWidth != null && Number.isFinite(maxWidth) && maxWidth > 0) {
        params.set('w', String(Math.floor(maxWidth)))
      }
      return `/api/media/${encodeURIComponent(mediaAssetId)}/frame?${params.toString()}`
    },
    apiMediaPeaksBackfill: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/peaks-backfill?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaPreview: (
      mediaAssetId: string,
      platformProjectId: string,
      opts?: { tMs?: number; durationMs?: number },
    ) => {
      const params = new URLSearchParams({ platformProjectId })
      if (opts?.tMs != null && Number.isFinite(opts.tMs) && opts.tMs >= 0) {
        params.set('t', String(Math.floor(opts.tMs)))
      }
      if (opts?.durationMs != null && Number.isFinite(opts.durationMs) && opts.durationMs > 0) {
        params.set('durationMs', String(Math.floor(opts.durationMs)))
      }
      return `/api/media/${encodeURIComponent(mediaAssetId)}/preview?${params.toString()}`
    },
    apiMediaStemStream: (
      mediaAssetId: string,
      stemKind: 'voice' | 'music',
      platformProjectId: string,
      options?: { download?: boolean },
    ) => {
      const base = `/api/media/${encodeURIComponent(mediaAssetId)}/stems/${encodeURIComponent(stemKind)}/stream?platformProjectId=${encodeURIComponent(platformProjectId)}`
      return options?.download ? `${base}&download=1` : base
    },
    apiMediaAnalysis: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/analysis?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaBrandCheck: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/brand-check?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaReframe: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/reframe?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaReframes: (mediaAssetId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/reframes?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaReframeDetail: (mediaAssetId: string, reframeId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/reframes/${encodeURIComponent(reframeId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaReframeDownload: (mediaAssetId: string, reframeId: string, platformProjectId: string) =>
      `/api/media/${encodeURIComponent(mediaAssetId)}/reframes/${encodeURIComponent(reframeId)}/download?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiMediaSearch: (platformProjectId: string, query: string) =>
      `/api/media/search?platformProjectId=${encodeURIComponent(platformProjectId)}&q=${encodeURIComponent(query)}`,
    apiCuts: (platformProjectId: string) =>
      `/api/cuts?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiCutDetail: (cutId: string, platformProjectId: string) =>
      `/api/cuts/${encodeURIComponent(cutId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiCutExports: (cutId: string, platformProjectId: string) =>
      `/api/cuts/${encodeURIComponent(cutId)}/exports?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    apiCutExportDetail: (cutId: string, exportId: string, platformProjectId: string) =>
      `/api/cuts/${encodeURIComponent(cutId)}/exports/${encodeURIComponent(exportId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    cutFor: (cutId: string, platformProjectId: string) =>
      `/cuts/${encodeURIComponent(cutId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    cutExportFor: (cutId: string, exportId: string, platformProjectId: string) =>
      `/cuts/${encodeURIComponent(cutId)}/exports/${encodeURIComponent(exportId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
    mediaFor: (
      mediaAssetId: string,
      platformProjectId: string,
      opts?: { tMs?: number | null; sceneKey?: string | null },
    ) => {
      const params = new URLSearchParams({
        platformProjectId,
      })
      if (opts?.tMs != null && Number.isFinite(opts.tMs) && opts.tMs >= 0) {
        params.set('t', String(Math.floor(opts.tMs)))
      }
      if (opts?.sceneKey?.trim()) {
        params.set('scene', opts.sceneKey.trim())
      }
      return `/media/${encodeURIComponent(mediaAssetId)}?${params.toString()}`
    },
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
