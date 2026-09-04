'use client'

import { useMemo } from 'react'
import { BrandCornerProductMenu } from '../lib/msqdx-ui-shell'
import { paths } from '../lib/paths'
import {
  getStaticProductSwitcherItems,
  plexonProductsCatalogUrl,
} from '../lib/platform-product-switcher'

export function ShellBrandCorner() {
  const items = useMemo(() => getStaticProductSwitcherItems(), [])
  const catalogUrl = useMemo(() => plexonProductsCatalogUrl(), [])

  return (
    <BrandCornerProductMenu
      label={paths.brandLabel}
      currentProductId={paths.productId}
      items={items}
      menuLabel="Produkte"
      footer={
        catalogUrl ? (
          <a href={catalogUrl} target="_blank" rel="noopener noreferrer">
            Alle Produkte
          </a>
        ) : null
      }
    />
  )
}
