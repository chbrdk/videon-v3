import { redirect } from 'next/navigation'
import { paths } from '@/lib/paths'

export const dynamic = 'force-dynamic'

/** Legacy alias — Projekte hub lives at `/projects`. */
export default function CollectionsAliasPage() {
  redirect(paths.routes.projects)
}
