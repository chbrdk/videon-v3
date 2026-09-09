'use client'

import { AspectRatioGlyph, ToggleGroup, aspectRatioGlyphId } from '@msqdx/ui'

export type AspectPresetOption<T extends string> = {
  value: T
  label: string
}

type AspectPresetChipsProps<T extends string> = {
  value: T
  options: AspectPresetOption<T>[]
  ariaLabel: string
  disabled?: boolean
  onChange: (value: T) => void
}

/** Icon ToggleGroup for canvas / reframe aspect presets (9:16, 16:9, 1:1, custom). */
export function AspectPresetChips<T extends string>({
  value,
  options,
  ariaLabel,
  disabled,
  onChange,
}: AspectPresetChipsProps<T>) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      size="sm"
      variant="icon"
      value={value}
      onChange={(next) => {
        if (disabled) return
        onChange(next as T)
      }}
      options={options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        disabled,
        icon: (
          <AspectRatioGlyph
            id={aspectRatioGlyphId(opt.value === 'custom' ? 'custom' : opt.value)}
          />
        ),
      }))}
    />
  )
}
