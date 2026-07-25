import { redirect } from 'next/navigation'

export default async function LegacySkillMapPage({ searchParams }: { searchParams: Promise<{ theory?: string }> }) {
  const params = await searchParams
  redirect(params.theory ? `/learn?theory=${params.theory}` : '/learn')
}
