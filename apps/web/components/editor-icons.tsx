type IconProps = { size?: number; className?: string }

function base(size: number, className?: string) {
  return { width: size, height: size, className, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true as const }
}

export function IconPlay({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 5.14v13.72c0 .79.87 1.27 1.54.84l11.02-6.86a1 1 0 0 0 0-1.7L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  )
}

export function IconPause({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 5h3v14H7V5Zm7 0h3v14h-3V5Z" />
    </svg>
  )
}

export function IconSkipBack({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 6v12l9-6-9-6Zm2 6 5.5 3.67V8.33L9 12Z" />
      <path d="M5 6v12H3V6h2Z" />
    </svg>
  )
}

export function IconSkipForward({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M17 6v12l-9-6 9-6Zm-2 6-5.5 3.67V8.33L15 12Z" />
      <path d="M19 6v12h2V6h-2Z" />
    </svg>
  )
}

export function IconFrameBack({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M11 7 6 12l5 5v-3h7v-4h-7V7Z" />
    </svg>
  )
}

export function IconFrameForward({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="m13 7 5 5-5 5v-3H6v-4h7V7Z" />
    </svg>
  )
}

export function IconMarkIn({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 5v14h2V5H5Zm4 0v14h2V5H9Zm8 0v14h2V5h-2Z" opacity="0.35" />
      <path d="M5 5v14h2V5H5Z" />
    </svg>
  )
}

export function IconMarkOut({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 5v14h2V5H5Zm4 0v14h2V5H9Z" opacity="0.35" />
      <path d="M17 5v14h2V5h-2Z" />
    </svg>
  )
}

export function IconSplit({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3v18M5 7h4M5 17h4M15 7h4M15 17h4" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  )
}

export function IconUndo({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M9 8H5.5A3.5 3.5 0 0 0 2 11.5v0A3.5 3.5 0 0 0 5.5 15H9M9 8 6 5M9 8l-3 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function IconRedo({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M15 8h3.5A3.5 3.5 0 0 1 22 11.5v0a3.5 3.5 0 0 1-3.5 3.5H15M15 8l3-3M15 8l3 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}
