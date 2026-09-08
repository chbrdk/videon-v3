import type { ReactNode } from 'react'

function NavSvg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="ui-icon"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function NavIconOverview() {
  return (
    <NavSvg>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </NavSvg>
  )
}

/** Projects — shared folder glyph (Checkion/Audion/Brandion). */
export function NavIconProjects() {
  return (
    <NavSvg>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9l-.81-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </NavSvg>
  )
}

/** Chat — message bubble (Audion). */
export function NavIconChat() {
  return (
    <NavSvg>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </NavSvg>
  )
}

/** @deprecated Prefer NavIconProjects for the Projekte rail item. */
export function NavIconCollection() {
  return <NavIconProjects />
}

export function NavIconLibrary() {
  return (
    <NavSvg>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M10 9.5 15 12l-5 2.5V9.5Z" />
    </NavSvg>
  )
}

export function NavIconCuts() {
  return (
    <NavSvg>
      <path d="M6 4h12v16H6z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </NavSvg>
  )
}

export function NavIconUpload() {
  return (
    <NavSvg>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 20h16" />
    </NavSvg>
  )
}

export function NavIconAnalyses() {
  return (
    <NavSvg>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-4" />
      <path d="M12 15V8" />
      <path d="M16 15v-7" />
    </NavSvg>
  )
}
