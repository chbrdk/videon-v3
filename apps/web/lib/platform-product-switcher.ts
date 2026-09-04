import type { ProductSwitcherItem } from '../../../../msqdx-ui/packages/ui/src/components/ProductSwitcherPanel'
import { paths } from './paths'

function productOrigin(envKey: string, fallback: string): string {
  const raw = process.env[envKey]?.trim()
  return (raw || fallback).replace(/\/$/, '')
}

function plexonPublicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PLEXON_URL?.trim() ||
    process.env.NEXT_PLEXON_BASE_URL?.trim() ||
    paths.ecosystemStagingPlexon
  ).replace(/\/$/, '')
}

/** Static federated product list for BrandCorner launcher. */
export function getStaticProductSwitcherItems(): ProductSwitcherItem[] {
  const plexon = plexonPublicBaseUrl()
  const items: ProductSwitcherItem[] = [
    { id: 'plexon', label: 'PLEXON', href: plexon },
    {
      id: 'audion',
      label: 'AUDION',
      href: productOrigin(paths.envAudionPublicUrl, paths.ecosystemStagingAudion),
    },
    {
      id: 'checkion',
      label: 'CHECKION',
      href: productOrigin(paths.envCheckionPublicUrl, paths.ecosystemStagingCheckion),
    },
    {
      id: 'brandion',
      label: 'BRANDION',
      href: productOrigin(paths.envBrandionPublicUrl, paths.ecosystemStagingBrandion),
    },
    {
      id: 'creation',
      label: 'CREATION',
      href: productOrigin(paths.envCreationPublicUrl, paths.ecosystemStagingCreation),
    },
    {
      id: 'echon',
      label: 'ECHON',
      href: productOrigin(paths.envEchonPublicUrl, paths.ecosystemStagingEchon),
    },
    {
      id: 'videon',
      label: 'VIDEON',
      href: productOrigin(paths.envVideonPublicUrl, paths.ecosystemStagingVideon),
    },
    {
      id: 'spirion',
      label: 'SPIRION',
      href: productOrigin(paths.envSpirionPublicUrl, paths.ecosystemStagingSpirion),
    },
  ]
  return items.filter((item) => Boolean(item.href))
}

export function plexonProductsCatalogUrl(): string | null {
  const base = plexonPublicBaseUrl()
  if (!base) return null
  return `${base}${paths.plexonProductsPath}`
}
